package implarchive

import (
	"context"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRehydrationLifecycle(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		_, err := store.NextRehydration(ctx, "logs")
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeRehydrationNotFound), err)

		first, err := archivetypes.NewRehydration("logs", time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), time.Hour, "admin@example.com")
		require.NoError(t, err)
		require.NoError(t, store.CreateRehydration(ctx, first))
		second, err := archivetypes.NewRehydration("logs", time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC), time.Hour, "admin@example.com")
		require.NoError(t, err)
		second.CreatedAt = first.CreatedAt.Add(time.Second)
		require.NoError(t, store.CreateRehydration(ctx, second))

		next, err := store.NextRehydration(ctx, "logs")
		require.NoError(t, err)
		assert.Equal(t, first.ID, next.ID, "the oldest restoration goes first")
		assert.True(t, first.Start.Equal(next.Start))

		next.Status, next.DDL, next.Bytes, next.Rows = archivetypes.RehydrationStatusReady, "CREATE TABLE …", 2048, 20
		require.NoError(t, store.UpdateRehydration(ctx, next))
		stored, err := store.GetRehydration(ctx, first.ID)
		require.NoError(t, err)
		assert.Equal(t, archivetypes.RehydrationStatusReady, stored.Status)
		assert.Equal(t, "CREATE TABLE …", stored.DDL)
		assert.Equal(t, int64(2048), stored.Bytes)

		next, err = store.NextRehydration(ctx, "logs")
		require.NoError(t, err)
		assert.Equal(t, second.ID, next.ID, "a ready restoration isn't loaded again")

		_, err = store.NextRehydration(ctx, "traces")
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeRehydrationNotFound), err)
		_, err = store.GetRehydration(ctx, valuer.GenerateUUID())
		assert.True(t, errors.Ast(err, errors.TypeNotFound), err)
		assert.True(t, errors.Ast(store.UpdateRehydration(ctx, &archivetypes.Rehydration{}), errors.TypeNotFound))
	})
}

func TestListRestorableParts(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		lease := acquireTestLease(t, store)
		publication := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3}, archivetypes.BlockRange{Min: 4, Max: 5})
		require.NoError(t, store.Publish(ctx, lease, publication))
		merged := newTestPublication(t, store, lease, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 5})
		require.NoError(t, store.Publish(ctx, lease, merged))
		require.NoError(t, store.CreateAttempt(ctx, archivetypes.NewExportAttempt(lease, "logs_v2", 1, "20260903-15-0", "archive", "fusescope")))

		parts, err := store.ListRestorableParts(ctx, "logs_v2", "2026-09-03")
		require.NoError(t, err)
		require.Len(t, parts, 1, "superseded parts and unpublished attempts aren't restorable")
		assert.Equal(t, "p_1_5", parts[0].Part.PartName)
		assert.Equal(t, merged.Objects[0].ObjectKey, parts[0].Object.ObjectKey)
		assert.Equal(t, merged.Attempt.ID, parts[0].Attempt.ID)
		assert.NotEmpty(t, parts[0].Attempt.ColumnMapping)

		for _, other := range []struct{ table, day string }{{"logs_v2", "2026-09-04"}, {"logs_v2_resource", "2026-09-03"}, {"logs_v2", "2026-09-0_"}} {
			parts, err := store.ListRestorableParts(ctx, other.table, other.day)
			require.NoError(t, err)
			assert.Empty(t, parts, "%s on %s", other.table, other.day)
		}
	})
}
