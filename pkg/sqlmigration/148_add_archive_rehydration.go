package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addArchiveRehydration records restorations of the archive (ADR 0002 §9), with the
// effective DDL each was loaded with.
type addArchiveRehydration struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddArchiveRehydrationFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_archive_rehydration"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addArchiveRehydration{sqlschema: sqlschema}, nil
	})
}

func (migration *addArchiveRehydration) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addArchiveRehydration) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	column := func(name sqlschema.ColumnName, dataType sqlschema.DataType) *sqlschema.Column {
		return &sqlschema.Column{Name: name, DataType: dataType, Nullable: false}
	}
	table := &sqlschema.Table{
		Name: "archive_rehydration",
		Columns: []*sqlschema.Column{
			column("id", sqlschema.DataTypeText),
			column("signal", sqlschema.DataTypeText),
			column("range_start", sqlschema.DataTypeTimestamp),
			column("range_end", sqlschema.DataTypeTimestamp),
			column("status", sqlschema.DataTypeText),
			column("expires_at", sqlschema.DataTypeTimestamp),
			column("created_by", sqlschema.DataTypeText),
			column("bytes", sqlschema.DataTypeBigInt),
			column("rows", sqlschema.DataTypeBigInt),
			column("ddl", sqlschema.DataTypeText),
			column("failure_reason", sqlschema.DataTypeText),
			column("failure_message", sqlschema.DataTypeText),
			column("created_at", sqlschema.DataTypeTimestamp),
			column("updated_at", sqlschema.DataTypeTimestamp),
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
	}

	sqls := migration.sqlschema.Operator().CreateTable(table)
	sqls = append(sqls, []byte("CREATE INDEX IF NOT EXISTS idx_archive_rehydration_signal_status ON archive_rehydration (signal, status)"))
	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addArchiveRehydration) Down(context.Context, *bun.DB) error {
	return nil
}
