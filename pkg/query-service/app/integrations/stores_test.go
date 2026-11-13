package integrations

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/postgressqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/sqlitesqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore/postgressqlstoretest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/stretchr/testify/require"
)

// newTestStores returns makers of an empty SQLite store and, when a
// PostgreSQL database is configured, an empty PostgreSQL one, each with the
// tables the integrations manager uses.
func newTestStores() map[string]func(t *testing.T) sqlstore.SQLStore {
	return map[string]func(t *testing.T) sqlstore.SQLStore{
		"sqlite": func(t *testing.T) sqlstore.SQLStore { return newSQLiteTestStore(t, 10) },
		"postgres": func(t *testing.T) sqlstore.SQLStore {
			store := postgressqlstoretest.New(t)
			schema, err := postgressqlschema.New(context.Background(), factorytest.NewSettings(), sqlschema.Config{}, store)
			require.NoError(t, err)
			prepareTestStore(t, store, schema)
			return store
		},
	}
}

func newSQLiteTestStore(t *testing.T, conns int) sqlstore.SQLStore {
	t.Helper()
	store, err := sqlitesqlstore.New(context.Background(), factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: conns},
		Sqlite: sqlstore.SqliteConfig{
			Path:            filepath.Join(t.TempDir(), "test.db"),
			Mode:            "wal",
			BusyTimeout:     5 * time.Second,
			TransactionMode: "deferred",
		},
	})
	require.NoError(t, err)
	schema, err := sqlitesqlschema.New(context.Background(), factorytest.NewSettings(), sqlschema.Config{}, store)
	require.NoError(t, err)
	prepareTestStore(t, store, schema)
	return store
}

// prepareTestStore creates the tables the manager reads, the ownership one
// through its migration.
func prepareTestStore(t *testing.T, store sqlstore.SQLStore, schema sqlschema.SQLSchema) {
	t.Helper()
	ctx := context.Background()
	for _, model := range []any{
		(*cloudintegrationtypes.InstalledIntegration)(nil),
		(*cloudintegrationtypes.StorableIntegrationDashboard)(nil),
	} {
		_, err := store.BunDB().NewCreateTable().Model(model).IfNotExists().Exec(ctx)
		require.NoError(t, err)
	}
	// integration_dashboard rows are scoped to an org through the dashboard table.
	_, err := store.BunDB().ExecContext(ctx, `CREATE TABLE IF NOT EXISTS dashboard (id TEXT PRIMARY KEY, org_id TEXT)`)
	require.NoError(t, err)

	for _, f := range []func(sqlschema.SQLSchema) factory.ProviderFactory[sqlmigration.SQLMigration, sqlmigration.Config]{
		sqlmigration.NewAddIntegrationAssetFactory,
		sqlmigration.NewAddIntegrationAutoInstallFactory,
	} {
		migration, err := f(schema).New(ctx, factorytest.NewSettings(), sqlmigration.Config{})
		require.NoError(t, err)
		require.NoError(t, migration.Up(ctx, store.BunDB()))
	}
}
