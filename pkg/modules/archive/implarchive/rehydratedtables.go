package implarchive

import (
	"context"
	"slices"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	tableSchemasQuery  = "SELECT name, engine, engine_full, sorting_key, primary_key FROM system.tables WHERE database = ? AND name IN (?)"
	columnSchemasQuery = "SELECT table, name, type, default_kind, default_expression, compression_codec, comment FROM system.columns WHERE database = ? AND table IN (?) ORDER BY table, position"
)

// ensureTables creates the set's rehydrated tables, or adds the columns their live tables
// gained, and returns the DDL it issued with the columns each local table now has.
func (restorer *restorer) ensureTables(ctx context.Context, set restoreSet) ([]string, map[string][]archivetypes.SchemaColumn, error) {
	var names []string
	for _, table := range set.tables {
		names = append(names, table.local, table.distributed, archivetypes.RehydratedTableName(table.local), archivetypes.RehydratedTableName(table.distributed))
	}
	schemas, err := restorer.readSchemas(ctx, set.database, names)
	if err != nil {
		return nil, nil, err
	}

	var issued []string
	columns := make(map[string][]archivetypes.SchemaColumn, len(set.tables))
	for _, table := range set.tables {
		ddl, err := tableDDL(schemas, table)
		if err != nil {
			return nil, nil, err
		}
		for _, statement := range ddl {
			executed, err := restorer.execDDL(ctx, statement)
			if err != nil {
				return nil, nil, err
			}
			issued = append(issued, executed)
		}
		columns[table.local] = targetColumns(schemas[table.local], schemas[archivetypes.RehydratedTableName(table.local)])
	}

	return issued, columns, nil
}

// execDDL is the one way restoration DDL reaches ClickHouse; Statement refuses any table
// outside rehydrated_*.
func (restorer *restorer) execDDL(ctx context.Context, ddl archivetypes.RehydrationDDL) (string, error) {
	statement, err := ddl.Statement(restorer.telemetryStore.Cluster())
	if err != nil {
		return "", err
	}
	if err := restorer.telemetryStore.ClickhouseDB().Exec(ctx, statement); err != nil {
		return "", errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't change %s; restorations need CREATE TABLE, ALTER TABLE and DROP TABLE on rehydrated_* tables", ddl.Table)
	}
	return statement, nil
}

// dropRehydration drops the restoration's partition from every rehydrated table of the set
// that exists. Nothing else writes that partition.
func (restorer *restorer) dropRehydration(ctx context.Context, set restoreSet, id valuer.UUID) error {
	names := make([]string, len(set.tables))
	for i, table := range set.tables {
		names[i] = archivetypes.RehydratedTableName(table.local)
	}
	schemas, err := restorer.readSchemas(ctx, set.database, names)
	if err != nil {
		return err
	}

	for _, name := range names {
		if _, ok := schemas[name]; !ok {
			continue
		}
		if _, err := restorer.execDDL(ctx, archivetypes.NewDropRehydrationDDL(set.database, name, id.StringValue())); err != nil {
			return err
		}
	}
	return nil
}

func (restorer *restorer) readSchemas(ctx context.Context, database string, names []string) (map[string]archivetypes.TableSchema, error) {
	conn := restorer.telemetryStore.ClickhouseDB()
	schemas := map[string]archivetypes.TableSchema{}

	rows, err := conn.Query(ctx, tableSchemasQuery, database, names)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the tables of %s", database)
	}
	defer rows.Close()
	for rows.Next() {
		schema := archivetypes.TableSchema{Database: database}
		if err := rows.Scan(&schema.Name, &schema.Engine, &schema.EngineFull, &schema.SortingKey, &schema.PrimaryKey); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the tables of %s", database)
		}
		schemas[schema.Name] = schema
	}

	columns, err := conn.Query(ctx, columnSchemasQuery, database, names)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the columns of %s", database)
	}
	defer columns.Close()
	for columns.Next() {
		var table string
		var column archivetypes.SchemaColumn
		if err := columns.Scan(&table, &column.Name, &column.Type, &column.DefaultKind, &column.DefaultExpression, &column.Codec, &column.Comment); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the columns of %s", database)
		}
		if schema, ok := schemas[table]; ok {
			schema.Columns = append(schema.Columns, column)
			schemas[table] = schema
		}
	}

	return schemas, nil
}

func tableDDL(schemas map[string]archivetypes.TableSchema, table restoreTable) ([]archivetypes.RehydrationDDL, error) {
	live, ok := schemas[table.local]
	liveDistributed, distributedOK := schemas[table.distributed]
	if !ok || !distributedOK {
		return nil, errors.Newf(errors.TypeNotFound, errors.CodeNotFound, "%s or %s doesn't exist", table.local, table.distributed)
	}

	var ddl []archivetypes.RehydrationDDL
	for _, pair := range []struct {
		live       archivetypes.TableSchema
		rehydrated string
		create     func(archivetypes.TableSchema) (archivetypes.RehydrationDDL, error)
	}{
		{live: live, rehydrated: archivetypes.RehydratedTableName(table.local), create: archivetypes.NewRehydratedTableDDL},
		{live: liveDistributed, rehydrated: archivetypes.RehydratedTableName(table.distributed), create: archivetypes.NewRehydratedDistributedDDL},
	} {
		// Issued even when the table exists, so every restoration records its full DDL.
		created, err := pair.create(pair.live)
		if err != nil {
			return nil, err
		}
		ddl = append(ddl, created)

		// A Distributed table's columns follow the live local table, like the table it reads.
		if existing, exists := schemas[pair.rehydrated]; exists {
			if added, ok := archivetypes.NewAddColumnsDDL(live, existing); ok {
				ddl = append(ddl, added)
			}
		}
	}

	return ddl, nil
}

// targetColumns is what a rehydrated table holds once ensured: the live columns, then any
// it kept from an older live schema.
func targetColumns(live archivetypes.TableSchema, rehydrated archivetypes.TableSchema) []archivetypes.SchemaColumn {
	columns := slices.Clone(live.Columns)
	for _, column := range rehydrated.Columns {
		if !slices.ContainsFunc(columns, func(existing archivetypes.SchemaColumn) bool { return existing.Name == column.Name }) {
			columns = append(columns, column)
		}
	}
	return columns
}
