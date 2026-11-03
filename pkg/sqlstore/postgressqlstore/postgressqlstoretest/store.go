// Package postgressqlstoretest gives tests a PostgreSQL store of their own.
package postgressqlstoretest

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"

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
	schema := "test_" + valuer.GenerateUUID().StringValue()[:8]
	if _, err := admin.BunDB().ExecContext(ctx, fmt.Sprintf("CREATE SCHEMA %q", schema)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.BunDB().ExecContext(context.Background(), fmt.Sprintf("DROP SCHEMA %q CASCADE", schema))
		_ = admin.SQLDB().Close()
	})

	scoped, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := scoped.Query()
	query.Set("search_path", schema)
	scoped.RawQuery = query.Encode()
	store := open(t, scoped.String())
	t.Cleanup(func() { _ = store.SQLDB().Close() })
	return store
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
