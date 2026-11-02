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

func TestAddArchiveShardPin(t *testing.T) {
	ctx := context.Background()
	store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
		Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "test.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "deferred"},
	})
	require.NoError(t, err)
	schema, err := sqlitesqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, store)
	require.NoError(t, err)

	require.NoError(t, (&addArchive{sqlstore: store, sqlschema: schema}).Up(ctx, store.BunDB()))
	migration := &addArchiveShardPin{sqlschema: schema}
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	require.NoError(t, migration.Up(ctx, store.BunDB()), "the migration must be idempotent")

	for _, table := range []string{"archive_attempt", "archive_part", "archive_inventory", "archive_loss"} {
		var columns int
		require.NoError(t, store.BunDB().NewRaw("SELECT count(*) FROM pragma_table_info(?) WHERE name = 'shard_id'", table).Scan(ctx, &columns))
		assert.Equal(t, 1, columns, table)
	}

	_, err = store.BunDB().ExecContext(ctx, "INSERT INTO archive_cycle (id, signal, epoch, status, started_at, created_at, updated_at) VALUES ('c1', 'logs', 1, 'done', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
	require.NoError(t, err)
	partInsert := "INSERT INTO archive_inventory (id, table_name, shard, shard_id, partition_id, part_name, min_block, max_block, data_version, rows, cycle_id, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, 'logs_v2', 1, ?, '20261001', 'p_0_0_0', 0, 0, 0, 10, 'c1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
	_, err = store.BunDB().ExecContext(ctx, partInsert, "i1", "pin1")
	require.NoError(t, err)
	_, err = store.BunDB().ExecContext(ctx, partInsert, "i2", "pin2")
	require.NoError(t, err, "a re-pinned shard may reuse a part name")
	_, err = store.BunDB().ExecContext(ctx, partInsert, "i3", "pin1")
	assert.Error(t, err, "one row per part and pin")
}
