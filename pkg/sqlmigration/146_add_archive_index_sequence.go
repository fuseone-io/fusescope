package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addArchiveIndexSequence counts each table's archive commits, so index keys keep rising
// when attempt rows are compacted or cleaned up.
type addArchiveIndexSequence struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddArchiveIndexSequenceFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_archive_index_sequence"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addArchiveIndexSequence{sqlschema: sqlschema}, nil
	})
}

func (migration *addArchiveIndexSequence) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addArchiveIndexSequence) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	table := &sqlschema.Table{
		Name: "archive_index_sequence",
		Columns: []*sqlschema.Column{
			{Name: "id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "table_name", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "sequence", DataType: sqlschema.DataTypeBigInt, Nullable: false},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
	}

	operator := migration.sqlschema.Operator()
	sqls := operator.CreateTable(table)
	sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{TableName: table.Name, ColumnNames: []sqlschema.ColumnName{"table_name"}})...)
	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addArchiveIndexSequence) Down(context.Context, *bun.DB) error {
	return nil
}
