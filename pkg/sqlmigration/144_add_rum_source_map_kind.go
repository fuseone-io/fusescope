package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addRUMSourceMapKind tells the symbolication artifacts of a release apart:
// browser source maps, which every row held so far, and R8 mappings.
type addRUMSourceMapKind struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddRUMSourceMapKindFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_rum_source_map_kind"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addRUMSourceMapKind{sqlschema: sqlschema}, nil
	})
}

func (migration *addRUMSourceMapKind) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addRUMSourceMapKind) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	table, uniqueConstraints, err := migration.sqlschema.GetTable(ctx, sqlschema.TableName("rum_source_map"))
	if err != nil {
		return err
	}

	// Nullable, so SQLite adds the column in place instead of recreating the
	// table; the default fills existing rows on both dialects.
	column := &sqlschema.Column{
		Name:     sqlschema.ColumnName("kind"),
		DataType: sqlschema.DataTypeText,
		Nullable: true,
		Default:  "'source-map'",
	}
	for _, sql := range migration.sqlschema.Operator().AddColumn(table, uniqueConstraints, column, nil) {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addRUMSourceMapKind) Down(context.Context, *bun.DB) error {
	return nil
}
