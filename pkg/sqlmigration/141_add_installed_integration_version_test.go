package sqlmigration

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/sqlitesqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddInstalledIntegrationVersion(t *testing.T) {
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

	for _, sql := range []string{
		`CREATE TABLE organizations (id TEXT PRIMARY KEY)`,
		`CREATE TABLE installed_integration (id TEXT PRIMARY KEY, type TEXT, config TEXT, installed_at TIMESTAMP DEFAULT current_timestamp, org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE, CONSTRAINT org_id_type UNIQUE (type, org_id))`,
		`INSERT INTO organizations (id) VALUES ('org')`,
		`INSERT INTO installed_integration (id, type, config, org_id) VALUES ('existing', 'builtin-redis', '{}', 'org')`,
	} {
		_, err := store.BunDB().ExecContext(ctx, sql)
		require.NoError(t, err)
	}

	migration := &addInstalledIntegrationVersion{sqlschema: schema}
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	require.NoError(t, migration.Up(ctx, store.BunDB()), "the migration is idempotent")

	var existing string
	require.NoError(t, store.BunDB().NewRaw(`SELECT version FROM installed_integration WHERE id = 'existing'`).Scan(ctx, &existing))
	assert.Equal(t, "1.0.0", existing)

	_, err = store.BunDB().ExecContext(ctx, `INSERT INTO installed_integration (id, type, config, org_id) VALUES ('new', 'builtin-nginx', '{}', 'org')`)
	require.NoError(t, err)
	var defaulted string
	require.NoError(t, store.BunDB().NewRaw(`SELECT version FROM installed_integration WHERE id = 'new'`).Scan(ctx, &defaulted))
	assert.Equal(t, "1.0.0", defaulted)

	_, err = store.BunDB().ExecContext(ctx, `DELETE FROM organizations WHERE id = 'org'`)
	require.NoError(t, err)
	var remaining int
	require.NoError(t, store.BunDB().NewRaw(`SELECT COUNT(*) FROM installed_integration`).Scan(ctx, &remaining))
	assert.Zero(t, remaining, "installations still go with their org")
}
