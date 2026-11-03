package ingest

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/postgressqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore/postgressqlstoretest"
)

// newPostgresStore is a PostgreSQL store with ingest_policy_revision made
// by its migration.
func newPostgresStore(t *testing.T) sqlstore.SQLStore {
	t.Helper()
	ctx := context.Background()
	store := postgressqlstoretest.New(t)
	schema, err := postgressqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, store)
	require.NoError(t, err)
	migration, err := sqlmigration.NewAddIngestPolicyRevisionFactory(schema).New(ctx, factorytest.NewSettings(), sqlmigration.Config{})
	require.NoError(t, err)
	up, ok := migration.(interface {
		Up(context.Context, *bun.DB) error
	})
	require.True(t, ok)
	require.NoError(t, up.Up(ctx, store.BunDB()))
	return store
}

// forEachStore runs test on SQLite and, when configured, PostgreSQL: the
// revision's lock, clock and columns must hold on both.
func forEachStore(t *testing.T, test func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore)) {
	t.Run("sqlite", func(t *testing.T) { test(t, newTestStore) })
	t.Run("postgres", func(t *testing.T) { test(t, newPostgresStore) })
}
