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
	"github.com/fuseone-io/fusescope/pkg/factory"
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

func TestBackstopTable(t *testing.T) {
	ctx := context.Background()
	modifiedAt := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	materializedAt := modifiedAt.Add(time.Hour)

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		_, err := store.GetBackstopTable(ctx, "logs", "signoz_logs.logs_v2")
		assert.True(t, errors.Ast(err, errors.TypeNotFound), err)

		progress := archivetypes.NewBackstopTable("logs", "signoz_logs.logs_v2", 7)
		progress.ModifiedAt = &modifiedAt
		require.NoError(t, store.SetBackstopTable(ctx, progress))

		got, err := store.GetBackstopTable(ctx, "logs", "signoz_logs.logs_v2")
		require.NoError(t, err)
		assert.Equal(t, 7, got.BackstopDays)
		require.NotNil(t, got.ModifiedAt)
		assert.True(t, modifiedAt.Equal(*got.ModifiedAt))
		assert.Nil(t, got.MaterializedAt)

		got.MaterializedAt = &materializedAt
		require.NoError(t, store.SetBackstopTable(ctx, got))
		got, err = store.GetBackstopTable(ctx, "logs", "signoz_logs.logs_v2")
		require.NoError(t, err)
		require.NotNil(t, got.MaterializedAt)
		assert.True(t, materializedAt.Equal(*got.MaterializedAt))

		require.NoError(t, store.SetBackstopTable(ctx, archivetypes.NewBackstopTable("logs", "signoz_logs.logs_v2", 10)), "another backstop starts over")
		got, err = store.GetBackstopTable(ctx, "logs", "signoz_logs.logs_v2")
		require.NoError(t, err)
		assert.Equal(t, 10, got.BackstopDays)
		assert.Nil(t, got.ModifiedAt)
		assert.Nil(t, got.MaterializedAt)

		_, err = store.GetBackstopTable(ctx, "logs", "signoz_logs.logs_v2_resource")
		assert.True(t, errors.Ast(err, errors.TypeNotFound), "progress is per table")
	})
}

func TestPublish(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		publication := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3}, archivetypes.BlockRange{Min: 4, Max: 5})

		mustPublish(t, store, lease, publication)

		parts, err := store.ListPublishedParts(ctx, testShardPin(t, store), "20260903-15-0")
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{"p_1_3", "p_4_5"}, partNames(parts))

		objects, err := store.ListActiveObjects(ctx, "logs_v2")
		require.NoError(t, err)
		assert.Len(t, objects, 2)

		sequence, err := store.Publish(ctx, lease, publication)
		require.NoError(t, err, "a retry after a lost commit reply succeeds")
		assert.Equal(t, int64(1), sequence, "a retry commits nothing again")

		publication.Attempt.ManifestSHA256 = "other"
		_, err = store.Publish(ctx, lease, publication)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeAttemptAlreadyPublished), "another manifest is told the attempt is published: %v", err)
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

		_, err = store.Publish(ctx, stale, publication)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseLost), err)

		parts, err := store.ListPublishedParts(ctx, testShardPin(t, store), "20260903-15-0")
		require.NoError(t, err)
		assert.Empty(t, parts, "a stale executor commits nothing")
	})
}

func TestPublishHoldsOffATakeoverOnPostgreSQL(t *testing.T) {
	dsn := os.Getenv(postgresDSNEnv)
	if dsn == "" {
		t.Skipf("set %s to run the two-connection test", postgresDSNEnv)
	}
	ctx := context.Background()
	archiveStore := newPostgresTestStore(t, dsn)

	lease, err := archiveStore.AcquireLease(ctx, "logs", "a", time.Now().Add(time.Second))
	require.NoError(t, err)
	publication := newTestPublication(t, archiveStore, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})

	type takeover struct {
		lease *archivetypes.Lease
		err   error
	}
	tookOver := make(chan takeover, 1)
	err = archiveStore.(*store).sqlstore.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		if _, err := archiveStore.Publish(ctx, lease, publication); err != nil {
			return err
		}

		time.Sleep(time.Until(lease.ExpiresAt) + 100*time.Millisecond)
		go func() {
			lease, err := archiveStore.AcquireLease(context.Background(), "logs", "b", time.Now().Add(time.Minute))
			tookOver <- takeover{lease: lease, err: err}
		}()

		select {
		case result := <-tookOver:
			tookOver <- result
			t.Error("a takeover doesn't wait for the commit in flight")
		case <-time.After(500 * time.Millisecond):
		}
		return nil
	})
	require.NoError(t, err)

	result := <-tookOver
	require.NoError(t, result.err)
	assert.Equal(t, int64(lease.Epoch+1), result.lease.Epoch, "the takeover moves the epoch once the commit ends")

	parts, err := archiveStore.ListPublishedParts(ctx, testShardPin(t, archiveStore), "20260903-15-0")
	require.NoError(t, err)
	assert.Equal(t, []string{"p_1_3"}, partNames(parts), "the commit under the old epoch stands")
}

func TestPublishFencedByLeaseExpiry(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		publication := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})

		expired, err := store.AcquireLease(ctx, "logs", "a", time.Now().Add(-time.Second))
		require.NoError(t, err)

		_, err = store.Publish(ctx, expired, publication)
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
				mustPublish(t, store, lease, newTestPublication(t, store, lease, "20260903-15-0", testCase.published...))
				mustPublish(t, store, lease, newTestPublication(t, store, lease, "20260904-15-0", testCase.published...))

				mustPublish(t, store, lease, newTestPublication(t, store, lease, "20260903-15-0", testCase.newer))

				parts, err := store.ListPublishedParts(ctx, testShardPin(t, store), "20260903-15-0")
				require.NoError(t, err)
				assert.ElementsMatch(t, testCase.wantParts, partNames(parts))

				other, err := store.ListPublishedParts(ctx, testShardPin(t, store), "20260904-15-0")
				require.NoError(t, err)
				assert.Len(t, other, len(testCase.published), "other partitions are untouched")

				objects, err := store.ListActiveObjects(ctx, "logs_v2")
				require.NoError(t, err)
				assert.Len(t, objects, testCase.wantActiveObjects+len(testCase.published))
			})
		})
	}
}

func TestPublishKeepsOnePartPerRange(t *testing.T) {
	ctx := context.Background()
	mutated := archivetypes.Part{Name: "p_1_3_0_7", Range: archivetypes.BlockRange{Min: 1, Max: 3}, DataVersion: 7, Rows: 9}
	lateOriginal := archivetypes.Part{Name: "p_1_3_0", Range: archivetypes.BlockRange{Min: 1, Max: 3}, DataVersion: 1, Rows: 10}
	merged := archivetypes.Part{Name: "p_1_6_1", Range: archivetypes.BlockRange{Min: 1, Max: 6}, DataVersion: 1, Rows: 20}
	contained := archivetypes.Part{Name: "p_1_3_0", Range: archivetypes.BlockRange{Min: 1, Max: 3}, DataVersion: 1, Rows: 10}

	testCases := []struct {
		name      string
		first     archivetypes.Part
		second    archivetypes.Part
		wantParts []string
	}{
		{name: "OlderVersionOfAMutatedPart_MutatedKept", first: mutated, second: lateOriginal, wantParts: []string{"p_1_3_0_7"}},
		{name: "PartAPublishedPartContains_NewSuperseded", first: merged, second: contained, wantParts: []string{"p_1_6_1"}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, store archivetypes.Store) {
				lease := acquireTestLease(t, store)
				mustPublish(t, store, lease, newTestPublicationOf(t, store, lease, "20260903-15-0", testCase.first))
				mustPublish(t, store, lease, newTestPublicationOf(t, store, lease, "20260903-15-0", testCase.second))

				parts, err := store.ListPublishedParts(ctx, testShardPin(t, store), "20260903-15-0")
				require.NoError(t, err)
				assert.Equal(t, testCase.wantParts, partNames(parts))

				objects, err := store.ListActiveObjects(ctx, "logs_v2")
				require.NoError(t, err)
				assert.Len(t, objects, 1, "the index lists each row once")
			})
		})
	}
}

func TestPublishKeepsObjectWithAPublishedPart(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		attempt := archivetypes.NewExportAttempt(lease, testShardPin(t, store), "20260903-15-0", "archive", "fusescope")
		require.NoError(t, store.CreateAttempt(ctx, attempt))
		require.NoError(t, attempt.SetFormat([]archivetypes.ColumnMapping{{Name: "timestamp", SourceType: "UInt64", ExportType: "Int64"}}, "k/manifest.json", "sha"))
		object := archivetypes.NewObject(attempt, "k/compacted.parquet", 4096, "etag", 20)
		mustPublish(t, store, lease, &archivetypes.Publication{
			Attempt: attempt,
			Objects: []*archivetypes.Object{object},
			Parts: []*archivetypes.ArchivedPart{
				archivetypes.NewArchivedPart(attempt, object, testPart(archivetypes.BlockRange{Min: 1, Max: 2})),
				archivetypes.NewArchivedPart(attempt, object, testPart(archivetypes.BlockRange{Min: 5, Max: 6})),
			},
		})

		mustPublish(t, store, lease, newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3}))

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

		_, err := store.Publish(ctx, lease, publication)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeAttemptNotPending), err)

		published := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 4, Max: 5})
		mustPublish(t, store, lease, published)
		err = store.AbandonAttempt(ctx, published.Attempt.ID)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeAttemptNotPending), "abandoning a published attempt fails, so its objects aren't cleaned up: %v", err)
	})
}

func TestPublishRefusesStaleOrForeignLeases(t *testing.T) {
	ctx := context.Background()

	t.Run("OldEpochAfterTheSameHolderRenewedAnExpiredLease", func(t *testing.T) {
		forEachStore(t, func(t *testing.T, store archivetypes.Store) {
			old := acquireTestLease(t, store)
			publication := newTestPublication(t, store, old, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})
			_, err := store.AcquireLease(ctx, "logs", "a", time.Now().Add(-time.Second))
			require.NoError(t, err)
			renewed, err := store.AcquireLease(ctx, "logs", "a", time.Now().Add(time.Minute))
			require.NoError(t, err)
			require.Greater(t, renewed.Epoch, old.Epoch)

			_, err = store.Publish(ctx, renewed, publication)
			assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseLost), err)
		})
	})

	t.Run("AnotherSignalsLeaseAtTheSameEpoch", func(t *testing.T) {
		forEachStore(t, func(t *testing.T, store archivetypes.Store) {
			logs := acquireTestLease(t, store)
			traces, err := store.AcquireLease(ctx, "traces", "a", time.Now().Add(time.Minute))
			require.NoError(t, err)
			require.Equal(t, logs.Epoch, traces.Epoch)
			publication := newTestPublication(t, store, logs, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})

			_, err = store.Publish(ctx, traces, publication)
			assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseLost), err)
		})
	})
}

func TestPublishRollsBackALateFailure(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		mustPublish(t, store, lease, newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3}))
		again := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})

		_, err := store.Publish(ctx, lease, again)
		assert.True(t, errors.Ast(err, errors.TypeAlreadyExists), err)
		assert.True(t, errors.Asc(err, archivetypes.ErrCodePartAlreadyPublished), err)

		objects, err := store.ListActiveObjects(ctx, "logs_v2")
		require.NoError(t, err)
		assert.Len(t, objects, 1, "the objects of the failed commit are rolled back")
		require.NoError(t, store.AbandonAttempt(ctx, again.Attempt.ID), "the failed attempt is still pending")
	})
}

func TestPublishValidatesThePublication(t *testing.T) {
	ctx := context.Background()

	testCases := []struct {
		name   string
		mutate func(*archivetypes.Publication)
	}{
		{name: "NoManifestHash", mutate: func(publication *archivetypes.Publication) { publication.Attempt.ManifestSHA256 = "" }},
		{name: "NoColumnMapping", mutate: func(publication *archivetypes.Publication) { publication.Attempt.ColumnMapping = "" }},
		{name: "PartOfAnotherPartition", mutate: func(publication *archivetypes.Publication) { publication.Parts[0].PartitionID = "20260904-15-0" }},
		{name: "PartOfAnotherShard", mutate: func(publication *archivetypes.Publication) { publication.Parts[0].Shard = 2 }},
		{name: "PartOfAnotherShardPin", mutate: func(publication *archivetypes.Publication) { publication.Parts[0].ShardID = valuer.GenerateUUID() }},
		{name: "ObjectOfAnotherAttempt", mutate: func(publication *archivetypes.Publication) { publication.Objects[0].AttemptID = valuer.GenerateUUID() }},
		{name: "PartWithoutItsObject", mutate: func(publication *archivetypes.Publication) { publication.Parts[0].ObjectID = valuer.GenerateUUID() }},
		{name: "AttemptMovedToAnotherTable", mutate: func(publication *archivetypes.Publication) {
			moveTestPublication(publication, "logs_v2_resource", 1, "20260903-15-0")
		}},
		{name: "AttemptMovedToAnotherShard", mutate: func(publication *archivetypes.Publication) {
			moveTestPublication(publication, "logs_v2", 2, "20260903-15-0")
		}},
		{name: "AttemptMovedToAnotherPartition", mutate: func(publication *archivetypes.Publication) {
			moveTestPublication(publication, "logs_v2", 1, "20260904-15-0")
		}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, store archivetypes.Store) {
				lease := acquireTestLease(t, store)
				publication := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})
				testCase.mutate(publication)

				_, err := store.Publish(ctx, lease, publication)
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput), err)

				for _, partitionID := range []string{"20260903-15-0", "20260904-15-0"} {
					parts, err := store.ListPublishedParts(ctx, testShardPin(t, store), partitionID)
					require.NoError(t, err)
					assert.Empty(t, parts)
				}
			})
		})
	}
}

func TestIndexSnapshot(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		snapshot, err := store.IndexSnapshot(ctx, "logs_v2")
		require.NoError(t, err)
		assert.Equal(t, int64(0), snapshot.Sequence)
		assert.Empty(t, snapshot.Objects)

		lease := acquireTestLease(t, store)
		first := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})
		assert.Equal(t, int64(1), mustPublish(t, store, lease, first))
		assert.Equal(t, int64(2), mustPublish(t, store, lease, newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 6})))

		snapshot, err = store.IndexSnapshot(ctx, "logs_v2")
		require.NoError(t, err)
		assert.Equal(t, int64(2), snapshot.Sequence, "each commit of the table moves the sequence")
		require.Len(t, snapshot.Objects, 1)
		assert.Contains(t, snapshot.Objects[0].ObjectKey, "p_1_6")

		deleteAttempt(t, store, first.Attempt)
		assert.Equal(t, int64(3), mustPublish(t, store, lease, newTestPublication(t, store, lease, "20260904-15-0", archivetypes.BlockRange{Min: 1, Max: 3})), "a cleaned-up attempt doesn't move the sequence back")

		other, err := store.IndexSnapshot(ctx, "logs_v2_resource")
		require.NoError(t, err)
		assert.Equal(t, int64(0), other.Sequence, "sequences are per table")
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

	migrations := migrate.NewMigrations()
	for _, migrationFactory := range []factory.ProviderFactory[sqlmigration.SQLMigration, sqlmigration.Config]{sqlmigration.NewAddArchiveFactory(store, schema), sqlmigration.NewAddArchiveBackstopTableFactory(schema), sqlmigration.NewAddArchiveIndexSequenceFactory(schema), sqlmigration.NewAddArchiveShardPinFactory(schema)} {
		migration, err := migrationFactory.New(ctx, factorytest.NewSettings(), sqlmigration.Config{})
		require.NoError(t, err)
		require.NoError(t, migration.Register(migrations))
	}
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

func mustPublish(t *testing.T, store archivetypes.Store, lease *archivetypes.Lease, publication *archivetypes.Publication) int64 {
	t.Helper()

	sequence, err := store.Publish(context.Background(), lease, publication)
	require.NoError(t, err)
	return sequence
}

func deleteAttempt(t *testing.T, archiveStore archivetypes.Store, attempt *archivetypes.Attempt) {
	t.Helper()
	ctx := context.Background()

	db := archiveStore.(*store).sqlstore.BunDB()
	_, err := db.NewDelete().Model(new(archivetypes.ArchivedPart)).Where("attempt_id = ?", attempt.ID).Exec(ctx)
	require.NoError(t, err)
	_, err = db.NewDelete().Model(new(archivetypes.Object)).Where("attempt_id = ?", attempt.ID).Exec(ctx)
	require.NoError(t, err)
	_, err = db.NewDelete().Model(attempt).WherePK().Exec(ctx)
	require.NoError(t, err)
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

	parts := make([]archivetypes.Part, len(ranges))
	for i, blocks := range ranges {
		parts[i] = testPart(blocks)
	}
	return newTestPublicationOf(t, store, lease, partitionID, parts...)
}

func newTestPublicationOf(t *testing.T, store archivetypes.Store, lease *archivetypes.Lease, partitionID string, parts ...archivetypes.Part) *archivetypes.Publication {
	t.Helper()

	attempt := archivetypes.NewExportAttempt(lease, testShardPin(t, store), partitionID, "archive", "fusescope")
	require.NoError(t, store.CreateAttempt(context.Background(), attempt))
	require.NoError(t, attempt.SetFormat([]archivetypes.ColumnMapping{{Name: "timestamp", SourceType: "UInt64", ExportType: "Int64"}}, "fusescope/logs_v2/manifests/attempt="+attempt.ID.StringValue()+".json", "sha"))

	publication := &archivetypes.Publication{Attempt: attempt}
	location := archivetypes.ObjectLocation{Prefix: "fusescope", Table: "logs_v2", Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), Shard: 1, PartitionID: partitionID, AttemptID: attempt.ID.StringValue()}
	for _, part := range parts {
		object := archivetypes.NewObject(attempt, location.ObjectKey(part.Name), 1024, "etag", int64(part.Rows))
		publication.Objects = append(publication.Objects, object)
		publication.Parts = append(publication.Parts, archivetypes.NewArchivedPart(attempt, object, part))
	}

	return publication
}

// moveTestPublication points the publication at another partition than its stored attempt's.
func moveTestPublication(publication *archivetypes.Publication, table string, shard int, partitionID string) {
	publication.Attempt.TableName, publication.Attempt.Shard, publication.Attempt.PartitionID = table, shard, partitionID
	for _, part := range publication.Parts {
		part.TableName, part.Shard, part.PartitionID = table, shard, partitionID
	}
}

func testShardPin(t *testing.T, store archivetypes.Store) *archivetypes.Shard {
	t.Helper()

	pin, err := store.PinShard(context.Background(), "logs_v2", 1, "/clickhouse/tables/logs_v2/01")
	require.NoError(t, err)
	return pin
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

func TestPinShard(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		pin, err := store.PinShard(ctx, "logs_v2", 1, "/clickhouse/tables/u/01")
		require.NoError(t, err)
		again, err := store.PinShard(ctx, "logs_v2", 1, "/clickhouse/tables/u/01")
		require.NoError(t, err)
		assert.Equal(t, pin.ID, again.ID, "a pinned shard keeps its pin")
		other, err := store.PinShard(ctx, "logs_v2_resource", 1, "/clickhouse/tables/r/01")
		require.NoError(t, err)
		assert.NotEqual(t, pin.ID, other.ID, "shards are pinned per table")

		_, err = store.PinShard(ctx, "logs_v2", 1, "/clickhouse/tables/u/02")
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeShardMismatch), "the shard number now names other data: %v", err)

		_, err = store.PinShard(ctx, "logs_v2", 2, "/clickhouse/tables/u/01")
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeShardMismatch), "the data moved to another shard number: %v", err)
	})
}

func TestRepinnedShardStartsUncovered(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, archiveStore archivetypes.Store) {
		lease := acquireTestLease(t, archiveStore)
		_, err := archiveStore.Publish(ctx, lease, newTestPublication(t, archiveStore, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 5}))
		require.NoError(t, err)
		old := testShardPin(t, archiveStore)

		_, err = archiveStore.(*store).sqlstore.BunDB().NewDelete().Model(new(archivetypes.Shard)).Where("id = ?", old.ID).Exec(ctx)
		require.NoError(t, err)
		pin, err := archiveStore.PinShard(ctx, "logs_v2", 1, "/clickhouse/tables/u/02")
		require.NoError(t, err, "a deleted pin lets the shard be pinned to its new data")
		assert.NotEqual(t, old.ID, pin.ID)

		parts, err := archiveStore.ListPublishedParts(ctx, pin, "20260903-15-0")
		require.NoError(t, err)
		assert.Empty(t, parts, "the old data's ranges don't cover the new data's parts")

		attempt := archivetypes.NewExportAttempt(lease, pin, "20260903-15-0", "archive", "fusescope")
		require.NoError(t, archiveStore.CreateAttempt(ctx, attempt))
		require.NoError(t, attempt.SetFormat([]archivetypes.ColumnMapping{{Name: "timestamp", SourceType: "UInt64", ExportType: "Int64"}}, "k/manifest.json", "sha"))
		object := archivetypes.NewObject(attempt, "k/p_1_5.parquet", 1024, "etag", 10)
		_, err = archiveStore.Publish(ctx, lease, &archivetypes.Publication{
			Attempt: attempt,
			Objects: []*archivetypes.Object{object},
			Parts:   []*archivetypes.ArchivedPart{archivetypes.NewArchivedPart(attempt, object, testPart(archivetypes.BlockRange{Min: 1, Max: 5}))},
		})
		require.NoError(t, err, "the new data may reuse a published part name")

		previous, err := archiveStore.ListPublishedParts(ctx, old, "20260903-15-0")
		require.NoError(t, err)
		assert.Equal(t, []string{"p_1_5"}, partNames(previous), "the old data's parts stay published")
	})
}
