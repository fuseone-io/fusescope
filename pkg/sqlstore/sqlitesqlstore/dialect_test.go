package sqlitesqlstore_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
)

func TestDialectCurrentTimestamp(t *testing.T) {
	ctx := context.Background()
	store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
		Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "test.db"), Mode: "wal", BusyTimeout: time.Second, TransactionMode: "immediate"},
	})
	require.NoError(t, err)

	before := time.Now()
	now, err := store.Dialect().CurrentTimestamp(ctx, store.BunDB())
	require.NoError(t, err)
	assert.Equal(t, time.UTC, now.Location())
	assert.WithinDuration(t, before, now, time.Second)
}
