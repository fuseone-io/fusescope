package lease

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
)

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
			migration, err := sqlmigration.NewAddLeaseFactory(schema).New(ctx, factorytest.NewSettings(), sqlmigration.Config{})
			require.NoError(t, err)
			require.NoError(t, migration.Up(ctx, store.BunDB()))
			test(t, store)
		})
	}
}

type leaseRow struct {
	Holder    string    `bun:"holder"`
	Epoch     int64     `bun:"epoch"`
	ExpiresAt time.Time `bun:"expires_at"`
}

func readLease(t *testing.T, store sqlstore.SQLStore) leaseRow {
	t.Helper()
	var row leaseRow
	require.NoError(t, store.BunDB().NewRaw("SELECT holder, epoch, expires_at FROM lease WHERE name = 'job'").Scan(context.Background(), &row))
	return row
}
