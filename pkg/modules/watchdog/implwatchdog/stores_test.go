package implwatchdog

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/postgressqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/sqlitesqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore/postgressqlstoretest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var (
	testOrgID  = valuer.MustNewUUID("0196e2e4-0000-7000-8000-000000000001")
	otherOrgID = valuer.MustNewUUID("0196e2e4-0000-7000-8000-000000000002")
)

// forEachStore runs test on SQLite and, when a PostgreSQL database is
// configured, on PostgreSQL, each migrated with the Watchdog tables and two
// organizations.
func forEachStore(t *testing.T, test func(t *testing.T, store sqlstore.SQLStore)) {
	stores := map[string]func(t *testing.T) (sqlstore.SQLStore, sqlschema.SQLSchema){
		"sqlite": func(t *testing.T) (sqlstore.SQLStore, sqlschema.SQLSchema) {
			store, err := sqlitesqlstore.New(context.Background(), factorytest.NewSettings(), sqlstore.Config{
				Provider:   "sqlite",
				Connection: sqlstore.ConnectionConfig{MaxOpenConns: 10},
				Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "test.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "immediate"},
			})
			require.NoError(t, err)
			schema, err := sqlitesqlschema.New(context.Background(), factorytest.NewSettings(), sqlschema.Config{}, store)
			require.NoError(t, err)
			return store, schema
		},
		"postgres": func(t *testing.T) (sqlstore.SQLStore, sqlschema.SQLSchema) {
			store := postgressqlstoretest.New(t)
			schema, err := postgressqlschema.New(context.Background(), factorytest.NewSettings(), sqlschema.Config{}, store)
			require.NoError(t, err)
			return store, schema
		},
	}
	for name, open := range stores {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			store, schema := open(t)
			db := store.BunDB()
			_, err := db.ExecContext(ctx, `CREATE TABLE organizations (id TEXT PRIMARY KEY)`)
			require.NoError(t, err)
			_, err = db.ExecContext(ctx, `INSERT INTO organizations (id) VALUES (?), (?)`, testOrgID.StringValue(), otherOrgID.StringValue())
			require.NoError(t, err)
			migration, err := sqlmigration.NewAddWatchdogFactory(schema).New(ctx, factorytest.NewSettings(), sqlmigration.Config{})
			require.NoError(t, err)
			require.NoError(t, migration.Up(ctx, db))
			test(t, store)
		})
	}
}
