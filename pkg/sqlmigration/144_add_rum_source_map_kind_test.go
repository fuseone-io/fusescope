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

func TestAddRUMSourceMapKind(t *testing.T) {
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
		`CREATE TABLE rum_application (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id))`,
		`CREATE TABLE rum_source_map (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), application_id TEXT NOT NULL REFERENCES rum_application(id), release_name TEXT NOT NULL, path TEXT NOT NULL, debug_id TEXT NOT NULL DEFAULT '', size BIGINT NOT NULL, created_by TEXT NOT NULL DEFAULT '', last_used_at TIMESTAMP, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL)`,
		`CREATE UNIQUE INDEX uq_rum_source_map_application_id_release_name_path ON rum_source_map (application_id, release_name, path)`,
		`INSERT INTO organizations (id) VALUES ('org')`,
		`INSERT INTO rum_application (id, org_id) VALUES ('app', 'org')`,
		`INSERT INTO rum_source_map (id, org_id, application_id, release_name, path, size, created_at, updated_at) VALUES ('existing', 'org', 'app', '1.0.0', '/main.js.map', 10, current_timestamp, current_timestamp)`,
	} {
		_, err := store.BunDB().ExecContext(ctx, sql)
		require.NoError(t, err)
	}

	migration := &addRUMSourceMapKind{sqlschema: schema}
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	require.NoError(t, migration.Up(ctx, store.BunDB()), "the migration is idempotent")

	var existing string
	require.NoError(t, store.BunDB().NewRaw(`SELECT kind FROM rum_source_map WHERE id = 'existing'`).Scan(ctx, &existing))
	assert.Equal(t, "source-map", existing, "maps uploaded before kinds are source maps")

	_, err = store.BunDB().ExecContext(ctx, `INSERT INTO rum_source_map (id, org_id, application_id, release_name, path, size, kind, created_at, updated_at) VALUES ('mapping', 'org', 'app', '1.0.0', '/mapping.txt', 10, 'r8-mapping', current_timestamp, current_timestamp)`)
	require.NoError(t, err)
	_, err = store.BunDB().ExecContext(ctx, `INSERT INTO rum_source_map (id, org_id, application_id, release_name, path, size, created_at, updated_at) VALUES ('duplicate', 'org', 'app', '1.0.0', '/main.js.map', 10, current_timestamp, current_timestamp)`)
	assert.Error(t, err, "the path stays unique within a release")
}
