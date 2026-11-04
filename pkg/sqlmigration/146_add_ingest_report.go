package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addIngestReport holds what the backend keeps of the collectors' ingest
// reports (ADR 0010 §6): per agent, the last sequence applied and the
// highest invalidated, so a report is applied once and in order across
// replicas; and per application and agent, the window values of the last
// report, which the setup screen sums. The agent is the OpAMP instance UID,
// of no organization.
type addIngestReport struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddIngestReportFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_ingest_report"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addIngestReport{sqlschema: sqlschema}, nil
	})
}

func (migration *addIngestReport) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addIngestReport) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	operator := migration.sqlschema.Operator()
	sqls := operator.CreateTable(&sqlschema.Table{
		Name: "ingest_report_agent",
		Columns: []*sqlschema.Column{
			{Name: "agent_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "applied", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "invalidated", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"agent_id"}},
	})
	sqls = append(sqls, operator.CreateTable(&sqlschema.Table{
		Name: "ingest_report_application",
		Columns: []*sqlschema.Column{
			{Name: "application_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "agent_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "sessions", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "views", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "errors", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "vitals", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "sdk_name", DataType: sqlschema.DataTypeText, Nullable: false, Default: "''"},
			{Name: "sdk_version", DataType: sqlschema.DataTypeText, Nullable: false, Default: "''"},
			{Name: "rejections", DataType: sqlschema.DataTypeText, Nullable: false, Default: "'[]'"},
			{Name: "reported_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"application_id", "agent_id"}},
	})...)
	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	// Each report replaces its agent's rows; pruning deletes by age, and new
	// agents are counted by when their record was created.
	for _, index := range []struct{ table, column string }{
		{"ingest_report_application", "agent_id"},
		{"ingest_report_application", "reported_at"},
		{"ingest_report_agent", "updated_at"},
		{"ingest_report_agent", "created_at"},
	} {
		if _, err := tx.NewCreateIndex().
			Table(index.table).
			Column(index.column).
			Index("idx_" + index.table + "_" + index.column).
			IfNotExists().
			Exec(ctx); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addIngestReport) Down(context.Context, *bun.DB) error {
	return nil
}
