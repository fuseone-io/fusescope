package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addWatchdog holds Watchdog issues and per-detector settings. An
// organization has at most one active (open, acknowledged or muted) issue
// per fingerprint; resolved issues keep theirs for history.
type addWatchdog struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddWatchdogFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_watchdog"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addWatchdog{sqlschema: sqlschema}, nil
	})
}

func (migration *addWatchdog) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addWatchdog) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	operator := migration.sqlschema.Operator()
	sqls := operator.CreateTable(&sqlschema.Table{
		Name: "watchdog_issue",
		Columns: []*sqlschema.Column{
			{Name: "id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "org_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "detector", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "service", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "fingerprint", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "status", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "severity", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "first_seen", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "last_seen", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "resolved_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "muted_until", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "peak_score", DataType: sqlschema.DataTypeNumeric, Nullable: true},
			{Name: "clean_evaluations", DataType: sqlschema.DataTypeInteger, Nullable: false, Default: "0"},
			{Name: "last_evaluated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: true},
			{Name: "evidence", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
		ForeignKeyConstraints: []*sqlschema.ForeignKeyConstraint{
			{ReferencingColumnName: "org_id", ReferencedTableName: "organizations", ReferencedColumnName: "id"},
		},
	})
	sqls = append(sqls, operator.CreateIndex(&sqlschema.PartialUniqueIndex{
		TableName:   "watchdog_issue",
		ColumnNames: []sqlschema.ColumnName{"org_id", "fingerprint"},
		Where:       "status IN ('open', 'acknowledged', 'muted')",
	})...)

	sqls = append(sqls, operator.CreateTable(&sqlschema.Table{
		Name: "watchdog_setting",
		Columns: []*sqlschema.Column{
			{Name: "id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "org_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "detector", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "enabled", DataType: sqlschema.DataTypeBoolean, Nullable: false, Default: "true"},
			{Name: "notify", DataType: sqlschema.DataTypeBoolean, Nullable: false, Default: "false"},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
		ForeignKeyConstraints: []*sqlschema.ForeignKeyConstraint{
			{ReferencingColumnName: "org_id", ReferencedTableName: "organizations", ReferencedColumnName: "id"},
		},
	})...)
	sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{
		TableName:   "watchdog_setting",
		ColumnNames: []sqlschema.ColumnName{"org_id", "detector"},
	})...)

	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (migration *addWatchdog) Down(context.Context, *bun.DB) error {
	return nil
}
