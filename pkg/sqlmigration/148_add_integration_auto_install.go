package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addIntegrationAutoInstall records, per organization, what the backend did
// about each integration it is configured to install by itself: pending,
// done, failed with the next attempt, or suppressed because the
// organization uninstalled it.
type addIntegrationAutoInstall struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddIntegrationAutoInstallFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_integration_auto_install"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addIntegrationAutoInstall{sqlschema: sqlschema}, nil
	})
}

func (migration *addIntegrationAutoInstall) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addIntegrationAutoInstall) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	sqls := migration.sqlschema.Operator().CreateTable(&sqlschema.Table{
		Name: "integration_auto_install",
		Columns: []*sqlschema.Column{
			{Name: "org_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "integration", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "state", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "attempts", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "last_error", DataType: sqlschema.DataTypeText, Nullable: false, Default: "''"},
			{Name: "last_attempt_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "next_attempt_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "done_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			// The catalog version installed when it was done.
			{Name: "version", DataType: sqlschema.DataTypeText, Nullable: false, Default: "''"},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"org_id", "integration"}},
	})
	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (migration *addIntegrationAutoInstall) Down(context.Context, *bun.DB) error {
	return nil
}
