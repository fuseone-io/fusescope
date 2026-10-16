package postgressqlschema

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
)

// trailingTypeCast matches a "::type" suffix such as ::text, ::character varying(255) or ::jsonb[].
var trailingTypeCast = regexp.MustCompile(`(?i)::[a-z_][a-z0-9_ ]*(\(\s*\d+(\s*,\s*\d+)?\s*\))?(\[\])?$`)

type provider struct {
	settings factory.ScopedProviderSettings
	fmter    sqlschema.SQLFormatter
	sqlstore sqlstore.SQLStore
	operator sqlschema.SQLOperator
}

func NewFactory(sqlstore sqlstore.SQLStore) factory.ProviderFactory[sqlschema.SQLSchema, sqlschema.Config] {
	return factory.NewProviderFactory(factory.MustNewName("postgres"), func(ctx context.Context, providerSettings factory.ProviderSettings, config sqlschema.Config) (sqlschema.SQLSchema, error) {
		return New(ctx, providerSettings, config, sqlstore)
	})
}

func New(_ context.Context, providerSettings factory.ProviderSettings, _ sqlschema.Config, sqlstore sqlstore.SQLStore) (sqlschema.SQLSchema, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/sqlschema/postgressqlschema")
	fmter := Formatter{sqlschema.NewFormatter(sqlstore.BunDB().Dialect())}

	return &provider{
		settings: settings,
		fmter:    fmter,
		sqlstore: sqlstore,
		operator: sqlschema.NewOperator(fmter, sqlschema.OperatorSupport{
			SCreateAndDropConstraint:                        true,
			SAlterTableAddAndDropColumnIfNotExistsAndExists: true,
			SAlterTableAlterColumnSetAndDrop:                true,
		}),
	}, nil
}

func (provider *provider) Formatter() sqlschema.SQLFormatter {
	return provider.fmter
}

func (provider *provider) Operator() sqlschema.SQLOperator {
	return provider.operator
}

func (provider *provider) GetTable(ctx context.Context, tableName sqlschema.TableName) (*sqlschema.Table, []*sqlschema.UniqueConstraint, error) {
	columns, err := provider.getColumns(ctx, tableName)
	if err != nil {
		return nil, nil, err
	}

	if len(columns) == 0 {
		return nil, nil, errors.Newf(errors.TypeNotFound, errors.CodeNotFound, "table (%s) not found", tableName)
	}

	table := &sqlschema.Table{Name: tableName, Columns: columns}
	uniqueConstraints := []*sqlschema.UniqueConstraint{}

	var rows []struct {
		Name                 string `bun:"name"`
		Type                 string `bun:"type"`
		Columns              string `bun:"columns"`
		ReferencedTableName  string `bun:"referenced_table_name"`
		ReferencedColumnName string `bun:"referenced_column_name"`
	}

	if err := provider.
		sqlstore.
		BunDB().
		NewRaw(`
			SELECT
				con.conname AS name,
				con.contype::text AS type,
				(
					SELECT array_to_json(array_agg(att.attname ORDER BY keys.ordinality))::text
					FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
					JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
				) AS columns,
				COALESCE(ref.relname, '') AS referenced_table_name,
				COALESCE((
					SELECT att.attname
					FROM pg_attribute att
					WHERE att.attrelid = con.confrelid AND att.attnum = con.confkey[1]
				), '') AS referenced_column_name
			FROM pg_constraint con
			JOIN pg_class tbl ON tbl.oid = con.conrelid
			JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
			LEFT JOIN pg_class ref ON ref.oid = con.confrelid
			WHERE ns.nspname = current_schema() AND tbl.relname = ? AND con.contype IN ('p', 'f', 'u')
			ORDER BY con.conname`, string(tableName)).
		Scan(ctx, &rows); err != nil {
		return nil, nil, err
	}

	for _, row := range rows {
		var columnNames []sqlschema.ColumnName
		if err := json.Unmarshal([]byte(row.Columns), &columnNames); err != nil {
			return nil, nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "cannot read columns of constraint (%s)", row.Name)
		}

		switch row.Type {
		case "p":
			table.PrimaryKeyConstraint = (&sqlschema.PrimaryKeyConstraint{ColumnNames: columnNames}).Named(row.Name).(*sqlschema.PrimaryKeyConstraint)
		case "f":
			// sqlschema models single-column foreign keys only.
			if len(columnNames) != 1 {
				continue
			}

			table.ForeignKeyConstraints = append(table.ForeignKeyConstraints, (&sqlschema.ForeignKeyConstraint{
				ReferencingColumnName: columnNames[0],
				ReferencedTableName:   sqlschema.TableName(row.ReferencedTableName),
				ReferencedColumnName:  sqlschema.ColumnName(row.ReferencedColumnName),
			}).Named(row.Name).(*sqlschema.ForeignKeyConstraint))
		case "u":
			uniqueConstraints = append(uniqueConstraints, (&sqlschema.UniqueConstraint{ColumnNames: columnNames}).Named(row.Name).(*sqlschema.UniqueConstraint))
		}
	}

	return table, uniqueConstraints, nil
}

func (provider *provider) GetIndices(ctx context.Context, tableName sqlschema.TableName) ([]sqlschema.Index, error) {
	var rows []struct {
		Name          string `bun:"name"`
		HasExpression bool   `bun:"has_expression"`
		Predicate     string `bun:"predicate"`
		Keys          string `bun:"keys"`
	}

	// Only unique indexes that do not back a constraint, like the sqlite provider.
	if err := provider.
		sqlstore.
		BunDB().
		NewRaw(`
			SELECT
				idx.relname AS name,
				ix.indexprs IS NOT NULL AS has_expression,
				COALESCE(pg_get_expr(ix.indpred, ix.indrelid), '') AS predicate,
				(
					SELECT array_to_json(array_agg(pg_get_indexdef(ix.indexrelid, k, true) ORDER BY k))::text
					FROM generate_series(1, ix.indnkeyatts) AS k
				) AS keys
			FROM pg_index ix
			JOIN pg_class idx ON idx.oid = ix.indexrelid
			JOIN pg_class tbl ON tbl.oid = ix.indrelid
			JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
			WHERE ns.nspname = current_schema()
				AND tbl.relname = ?
				AND ix.indisunique
				AND NOT ix.indisprimary
				AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = ix.indexrelid)
			ORDER BY idx.relname`, string(tableName)).
		Scan(ctx, &rows); err != nil {
		return nil, err
	}

	indices := []sqlschema.Index{}
	for _, row := range rows {
		var keys []string
		if err := json.Unmarshal([]byte(row.Keys), &keys); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "cannot read keys of index (%s)", row.Name)
		}

		// functional partial indexes aren't representable (PartialUniqueIndex has no expressions).
		if row.HasExpression && row.Predicate != "" {
			continue
		}

		var index sqlschema.Index
		switch {
		case row.HasExpression:
			index = &sqlschema.UniqueIndexWithExpressions{TableName: tableName, Expressions: keys}
		case row.Predicate != "":
			index = &sqlschema.PartialUniqueIndex{TableName: tableName, ColumnNames: toColumnNames(keys), Where: row.Predicate}
		default:
			index = &sqlschema.UniqueIndex{TableName: tableName, ColumnNames: toColumnNames(keys)}
		}

		if index.Name() != row.Name {
			index = index.Named(row.Name)
		}

		indices = append(indices, index)
	}

	return indices, nil
}

// ToggleFKEnforcement is a no-op: postgres cannot switch foreign key checks per
// session without superuser rights, and its in-place ALTER TABLE support means
// sqlschema never rebuilds tables here.
func (provider *provider) ToggleFKEnforcement(_ context.Context, _ bun.IDB, _ bool) error {
	return nil
}

func (provider *provider) getColumns(ctx context.Context, tableName sqlschema.TableName) ([]*sqlschema.Column, error) {
	var rows []struct {
		Name     string `bun:"name"`
		DataType string `bun:"data_type"`
		NotNull  bool   `bun:"not_null"`
		Default  string `bun:"default_expression"`
	}

	if err := provider.
		sqlstore.
		BunDB().
		NewRaw(`
			SELECT
				att.attname AS name,
				format_type(att.atttypid, att.atttypmod) AS data_type,
				att.attnotnull AS not_null,
				COALESCE(pg_get_expr(def.adbin, def.adrelid), '') AS default_expression
			FROM pg_attribute att
			JOIN pg_class tbl ON tbl.oid = att.attrelid
			JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
			LEFT JOIN pg_attrdef def ON def.adrelid = att.attrelid AND def.adnum = att.attnum
			WHERE ns.nspname = current_schema()
				AND tbl.relname = ?
				AND tbl.relkind IN ('r', 'p')
				AND att.attnum > 0
				AND NOT att.attisdropped
			ORDER BY att.attnum`, string(tableName)).
		Scan(ctx, &rows); err != nil {
		return nil, err
	}

	columns := make([]*sqlschema.Column, 0, len(rows))
	for _, row := range rows {
		columns = append(columns, &sqlschema.Column{
			Name:     sqlschema.ColumnName(row.Name),
			DataType: provider.fmter.DataTypeOf(row.DataType),
			Nullable: !row.NotNull,
			Default:  normalizeDefault(row.Default),
		})
	}

	return columns, nil
}

// normalizeDefault strips the type casts postgres adds to stored defaults, so
// 'x'::text and 'x'::character varying compare equal to the 'x' a migration declares.
func normalizeDefault(expression string) string {
	expression = strings.TrimSpace(expression)
	for {
		location := trailingTypeCast.FindStringIndex(expression)
		if location == nil {
			return expression
		}

		prefix := strings.TrimSpace(expression[:location[0]])
		// Only strip a cast that applies to the whole expression, not one inside a quoted literal.
		if prefix == "" || strings.Count(prefix, "'")%2 != 0 {
			return expression
		}

		expression = prefix
	}
}

func toColumnNames(keys []string) []sqlschema.ColumnName {
	columnNames := make([]sqlschema.ColumnName, 0, len(keys))
	for _, key := range keys {
		if len(key) >= 2 && key[0] == '"' && key[len(key)-1] == '"' {
			key = strings.ReplaceAll(key[1:len(key)-1], `""`, `"`)
		}

		columnNames = append(columnNames, sqlschema.ColumnName(key))
	}

	return columnNames
}
