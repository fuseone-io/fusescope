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

func TestPublish(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		publication := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3}, archivetypes.BlockRange{Min: 4, Max: 5})

		require.NoError(t, store.Publish(ctx, lease, publication))

		parts, err := store.ListPublishedParts(ctx, "logs_v2", 1, "20260903-15-0")
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{"p_1_3", "p_4_5"}, partNames(parts))

		objects, err := store.ListActiveObjects(ctx, "logs_v2")
		require.NoError(t, err)
		assert.Len(t, objects, 2)

		err = store.Publish(ctx, lease, publication)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeAttemptNotPending), err)
	})
}

func TestPublishFencedByLease(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		stale, err := store.AcquireLease(ctx, "logs", "a", time.Now().Add(time.Minute))
		require.NoError(t, err)
		publication := newTestPublication(t, store, stale, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})

		_, err = store.AcquireLease(ctx, "logs", "a", time.Now().Add(-time.Second))
		require.NoError(t, err)
		_, err = store.AcquireLease(ctx, "logs", "b", time.Now().Add(time.Minute))
		require.NoError(t, err)

		err = store.Publish(ctx, stale, publication)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseLost), err)

		parts, err := store.ListPublishedParts(ctx, "logs_v2", 1, "20260903-15-0")
		require.NoError(t, err)
		assert.Empty(t, parts, "a stale executor commits nothing")
	})
}

func TestPublishFencedByLeaseExpiry(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		publication := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})

		expired, err := store.AcquireLease(ctx, "logs", "a", time.Now().Add(-time.Second))
		require.NoError(t, err)

		err = store.Publish(ctx, expired, publication)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseLost), err)
	})
}

func TestPublishSupersedes(t *testing.T) {
	ctx := context.Background()

	testCases := []struct {
		name               string
		published          []archivetypes.BlockRange
		newer              archivetypes.BlockRange
		wantParts          []string
		wantActiveObjects  int
		otherPartitionKept bool
	}{
		{
			name:              "MergedPartContainsPublished_PartsAndObjectsSuperseded",
			published:         []archivetypes.BlockRange{{Min: 1, Max: 3}, {Min: 4, Max: 5}},
			newer:             archivetypes.BlockRange{Min: 1, Max: 6},
			wantParts:         []string{"p_1_6"},
			wantActiveObjects: 1,
		},
		{
			name:              "LaterPartDisjoint_NothingSuperseded",
			published:         []archivetypes.BlockRange{{Min: 1, Max: 3}},
			newer:             archivetypes.BlockRange{Min: 4, Max: 4},
			wantParts:         []string{"p_1_3", "p_4_4"},
			wantActiveObjects: 2,
		},
		{
			name:              "PartiallyContained_OnlyContainedSuperseded",
			published:         []archivetypes.BlockRange{{Min: 1, Max: 3}, {Min: 6, Max: 8}},
			newer:             archivetypes.BlockRange{Min: 1, Max: 4},
			wantParts:         []string{"p_1_4", "p_6_8"},
			wantActiveObjects: 2,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, store archivetypes.Store) {
				lease := acquireTestLease(t, store)
				require.NoError(t, store.Publish(ctx, lease, newTestPublication(t, store, lease, "20260903-15-0", testCase.published...)))
				require.NoError(t, store.Publish(ctx, lease, newTestPublication(t, store, lease, "20260904-15-0", testCase.published...)))

				require.NoError(t, store.Publish(ctx, lease, newTestPublication(t, store, lease, "20260903-15-0", testCase.newer)))

				parts, err := store.ListPublishedParts(ctx, "logs_v2", 1, "20260903-15-0")
				require.NoError(t, err)
				assert.ElementsMatch(t, testCase.wantParts, partNames(parts))

				other, err := store.ListPublishedParts(ctx, "logs_v2", 1, "20260904-15-0")
				require.NoError(t, err)
				assert.Len(t, other, len(testCase.published), "other partitions are untouched")

				objects, err := store.ListActiveObjects(ctx, "logs_v2")
				require.NoError(t, err)
				assert.Len(t, objects, testCase.wantActiveObjects+len(testCase.published))
			})
		})
	}
}

func TestPublishKeepsObjectWithAPublishedPart(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		attempt := archivetypes.NewExportAttempt(lease, "logs_v2", 1, "20260903-15-0", "archive", "fusescope")
		require.NoError(t, store.CreateAttempt(ctx, attempt))
		object := archivetypes.NewObject(attempt, "k/compacted.parquet", 4096, "etag", 20)
		require.NoError(t, store.Publish(ctx, lease, &archivetypes.Publication{
			Attempt: attempt,
			Objects: []*archivetypes.Object{object},
			Parts: []*archivetypes.ArchivedPart{
				archivetypes.NewArchivedPart(attempt, object, testPart(archivetypes.BlockRange{Min: 1, Max: 2})),
				archivetypes.NewArchivedPart(attempt, object, testPart(archivetypes.BlockRange{Min: 5, Max: 6})),
			},
		}))

		require.NoError(t, store.Publish(ctx, lease, newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})))

		objects, err := store.ListActiveObjects(ctx, "logs_v2")
		require.NoError(t, err)
		assert.Len(t, objects, 2, "the object still holds the published 5_6")
	})
}

func TestAbandonAttempt(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		publication := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})

		require.NoError(t, store.AbandonAttempt(ctx, publication.Attempt.ID))

		err := store.Publish(ctx, lease, publication)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeAttemptNotPending), err)
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

func acquireTestLease(t *testing.T, store archivetypes.Store) *archivetypes.Lease {
	t.Helper()

	lease, err := store.AcquireLease(context.Background(), "logs", "a", time.Now().Add(time.Minute))
	require.NoError(t, err)
	return lease
}

// newTestPublication creates a pending attempt on partitionID with one object per range.
func newTestPublication(t *testing.T, store archivetypes.Store, lease *archivetypes.Lease, partitionID string, ranges ...archivetypes.BlockRange) *archivetypes.Publication {
	t.Helper()

	attempt := archivetypes.NewExportAttempt(lease, "logs_v2", 1, partitionID, "archive", "fusescope")
	require.NoError(t, store.CreateAttempt(context.Background(), attempt))
	require.NoError(t, attempt.SetFormat([]archivetypes.ColumnMapping{{Name: "timestamp", SourceType: "UInt64", ExportType: "Int64"}}, "fusescope/logs_v2/manifests/attempt="+attempt.ID.StringValue()+".json", "sha"))

	publication := &archivetypes.Publication{Attempt: attempt}
	location := archivetypes.ObjectLocation{Prefix: "fusescope", Table: "logs_v2", Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), Shard: 1, PartitionID: partitionID, AttemptID: attempt.ID.StringValue()}
	for _, blocks := range ranges {
		part := testPart(blocks)
		object := archivetypes.NewObject(attempt, location.ObjectKey(part.Name), 1024, "etag", int64(part.Rows))
		publication.Objects = append(publication.Objects, object)
		publication.Parts = append(publication.Parts, archivetypes.NewArchivedPart(attempt, object, part))
	}

	return publication
}

func testPart(blocks archivetypes.BlockRange) archivetypes.Part {
	return archivetypes.Part{Name: fmt.Sprintf("p_%d_%d", blocks.Min, blocks.Max), Range: blocks, DataVersion: blocks.Min, Rows: 10}
}

func partNames(parts []*archivetypes.ArchivedPart) []string {
	names := make([]string, len(parts))
	for i, part := range parts {
		names[i] = part.PartName
	}
	return names
}
