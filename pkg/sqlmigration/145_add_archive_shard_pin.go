package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

type addArchiveShardPin struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddArchiveShardPinFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_archive_shard_pin"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addArchiveShardPin{sqlschema: sqlschema}, nil
	})
}

func (migration *addArchiveShardPin) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

// Up keys archived parts by the archive_shard row they were exported under, since block
// numbers restart when a shard's table is recreated.
func (migration *addArchiveShardPin) Up(ctx context.Context, db *bun.DB) error {
	operator := migration.sqlschema.Operator()
	var sqls [][]byte

	for _, name := range []sqlschema.TableName{"archive_attempt", "archive_part", "archive_inventory", "archive_loss"} {
		table, uniqueConstraints, err := migration.sqlschema.GetTable(ctx, name)
		if err != nil {
			return err
		}
		// Nullable, so SQLite adds the column in place; nothing has written these tables yet.
		sqls = append(sqls, operator.AddColumn(table, uniqueConstraints, &sqlschema.Column{Name: "shard_id", DataType: sqlschema.DataTypeText, Nullable: true}, nil)...)
	}

	for _, name := range []sqlschema.TableName{"archive_part", "archive_inventory"} {
		sqls = append(sqls, operator.DropIndex(&sqlschema.UniqueIndex{TableName: name, ColumnNames: []sqlschema.ColumnName{"table_name", "shard", "partition_id", "part_name"}})...)
		sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{TableName: name, ColumnNames: []sqlschema.ColumnName{"shard_id", "partition_id", "part_name"}})...)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addArchiveShardPin) Down(context.Context, *bun.DB) error {
	return nil
}
