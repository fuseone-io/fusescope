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

func TestAddArchiveRehydration(t *testing.T) {
	ctx := context.Background()
	store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
		Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "test.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "deferred"},
	})
	require.NoError(t, err)
	schema, err := sqlitesqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, store)
	require.NoError(t, err)

	migration := &addArchiveRehydration{sqlschema: schema}
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	require.NoError(t, migration.Up(ctx, store.BunDB()), "the migration must be idempotent")

	var columns []string
	require.NoError(t, store.BunDB().NewRaw("SELECT name FROM pragma_table_info('archive_rehydration') ORDER BY cid").Scan(ctx, &columns))
	assert.Equal(t, []string{"id", "signal", "range_start", "range_end", "status", "expires_at", "created_by", "bytes", "rows", "ddl", "failure_reason", "failure_message", "created_at", "updated_at"}, columns)

	var indexes []string
	require.NoError(t, store.BunDB().NewRaw("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_archive_rehydration_%'").Scan(ctx, &indexes))
	assert.Equal(t, []string{"idx_archive_rehydration_signal_status"}, indexes)

	_, err = store.BunDB().ExecContext(ctx, "INSERT INTO archive_rehydration (id, signal, range_start, range_end, status, expires_at, created_by, bytes, rows, ddl, failure_reason, failure_message, created_at, updated_at) VALUES ('r1', 'logs', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'pending', CURRENT_TIMESTAMP, 'a', 0, 0, '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
	assert.NoError(t, err)
}
