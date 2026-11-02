package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addArchiveBackstopTable records how far the archive backstop got on each table, so a
// retry doesn't materialize the TTL of a table that already carries it.
type addArchiveBackstopTable struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddArchiveBackstopTableFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_archive_backstop_table"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addArchiveBackstopTable{sqlschema: sqlschema}, nil
	})
}

func (migration *addArchiveBackstopTable) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addArchiveBackstopTable) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	text := func(name sqlschema.ColumnName) *sqlschema.Column {
		return &sqlschema.Column{Name: name, DataType: sqlschema.DataTypeText, Nullable: false}
	}
	timestamp := func(name sqlschema.ColumnName, nullable bool) *sqlschema.Column {
		return &sqlschema.Column{Name: name, DataType: sqlschema.DataTypeTimestamp, Nullable: nullable}
	}
	table := &sqlschema.Table{
		Name: "archive_backstop_table",
		Columns: []*sqlschema.Column{
			text("id"), text("signal"), text("table_name"),
			{Name: "backstop_days", DataType: sqlschema.DataTypeInteger, Nullable: false},
			timestamp("modified_at", true), timestamp("materialized_at", true),
			timestamp("created_at", false), timestamp("updated_at", false),
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
	}

	operator := migration.sqlschema.Operator()
	sqls := operator.CreateTable(table)
	sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{TableName: table.Name, ColumnNames: []sqlschema.ColumnName{"signal", "table_name"}})...)
	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addArchiveBackstopTable) Down(context.Context, *bun.DB) error {
	return nil
}
