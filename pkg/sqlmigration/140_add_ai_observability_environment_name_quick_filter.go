package sqlmigration

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
)

type addAIObservabilityEnvironmentNameQuickFilter struct {
	settings factory.ProviderSettings
}

func NewAddAIObservabilityEnvironmentNameQuickFilterFactory(sqlstore sqlstore.SQLStore) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_ai_o11y_env_name_filter"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addAIObservabilityEnvironmentNameQuickFilter{settings: ps}, nil
	})
}

func (migration *addAIObservabilityEnvironmentNameQuickFilter) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addAIObservabilityEnvironmentNameQuickFilter) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var rows []*quickFilterSourceRow
	if err := tx.NewSelect().Model(&rows).Where("source = ?", "ai_observability").Scan(ctx); err != nil {
		return err
	}

	for _, row := range rows {
		updated, changed, ok := addEnvironmentNameQuickFilter(row.Filter)
		if !ok {
			migration.settings.Logger.WarnContext(ctx, "quick filter could not be parsed, leaving it untouched", slog.String("quick_filter_id", row.ID))
			continue
		}
		if !changed {
			continue
		}
		if _, err := tx.NewUpdate().Model((*quickFilterSourceRow)(nil)).Set("filter = ?", updated).Where("id = ?", row.ID).Exec(ctx); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (migration *addAIObservabilityEnvironmentNameQuickFilter) Down(context.Context, *bun.DB) error {
	return nil
}

// addEnvironmentNameQuickFilter puts deployment.environment.name right before
// deployment.environment. A list without deployment.environment was edited by
// the user and is left alone; ok=false means unparseable.
func addEnvironmentNameQuickFilter(filter string) (updated string, changed bool, ok bool) {
	var entries []telemetryFieldKeyOutput
	if err := json.Unmarshal([]byte(filter), &entries); err != nil {
		return "", false, false
	}

	legacy := -1
	for i, entry := range entries {
		if entry.Name == "deployment.environment.name" {
			return "", false, true
		}
		if entry.Name == "deployment.environment" && legacy < 0 {
			legacy = i
		}
	}
	if legacy < 0 {
		return "", false, true
	}

	withName := make([]telemetryFieldKeyOutput, 0, len(entries)+1)
	withName = append(withName, entries[:legacy]...)
	withName = append(withName, telemetryFieldKeyOutput{Name: "deployment.environment.name", FieldContext: "resource", FieldDataType: "string"})
	withName = append(withName, entries[legacy:]...)

	updatedJSON, err := marshalUnescaped(withName)
	if err != nil {
		return "", false, false
	}
	return string(updatedJSON), true, true
}
