package sqlmigration

import (
	"context"
	"fmt"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

type addArchive struct {
	sqlstore  sqlstore.SQLStore
	sqlschema sqlschema.SQLSchema
}

func NewAddArchiveFactory(sqlstore sqlstore.SQLStore, sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_archive"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addArchive{sqlstore: sqlstore, sqlschema: sqlschema}, nil
	})
}

func (migration *addArchive) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addArchive) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	operator := migration.sqlschema.Operator()
	var sqls [][]byte

	for _, table := range archiveTables() {
		sqls = append(sqls, operator.CreateTable(table.table)...)
		for _, columns := range table.unique {
			sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{TableName: table.table.Name, ColumnNames: columns})...)
		}
		for _, columns := range table.index {
			sqls = append(sqls, createIndexSQL(table.table.Name, columns))
		}
	}

	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addArchive) Down(context.Context, *bun.DB) error {
	return nil
}

type archiveTable struct {
	table  *sqlschema.Table
	unique [][]sqlschema.ColumnName
	index  [][]sqlschema.ColumnName
}

func archiveTables() []archiveTable {
	text := func(name sqlschema.ColumnName) *sqlschema.Column {
		return &sqlschema.Column{Name: name, DataType: sqlschema.DataTypeText, Nullable: false}
	}
	bigint := func(name sqlschema.ColumnName) *sqlschema.Column {
		return &sqlschema.Column{Name: name, DataType: sqlschema.DataTypeBigInt, Nullable: false}
	}
	integer := func(name sqlschema.ColumnName) *sqlschema.Column {
		return &sqlschema.Column{Name: name, DataType: sqlschema.DataTypeInteger, Nullable: false}
	}
	timestamp := func(name sqlschema.ColumnName, nullable bool) *sqlschema.Column {
		return &sqlschema.Column{Name: name, DataType: sqlschema.DataTypeTimestamp, Nullable: nullable}
	}
	newTable := func(name sqlschema.TableName, columns []*sqlschema.Column, foreignKeys ...*sqlschema.ForeignKeyConstraint) *sqlschema.Table {
		columns = append([]*sqlschema.Column{text("id")}, columns...)
		columns = append(columns, timestamp("created_at", false), timestamp("updated_at", false))
		return &sqlschema.Table{
			Name:                  name,
			Columns:               columns,
			PrimaryKeyConstraint:  &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
			ForeignKeyConstraints: foreignKeys,
		}
	}
	partColumns := func() []*sqlschema.Column {
		return []*sqlschema.Column{text("table_name"), integer("shard"), text("partition_id"), text("part_name"), bigint("min_block"), bigint("max_block"), bigint("data_version"), bigint("rows")}
	}
	references := func(column sqlschema.ColumnName, table sqlschema.TableName) *sqlschema.ForeignKeyConstraint {
		return &sqlschema.ForeignKeyConstraint{ReferencingColumnName: column, ReferencedTableName: table, ReferencedColumnName: "id"}
	}
	partKey := []sqlschema.ColumnName{"table_name", "shard", "partition_id", "part_name"}

	return []archiveTable{
		{
			table:  newTable("archive_signal", []*sqlschema.Column{text("signal"), integer("backstop_days"), timestamp("applied_at", true), timestamp("extended_at", true)}),
			unique: [][]sqlschema.ColumnName{{"signal"}},
		},
		{
			table:  newTable("archive_lease", []*sqlschema.Column{text("signal"), text("holder"), bigint("epoch"), timestamp("expires_at", false)}),
			unique: [][]sqlschema.ColumnName{{"signal"}},
		},
		{
			table: newTable("archive_cycle", []*sqlschema.Column{text("signal"), bigint("epoch"), text("status"), timestamp("started_at", false), timestamp("finished_at", true)}),
			index: [][]sqlschema.ColumnName{{"signal", "started_at"}},
		},
		{
			table: newTable("archive_attempt", []*sqlschema.Column{
				text("signal"), text("kind"), text("table_name"), integer("shard"), text("partition_id"), bigint("epoch"), text("status"),
				text("named_collection"), text("prefix"), integer("format_version"), text("column_mapping"), text("manifest_key"), text("manifest_sha256"),
			}),
			index: [][]sqlschema.ColumnName{{"table_name", "shard", "partition_id", "status"}},
		},
		{
			table:  newTable("archive_object", []*sqlschema.Column{text("attempt_id"), text("named_collection"), text("object_key"), bigint("bytes"), text("etag"), bigint("rows"), text("status")}, references("attempt_id", "archive_attempt")),
			unique: [][]sqlschema.ColumnName{{"named_collection", "object_key"}},
			index:  [][]sqlschema.ColumnName{{"status"}},
		},
		{
			table: newTable("archive_part",
				append(partColumns(), text("object_id"), text("attempt_id"), text("status"), timestamp("dropped_at", true)),
				references("object_id", "archive_object"), references("attempt_id", "archive_attempt"),
			),
			unique: [][]sqlschema.ColumnName{partKey},
			index:  [][]sqlschema.ColumnName{{"object_id"}},
		},
		{
			table:  newTable("archive_inventory", append(partColumns(), text("cycle_id"), timestamp("first_seen_at", false), timestamp("last_seen_at", false)), references("cycle_id", "archive_cycle")),
			unique: [][]sqlschema.ColumnName{partKey},
		},
		{
			// Shard numbers are positions in remote_servers; the replica path pins each to its data.
			table:  newTable("archive_shard", []*sqlschema.Column{text("table_name"), integer("shard"), text("replica_path")}),
			unique: [][]sqlschema.ColumnName{{"table_name", "shard"}, {"table_name", "replica_path"}},
		},
		{
			table: newTable("archive_loss", append(partColumns(), text("kind"), timestamp("detected_at", false))),
		},
	}
}

func createIndexSQL(table sqlschema.TableName, columns []sqlschema.ColumnName) []byte {
	names := make([]string, len(columns))
	for i, column := range columns {
		names[i] = string(column)
	}
	return []byte(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_%s_%s ON %s (%s)", table, strings.Join(names, "_"), table, strings.Join(names, ", ")))
}
