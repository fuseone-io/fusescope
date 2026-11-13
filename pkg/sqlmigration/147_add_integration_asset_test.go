package sqlmigration

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/postgressqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/sqlitesqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore/postgressqlstoretest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uptrace/bun"
)

type migrationStore struct {
	store  sqlstore.SQLStore
	schema sqlschema.SQLSchema
}

// migrationStores returns an empty SQLite store and, when a PostgreSQL
// database is configured, an empty PostgreSQL one.
func migrationStores(t *testing.T) map[string]func(t *testing.T) migrationStore {
	return map[string]func(t *testing.T) migrationStore{
		"sqlite": func(t *testing.T) migrationStore {
			ctx := context.Background()
			store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
				Provider:   "sqlite",
				Connection: sqlstore.ConnectionConfig{MaxOpenConns: 10},
				Sqlite: sqlstore.SqliteConfig{
					Path:            filepath.Join(t.TempDir(), "test.db"),
					Mode:            "wal",
					BusyTimeout:     5 * time.Second,
					TransactionMode: "deferred",
				},
			})
			require.NoError(t, err)
			schema, err := sqlitesqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, store)
			require.NoError(t, err)
			return migrationStore{store, schema}
		},
		"postgres": func(t *testing.T) migrationStore {
			store := postgressqlstoretest.New(t)
			schema, err := postgressqlschema.New(context.Background(), factorytest.NewSettings(), sqlschema.Config{}, store)
			require.NoError(t, err)
			return migrationStore{store, schema}
		},
	}
}

// The tables the backfill reads, with only the columns it reads.
func seedLegacyIntegrationDashboards(t *testing.T, db *bun.DB, installed [][2]string, dashboards [][2]string, rows [][4]string) {
	ctx := context.Background()
	for _, ddl := range []string{
		`CREATE TABLE dashboard (id TEXT PRIMARY KEY, org_id TEXT NOT NULL)`,
		`CREATE TABLE installed_integration (type TEXT NOT NULL, org_id TEXT NOT NULL, version TEXT NOT NULL DEFAULT '1.0.0')`,
		`CREATE TABLE integration_dashboard (id TEXT PRIMARY KEY, dashboard_id TEXT NOT NULL UNIQUE, provider TEXT NOT NULL, slug TEXT NOT NULL)`,
	} {
		_, err := db.ExecContext(ctx, ddl)
		require.NoError(t, err)
	}
	for _, i := range installed {
		_, err := db.ExecContext(ctx, `INSERT INTO installed_integration (org_id, type) VALUES (?, ?)`, i[0], i[1])
		require.NoError(t, err)
	}
	// One pin off the default, to see the asset takes its installation's.
	_, err := db.ExecContext(ctx, `UPDATE installed_integration SET version = '2.1.0' WHERE type = 'builtin-redis' AND org_id = 'org1'`)
	require.NoError(t, err)
	for _, d := range dashboards {
		_, err := db.ExecContext(ctx, `INSERT INTO dashboard (id, org_id) VALUES (?, ?)`, d[0], d[1])
		require.NoError(t, err)
	}
	for _, r := range rows {
		_, err := db.ExecContext(ctx, `INSERT INTO integration_dashboard (id, dashboard_id, provider, slug) VALUES (?, ?, ?, ?)`, r[0], r[1], r[2], r[3])
		require.NoError(t, err)
	}
}

type movedAsset struct {
	OrgID       string `bun:"org_id"`
	Integration string `bun:"integration"`
	Kind        string `bun:"kind"`
	Slug        string `bun:"slug"`
	ResourceID  string `bun:"resource_id"`
	State       string `bun:"state"`
	Version     string `bun:"version"`
	Generation  int64  `bun:"generation"`
}

func TestAddIntegrationAssetMovesInstalledIntegrationDashboards(t *testing.T) {
	for name, open := range migrationStores(t) {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			s := open(t)
			db := s.store.BunDB()
			seedLegacyIntegrationDashboards(t, db,
				[][2]string{{"org1", "builtin-nginx"}, {"org1", "builtin-redis"}, {"org2", "builtin-nginx"}},
				[][2]string{{"d1", "org1"}, {"d2", "org1"}, {"d3", "org2"}, {"d4", "org1"}},
				[][4]string{
					{"r1", "d1", "installed_integration", "nginx-overview"},
					{"r2", "d2", "installed_integration", "redis-overview"},
					{"r3", "d3", "installed_integration", "nginx-overview"},
					{"r4", "d4", "cloud_integration", "aws-ec2-overview"},
				})

			migration := &addIntegrationAsset{sqlschema: s.schema}
			require.NoError(t, migration.Up(ctx, db))
			require.NoError(t, migration.Up(ctx, db), "the migration is idempotent")

			var moved []movedAsset
			require.NoError(t, db.NewRaw(`SELECT org_id, integration, kind, slug, resource_id, state, version, generation FROM integration_asset ORDER BY resource_id`).Scan(ctx, &moved))
			assert.Equal(t, []movedAsset{
				{"org1", "builtin-nginx", "dashboard", "overview", "d1", "ready", "1.0.0", 1},
				{"org1", "builtin-redis", "dashboard", "overview", "d2", "ready", "2.1.0", 1},
				{"org2", "builtin-nginx", "dashboard", "overview", "d3", "ready", "1.0.0", 1},
			}, moved, "the slug no longer carries the integration's name; the version is the pin's")

			var left []string
			require.NoError(t, db.NewRaw(`SELECT id FROM integration_dashboard ORDER BY id`).Scan(ctx, &left))
			assert.Equal(t, []string{"r4"}, left, "cloud integrations keep their rows")

			insert := `INSERT INTO integration_asset (id, org_id, integration, kind, slug, resource_id, state, generation, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, 'creating', 1, current_timestamp, current_timestamp)`
			_, err := db.ExecContext(ctx, insert, "x1", "org1", "builtin-nginx", "dashboard", "overview", "d9")
			assert.Error(t, err, "one resource per asset of an integration in an organization")
			_, err = db.ExecContext(ctx, insert, "x2", "org1", "builtin-nginx", "alert", "overview", "d9")
			assert.NoError(t, err, "a dashboard and an alert may share a slug")
			_, err = db.ExecContext(ctx, insert, "x3", "org1", "builtin-nginx", "dashboard", "other", "d1")
			assert.Error(t, err, "a resource belongs to one asset")
		})
	}
}

func TestAddIntegrationAssetRefusesRowsItCannotMove(t *testing.T) {
	cases := []struct {
		name      string
		installed [][2]string
		rows      [][4]string
		problem   string
	}{
		{
			name:    "orphan dashboard",
			rows:    [][4]string{{"r1", "gone", "installed_integration", "nginx-overview"}},
			problem: "integration_dashboard r1: dashboard gone does not exist",
		},
		{
			name:    "no installed integration",
			rows:    [][4]string{{"r1", "d1", "installed_integration", "nginx-overview"}},
			problem: `integration_dashboard r1: slug "nginx-overview" matches 0 installed integrations of org org1`,
		},
		{
			name:      "ambiguous slug",
			installed: [][2]string{{"org1", "builtin-foo"}, {"org1", "builtin-foo-bar"}},
			rows:      [][4]string{{"r1", "d1", "installed_integration", "foo-bar-overview"}},
			problem:   `integration_dashboard r1: slug "foo-bar-overview" matches 2 installed integrations of org org1: [builtin-foo builtin-foo-bar]`,
		},
		{
			name:      "duplicate owner",
			installed: [][2]string{{"org1", "builtin-nginx"}},
			rows: [][4]string{
				{"r1", "d1", "installed_integration", "nginx-overview"},
				{"r2", "d2", "installed_integration", "nginx-overview"},
			},
			problem: `integration_dashboard r1 and r2: both own dashboard "overview" of builtin-nginx in org org1`,
		},
	}
	for name, open := range migrationStores(t) {
		t.Run(name, func(t *testing.T) {
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					ctx := context.Background()
					s := open(t)
					db := s.store.BunDB()
					rows := append([][4]string{{"ok", "d9", "installed_integration", "redis-overview"}}, tc.rows...)
					installed := append([][2]string{{"org1", "builtin-redis"}}, tc.installed...)
					seedLegacyIntegrationDashboards(t, db, installed, [][2]string{{"d1", "org1"}, {"d2", "org1"}, {"d9", "org1"}}, rows)

					err := (&addIntegrationAsset{sqlschema: s.schema}).Up(ctx, db)
					require.Error(t, err)
					assert.Contains(t, err.Error(), tc.problem)
					assert.Contains(t, err.Error(), "nothing was changed")

					var left int
					require.NoError(t, db.NewRaw(`SELECT count(*) FROM integration_dashboard`).Scan(ctx, &left))
					assert.Equal(t, len(rows), left, "every row is kept, the movable ones too")
					var created int
					assert.Error(t, db.NewRaw(`SELECT count(*) FROM integration_asset`).Scan(ctx, &created), "the new table is rolled back too")
				})
			}
		})
	}
}
