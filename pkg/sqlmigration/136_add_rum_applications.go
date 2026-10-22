package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

type addRUMApplications struct {
	sqlstore  sqlstore.SQLStore
	sqlschema sqlschema.SQLSchema
}

func NewAddRUMApplicationsFactory(sqlstore sqlstore.SQLStore, sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_rum_applications"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addRUMApplications{sqlstore: sqlstore, sqlschema: sqlschema}, nil
	})
}

func (migration *addRUMApplications) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addRUMApplications) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	operator := migration.sqlschema.Operator()
	sqls := operator.CreateTable(&sqlschema.Table{
		Name: "rum_application",
		Columns: []*sqlschema.Column{
			{Name: "id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "org_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "name", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "platform", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "environment", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "data", DataType: sqlschema.DataTypeText, Nullable: false, Default: "'{}'"},
			{Name: "created_by", DataType: sqlschema.DataTypeText, Nullable: false, Default: "''"},
			{Name: "first_seen_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
		ForeignKeyConstraints: []*sqlschema.ForeignKeyConstraint{
			{ReferencingColumnName: "org_id", ReferencedTableName: "organizations", ReferencedColumnName: "id"},
		},
	})
	sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{TableName: "rum_application", ColumnNames: []sqlschema.ColumnName{"org_id", "name"}})...)

	sqls = append(sqls, operator.CreateTable(&sqlschema.Table{
		Name: "rum_application_key",
		Columns: []*sqlschema.Column{
			{Name: "id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "org_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "application_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "key_hash", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "last4", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "expires_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "revoked_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "last_used_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
		ForeignKeyConstraints: []*sqlschema.ForeignKeyConstraint{
			{ReferencingColumnName: "org_id", ReferencedTableName: "organizations", ReferencedColumnName: "id"},
			{ReferencingColumnName: "application_id", ReferencedTableName: "rum_application", ReferencedColumnName: "id"},
		},
	})...)
	sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{TableName: "rum_application_key", ColumnNames: []sqlschema.ColumnName{"key_hash"}})...)

	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	if _, err := tx.NewCreateIndex().
		Table("rum_application_key").
		Column("application_id").
		Index("idx_rum_application_key_application_id").
		IfNotExists().
		Exec(ctx); err != nil {
		return err
	}

	return tx.Commit()
}

func (migration *addRUMApplications) Down(context.Context, *bun.DB) error {
	return nil
}
