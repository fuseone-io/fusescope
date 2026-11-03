package sqlmigration

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addIngestPolicyRevision holds the revision of the collectors' ingest
// policy (ADR 0010 §10): one row for the deployment, with the durable,
// monotonic version and the hash of the content it was issued for. The
// policy spans every organization, so the row has no org_id.
type addIngestPolicyRevision struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddIngestPolicyRevisionFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_ingest_policy_revision"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addIngestPolicyRevision{sqlschema: sqlschema}, nil
	})
}

func (migration *addIngestPolicyRevision) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addIngestPolicyRevision) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// issued_at is text, the RFC 3339 string as published, so every replica
	// encodes the same version to the same bytes on either dialect.
	sqls := migration.sqlschema.Operator().CreateTable(&sqlschema.Table{
		Name: "ingest_policy_revision",
		Columns: []*sqlschema.Column{
			{Name: "id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "version", DataType: sqlschema.DataTypeBigInt, Nullable: false},
			{Name: "content_sha256", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "issued_at", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
	})
	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addIngestPolicyRevision) Down(context.Context, *bun.DB) error {
	return nil
}
