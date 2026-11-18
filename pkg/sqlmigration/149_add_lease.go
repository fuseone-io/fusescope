package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addLease holds the named leases that elect one backend for deployment-wide
// work. A lease belongs to the deployment, not to an organization, so it has
// no org_id; its name is its key. The epoch only grows, fencing the work of a
// holder that lost the lease.
type addLease struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddLeaseFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_lease"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addLease{sqlschema: sqlschema}, nil
	})
}

func (migration *addLease) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addLease) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	sqls := migration.sqlschema.Operator().CreateTable(&sqlschema.Table{
		Name: "lease",
		Columns: []*sqlschema.Column{
			{Name: "name", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "holder", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "epoch", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "expires_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"name"}},
	})
	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (migration *addLease) Down(context.Context, *bun.DB) error {
	return nil
}
