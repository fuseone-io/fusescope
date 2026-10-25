package implarchive

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uptrace/bun/migrate"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/postgressqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/sqlitesqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// postgresDSNEnv points the store tests at a PostgreSQL server too; each test gets its own
// schema there.
const postgresDSNEnv = "SIGNOZ_TEST_POSTGRES_DSN"

func TestAcquireLease(t *testing.T) {
	ctx := context.Background()
	valid := time.Now().Add(time.Minute)
	expired := time.Now().Add(-time.Second)

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease, err := store.AcquireLease(ctx, "logs", "a", valid)
		require.NoError(t, err)
		assert.Equal(t, int64(1), lease.Epoch)
		assert.Equal(t, "a", lease.Holder)

		lease, err = store.AcquireLease(ctx, "logs", "a", valid.Add(time.Minute))
		require.NoError(t, err)
		assert.Equal(t, int64(1), lease.Epoch, "renewing a valid lease keeps its epoch")

		_, err = store.AcquireLease(ctx, "logs", "b", valid)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseHeld), err)

		_, err = store.AcquireLease(ctx, "traces", "b", valid)
		require.NoError(t, err, "leases are per signal")

		_, err = store.AcquireLease(ctx, "logs", "a", expired)
		require.NoError(t, err)
		lease, err = store.AcquireLease(ctx, "logs", "b", valid)
		require.NoError(t, err)
		assert.Equal(t, int64(2), lease.Epoch, "an expired lease taken over moves to a new epoch")

		_, err = store.AcquireLease(ctx, "logs", "a", valid)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseHeld), err)
	})
}

func newTestStore(t *testing.T) archivetypes.Store {
	t.Helper()
	ctx := context.Background()

	store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
		Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "test.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "deferred"},
	})
	require.NoError(t, err)
	schema, err := sqlitesqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, store)
	require.NoError(t, err)

	return migrateTestStore(t, store, schema)
}

func newPostgresTestStore(t *testing.T, dsn string) archivetypes.Store {
	t.Helper()
	ctx := context.Background()

	admin, err := postgressqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{Provider: "postgres", Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1}, Postgres: sqlstore.PostgresConfig{DSN: dsn}})
	require.NoError(t, err)
	name := "archive_test_" + strings.ReplaceAll(valuer.GenerateUUID().StringValue(), "-", "")
	_, err = admin.BunDB().ExecContext(ctx, fmt.Sprintf("CREATE SCHEMA %s", name))
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = admin.BunDB().ExecContext(context.Background(), fmt.Sprintf("DROP SCHEMA %s CASCADE", name))
	})

	scoped, err := url.Parse(dsn)
	require.NoError(t, err)
	query := scoped.Query()
	query.Set("search_path", name)
	scoped.RawQuery = query.Encode()

	store, err := postgressqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{Provider: "postgres", Connection: sqlstore.ConnectionConfig{MaxOpenConns: 4}, Postgres: sqlstore.PostgresConfig{DSN: scoped.String()}})
	require.NoError(t, err)
	schema, err := postgressqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, store)
	require.NoError(t, err)

	return migrateTestStore(t, store, schema)
}

func migrateTestStore(t *testing.T, store sqlstore.SQLStore, schema sqlschema.SQLSchema) archivetypes.Store {
	t.Helper()
	ctx := context.Background()

	migration, err := sqlmigration.NewAddArchiveFactory(store, schema).New(ctx, factorytest.NewSettings(), sqlmigration.Config{})
	require.NoError(t, err)
	migrations := migrate.NewMigrations()
	require.NoError(t, migration.Register(migrations))
	for _, m := range migrations.Sorted() {
		require.NoError(t, m.Up(ctx, store.BunDB()))
	}

	return NewStore(store)
}

func forEachStore(t *testing.T, test func(t *testing.T, store archivetypes.Store)) {
	t.Helper()

	t.Run("SQLite", func(t *testing.T) { test(t, newTestStore(t)) })

	dsn := os.Getenv(postgresDSNEnv)
	if dsn == "" {
		return
	}
	t.Run("PostgreSQL", func(t *testing.T) { test(t, newPostgresTestStore(t, dsn)) })
}
