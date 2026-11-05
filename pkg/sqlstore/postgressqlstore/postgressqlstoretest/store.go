// Package postgressqlstoretest gives tests a PostgreSQL store of their own.
package postgressqlstoretest

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// DSNEnv names the PostgreSQL database tests may create schemas in; the
// goci workflow provides one.
const DSNEnv = "FUSESCOPE_TEST_POSTGRES_DSN"

// New returns a store on a schema created for the test and dropped after
// it, so packages tested in parallel never share tables. Without DSNEnv
// the test is skipped.
func New(t testing.TB) sqlstore.SQLStore {
	t.Helper()
	dsn := os.Getenv(DSNEnv)
	if dsn == "" {
		t.Skip("PostgreSQL tests need " + DSNEnv)
	}
	ctx := context.Background()
	admin := open(t, dsn)
	// The whole UUID: its first characters are a UUIDv7's milliseconds, so
	// two stores made in the same millisecond, in one test or in packages
	// run at once, would share a schema.
	schema := "test_" + strings.ReplaceAll(valuer.GenerateUUID().StringValue(), "-", "")
	if _, err := admin.BunDB().ExecContext(ctx, fmt.Sprintf("CREATE SCHEMA %q", schema)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.BunDB().ExecContext(context.Background(), fmt.Sprintf("DROP SCHEMA %q CASCADE", schema))
		closeStore(admin)
	})

	scoped, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := scoped.Query()
	query.Set("search_path", schema)
	scoped.RawQuery = query.Encode()
	store := open(t, scoped.String())
	t.Cleanup(func() { closeStore(store) })
	return store
}

// closeStore closes a store's pool: closing the database/sql handle that
// stdlib.OpenDBFromPool returns leaves the pgx pool, and its connections,
// open.
func closeStore(store sqlstore.SQLStore) {
	_ = store.SQLDB().Close()
	if pooled, ok := store.(interface{ PgxPool() *pgxpool.Pool }); ok {
		pooled.PgxPool().Close()
	}
}

func open(t testing.TB, dsn string) sqlstore.SQLStore {
	t.Helper()
	store, err := postgressqlstore.New(context.Background(), factorytest.NewSettings(), sqlstore.Config{
		Provider:   "postgres",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 10},
		Postgres:   sqlstore.PostgresConfig{DSN: dsn},
	})
	if err != nil {
		t.Fatal(err)
	}
	return store
}
