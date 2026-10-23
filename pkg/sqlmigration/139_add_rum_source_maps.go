package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

type addRUMSourceMaps struct {
	sqlstore  sqlstore.SQLStore
	sqlschema sqlschema.SQLSchema
}

func NewAddRUMSourceMapsFactory(sqlstore sqlstore.SQLStore, sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_rum_source_maps"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addRUMSourceMaps{sqlstore: sqlstore, sqlschema: sqlschema}, nil
	})
}

func (migration *addRUMSourceMaps) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addRUMSourceMaps) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	operator := migration.sqlschema.Operator()
	sqls := operator.CreateTable(&sqlschema.Table{
		Name: "rum_source_map",
		Columns: []*sqlschema.Column{
			{Name: "id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "org_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "application_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "release_name", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "path", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "debug_id", DataType: sqlschema.DataTypeText, Nullable: false, Default: "''"},
			{Name: "size", DataType: sqlschema.DataTypeBigInt, Nullable: false},
			{Name: "created_by", DataType: sqlschema.DataTypeText, Nullable: false, Default: "''"},
			{Name: "last_used_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
		ForeignKeyConstraints: []*sqlschema.ForeignKeyConstraint{
			{ReferencingColumnName: "org_id", ReferencedTableName: "organizations", ReferencedColumnName: "id"},
			{ReferencingColumnName: "application_id", ReferencedTableName: "rum_application", ReferencedColumnName: "id"},
		},
	})
	sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{TableName: "rum_source_map", ColumnNames: []sqlschema.ColumnName{"application_id", "release_name", "path"}})...)

	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addRUMSourceMaps) Down(context.Context, *bun.DB) error {
	return nil
}
