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

func TestAddArchive(t *testing.T) {
	ctx := context.Background()
	store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
		Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "test.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "deferred"},
	})
	require.NoError(t, err)
	schema, err := sqlitesqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, store)
	require.NoError(t, err)

	migration := &addArchive{sqlstore: store, sqlschema: schema}
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	require.NoError(t, migration.Up(ctx, store.BunDB()), "the migration must be idempotent")

	var tables []string
	require.NoError(t, store.BunDB().NewRaw("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'archive_%' ORDER BY name").Scan(ctx, &tables))
	assert.Equal(t, []string{"archive_attempt", "archive_cycle", "archive_inventory", "archive_lease", "archive_loss", "archive_object", "archive_part", "archive_signal"}, tables)

	_, err = store.BunDB().ExecContext(ctx, "INSERT INTO archive_lease (id, signal, holder, epoch, expires_at, created_at, updated_at) VALUES ('a', 'logs', 'h', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
	require.NoError(t, err)
	_, err = store.BunDB().ExecContext(ctx, "INSERT INTO archive_lease (id, signal, holder, epoch, expires_at, created_at, updated_at) VALUES ('b', 'logs', 'h', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
	assert.Error(t, err, "one lease per signal")

	partInsert := "INSERT INTO archive_inventory (id, table_name, shard, partition_id, part_name, min_block, max_block, rows, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, 'logs_v2', 1, '20261001', 'p_0_0_0', 0, 0, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
	_, err = store.BunDB().ExecContext(ctx, partInsert, "i1")
	require.NoError(t, err)
	_, err = store.BunDB().ExecContext(ctx, partInsert, "i2")
	assert.Error(t, err, "one inventory row per part")
}
