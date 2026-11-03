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

func TestAddIngestPolicyRevision(t *testing.T) {
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

	migration := &addIngestPolicyRevision{sqlschema: schema}
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	require.NoError(t, migration.Up(ctx, store.BunDB()), "the migration is idempotent")

	_, err = store.BunDB().ExecContext(ctx, `INSERT INTO ingest_policy_revision (id, version, content_sha256, issued_at, created_at, updated_at) VALUES ('ingest_policy', 9223372036854775807, 'abc', '2026-11-03T12:00:00Z', current_timestamp, current_timestamp)`)
	require.NoError(t, err, "a version up to the largest int64")
	_, err = store.BunDB().ExecContext(ctx, `INSERT INTO ingest_policy_revision (id, version, content_sha256, issued_at, created_at, updated_at) VALUES ('ingest_policy', 1, 'def', '2026-11-03T12:00:00Z', current_timestamp, current_timestamp)`)
	assert.Error(t, err, "one row per id")
}
