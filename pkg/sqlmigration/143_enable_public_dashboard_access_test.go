package sqlmigration

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEnablePublicDashboardAccessIsIdempotent(t *testing.T) {
	ctx := context.Background()
	store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{Provider: "sqlite", Connection: sqlstore.ConnectionConfig{MaxOpenConns: 10}, Sqlite: sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "test.db"), Mode: "wal", BusyTimeout: time.Second, TransactionMode: "deferred"}})
	require.NoError(t, err)
	for _, statement := range []string{
		`CREATE TABLE store(id TEXT PRIMARY KEY,name TEXT)`,
		`CREATE TABLE organizations(id TEXT PRIMARY KEY)`,
		`CREATE TABLE tuple(store TEXT,object_type TEXT,object_id TEXT,relation TEXT,user_object_type TEXT,user_object_id TEXT,user_relation TEXT,user_type TEXT,ulid TEXT,inserted_at TIMESTAMP,UNIQUE(store,object_type,object_id,relation,user_object_type,user_object_id,user_relation))`,
		`CREATE TABLE changelog(store TEXT,object_type TEXT,object_id TEXT,relation TEXT,user_object_type TEXT,user_object_id TEXT,user_relation TEXT,operation INTEGER,ulid TEXT,inserted_at TIMESTAMP,UNIQUE(store,ulid,object_type))`,
		`INSERT INTO store VALUES('test-store','signoz')`,
		`INSERT INTO organizations VALUES('first-org'),('second-org')`,
	} {
		_, err := store.BunDB().ExecContext(ctx, statement)
		require.NoError(t, err)
	}
	migration := &enablePublicDashboardAccess{}
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	var tuples, changes int
	require.NoError(t, store.BunDB().NewRaw("SELECT COUNT(*) FROM tuple").Scan(ctx, &tuples))
	require.NoError(t, store.BunDB().NewRaw("SELECT COUNT(*) FROM changelog").Scan(ctx, &changes))
	assert.Equal(t, 4, tuples)
	assert.Equal(t, 4, changes)
	var memberships int
	require.NoError(t, store.BunDB().NewRaw("SELECT COUNT(*) FROM tuple WHERE object_type='role' AND relation='assignee' AND user_object_type='anonymous'").Scan(ctx, &memberships))
	assert.Equal(t, 2, memberships)
}
