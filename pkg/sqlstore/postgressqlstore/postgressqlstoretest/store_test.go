package postgressqlstoretest

import (
	"context"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Stores made in the same millisecond get schemas of their own: the name
// once took only a UUIDv7's leading, time-based characters, and the second
// store failed with "schema already exists".
func TestNewGivesEachStoreItsOwnSchema(t *testing.T) {
	ctx := context.Background()
	seen := map[string]bool{}
	for range 20 {
		store := New(t)
		var schema string
		require.NoError(t, store.BunDB().QueryRowContext(ctx, "SELECT current_schema()").Scan(&schema))
		require.False(t, seen[schema], "schema %s shared", schema)
		seen[schema] = true
	}
}

// A store's connections close with its test: closing the database/sql
// handle alone left the pgx pool open, and a test with many stores ran out
// of the server's connections. Only this test's connections are counted,
// by an application name of its own, so other packages' do not interfere.
func TestNewClosesItsConnections(t *testing.T) {
	ctx := context.Background()
	watcher := New(t)
	name := "closes-" + valuer.GenerateUUID().StringValue()
	dsn, err := url.Parse(os.Getenv(DSNEnv))
	require.NoError(t, err)
	query := dsn.Query()
	query.Set("application_name", name)
	dsn.RawQuery = query.Encode()
	t.Setenv(DSNEnv, dsn.String())
	count := func() int {
		var n int
		require.NoError(t, watcher.BunDB().QueryRowContext(ctx, "SELECT count(*) FROM pg_stat_activity WHERE application_name = ?", name).Scan(&n))
		return n
	}
	for range 5 {
		t.Run("store", func(t *testing.T) {
			store := New(t)
			_, err := store.BunDB().ExecContext(ctx, "SELECT 1")
			require.NoError(t, err)
			assert.Positive(t, count(), "the store's connections carry the name")
		})
	}
	require.Eventually(t, func() bool { return count() == 0 }, 5*time.Second, 50*time.Millisecond, "connections left open: %d", count())
}
