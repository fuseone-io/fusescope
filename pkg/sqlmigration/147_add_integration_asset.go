package sqlmigration

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

// addIntegrationAsset records which dashboards and alerts an installed
// integration owns, in one table for both kinds, unique on
// (org_id, integration, kind, slug). The slug is the asset's ID in its
// integration's manifest, without the integration's name. integration_operation
// serializes install, upgrade and uninstall per integration of an organization.
//
// It moves the installed integrations' rows of integration_dashboard here.
// Their slug was "<integration>-<dashboard>"; the integration is recovered
// from the organization's installed integrations, and the migration fails,
// keeping every row, if a row's dashboard is missing, its slug matches no
// installed integration or more than one, or two rows would own the same
// asset.
type addIntegrationAsset struct {
	sqlschema sqlschema.SQLSchema
}

func NewAddIntegrationAssetFactory(sqlschema sqlschema.SQLSchema) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_integration_asset"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addIntegrationAsset{sqlschema: sqlschema}, nil
	})
}

func (migration *addIntegrationAsset) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addIntegrationAsset) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	operator := migration.sqlschema.Operator()
	sqls := operator.CreateTable(&sqlschema.Table{
		Name: "integration_asset",
		Columns: []*sqlschema.Column{
			{Name: "id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "org_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "integration", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "kind", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "slug", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "resource_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "state", DataType: sqlschema.DataTypeText, Nullable: false},
			// The catalog version the resource reflects, behind the
			// installation's pin while an upgrade is being applied.
			{Name: "version", DataType: sqlschema.DataTypeText, Nullable: false, Default: "''"},
			{Name: "created_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"id"}},
	})
	sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{
		TableName:   "integration_asset",
		ColumnNames: []sqlschema.ColumnName{"org_id", "integration", "kind", "slug"},
	})...)
	sqls = append(sqls, operator.CreateIndex(&sqlschema.UniqueIndex{
		TableName:   "integration_asset",
		ColumnNames: []sqlschema.ColumnName{"kind", "resource_id"},
	})...)
	sqls = append(sqls, operator.CreateTable(&sqlschema.Table{
		Name: "integration_operation",
		Columns: []*sqlschema.Column{
			{Name: "org_id", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "integration", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "state", DataType: sqlschema.DataTypeText, Nullable: false},
			{Name: "generation", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "1"},
			// Unix milliseconds, 0 once released, so both databases compare
			// it with the clock the same way.
			{Name: "lease_until", DataType: sqlschema.DataTypeBigInt, Nullable: false, Default: "0"},
			{Name: "updated_at", DataType: sqlschema.DataTypeTimestamp, Nullable: false},
		},
		PrimaryKeyConstraint: &sqlschema.PrimaryKeyConstraint{ColumnNames: []sqlschema.ColumnName{"org_id", "integration"}},
	})...)
	for _, sql := range sqls {
		if _, err := tx.ExecContext(ctx, string(sql)); err != nil {
			return err
		}
	}

	if err := migration.backfill(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

type legacyIntegrationDashboard struct {
	ID          string  `bun:"id"`
	DashboardID string  `bun:"dashboard_id"`
	Slug        string  `bun:"slug"`
	OrgID       *string `bun:"org_id"`
}

func (migration *addIntegrationAsset) backfill(ctx context.Context, tx bun.Tx) error {
	var rows []legacyIntegrationDashboard
	if err := tx.NewRaw(`SELECT id_.id, id_.dashboard_id, id_.slug, d.org_id
		FROM integration_dashboard AS id_
		LEFT JOIN dashboard AS d ON d.id = id_.dashboard_id
		WHERE id_.provider = 'installed_integration'
		ORDER BY id_.id`).Scan(ctx, &rows); err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	type installation struct {
		Type    string `bun:"type"`
		Version string `bun:"version"`
	}
	installed := map[string][]installation{}
	var problems []string
	type key struct{ org, integration, slug string }
	seen := map[key]string{}
	now := time.Now()
	type asset struct{ id, legacyID, org, integration, slug, dashboardID, version string }
	var assets []asset
	for _, row := range rows {
		if row.OrgID == nil {
			problems = append(problems, fmt.Sprintf("integration_dashboard %s: dashboard %s does not exist", row.ID, row.DashboardID))
			continue
		}
		org := *row.OrgID
		installations, ok := installed[org]
		if !ok {
			if err := tx.NewRaw(`SELECT type, version FROM installed_integration WHERE org_id = ? ORDER BY type`, org).Scan(ctx, &installations); err != nil {
				return err
			}
			installed[org] = installations
		}
		var matches []string
		var version string
		for _, i := range installations {
			if strings.HasPrefix(row.Slug, strings.TrimPrefix(i.Type, "builtin-")+"-") {
				matches = append(matches, i.Type)
				version = i.Version
			}
		}
		if len(matches) != 1 {
			problems = append(problems, fmt.Sprintf("integration_dashboard %s: slug %q matches %d installed integrations of org %s: %v", row.ID, row.Slug, len(matches), org, matches))
			continue
		}
		integration := matches[0]
		slug := strings.TrimPrefix(row.Slug, strings.TrimPrefix(integration, "builtin-")+"-")
		k := key{org, integration, slug}
		if other, dup := seen[k]; dup {
			problems = append(problems, fmt.Sprintf("integration_dashboard %s and %s: both own dashboard %q of %s in org %s", other, row.ID, slug, integration, org))
			continue
		}
		seen[k] = row.ID
		assets = append(assets, asset{valuer.GenerateUUID().StringValue(), row.ID, org, integration, slug, row.DashboardID, version})
	}
	if len(problems) > 0 {
		sort.Strings(problems)
		return errors.Newf(errors.TypeInternal, errors.CodeInternal, "add_integration_asset: %d installed integration dashboard(s) cannot be moved; nothing was changed:\n  %s", len(problems), strings.Join(problems, "\n  "))
	}

	for _, a := range assets {
		if _, err := tx.ExecContext(ctx, `INSERT INTO integration_asset
			(id, org_id, integration, kind, slug, resource_id, state, version, created_at, updated_at)
			VALUES (?, ?, ?, 'dashboard', ?, ?, 'ready', ?, ?, ?)`,
			a.id, a.org, a.integration, a.slug, a.dashboardID, a.version, now, now); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM integration_dashboard WHERE id = ?`, a.legacyID); err != nil {
			return err
		}
	}
	return nil
}

func (migration *addIntegrationAsset) Down(context.Context, *bun.DB) error {
	return nil
}
