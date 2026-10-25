package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addInstalledIntegrationVersion pins each installation to a catalog package
// version. Installations made before the catalog served version 1.0.0, so
// existing rows and the column default are 1.0.0.
type addInstalledIntegrationVersion struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddInstalledIntegrationVersionFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_integration_version"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addInstalledIntegrationVersion{sqlschema: sqlschema}, nil
	})
}

func (migration *addInstalledIntegrationVersion) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addInstalledIntegrationVersion) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	table, uniqueConstraints, err := migration.sqlschema.GetTable(ctx, sqlschema.TableName("installed_integration"))
	if err != nil {
		return err
	}

	// Nullable, so SQLite adds the column in place instead of recreating the
	// table; the default fills existing rows on both dialects.
	column := &sqlschema.Column{
		Name:     sqlschema.ColumnName("version"),
		DataType: sqlschema.DataTypeText,
		Nullable: true,
		Default:  "'1.0.0'",
	}
	for _, sql := range migration.sqlschema.Operator().AddColumn(table, uniqueConstraints, column, nil) {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addInstalledIntegrationVersion) Down(context.Context, *bun.DB) error {
	return nil
}
