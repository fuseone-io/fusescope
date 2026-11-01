package implarchive

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

func TestCycle(t *testing.T) {
	forEachStore(t, func(t *testing.T, archiveStore archivetypes.Store) {
		ctx := context.Background()
		cycle := archivetypes.NewCycle(acquireTestLease(t, archiveStore))
		require.NoError(t, archiveStore.StartCycle(ctx, cycle))

		finishedAt := time.Now().UTC().Truncate(time.Second)
		require.NoError(t, archiveStore.FinishCycle(ctx, cycle, archivetypes.CycleStatusDone, finishedAt))

		stored := new(archivetypes.Cycle)
		require.NoError(t, archiveStore.(*store).sqlstore.BunDB().NewSelect().Model(stored).Where("id = ?", cycle.ID).Scan(ctx))
		assert.Equal(t, archivetypes.CycleStatusDone, stored.Status)
		require.NotNil(t, stored.FinishedAt)
		assert.True(t, finishedAt.Equal(*stored.FinishedAt))
	})
}

func TestRecordInventory(t *testing.T) {
	forEachStore(t, func(t *testing.T, archiveStore archivetypes.Store) {
		ctx := context.Background()
		lease := acquireTestLease(t, archiveStore)
		cycle := archivetypes.NewCycle(lease)
		require.NoError(t, archiveStore.StartCycle(ctx, cycle))
		pin := testShardPin(t, archiveStore)
		seen := time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC)
		parts := []archivetypes.Part{
			{Name: "p_1_1_0", Range: archivetypes.BlockRange{Min: 1, Max: 1}, Rows: 3, FirstSeen: seen},
			{Name: "p_2_2_0", Range: archivetypes.BlockRange{Min: 2, Max: 2}, Rows: 4, FirstSeen: seen},
		}

		require.NoError(t, archiveStore.RecordInventory(ctx, lease, archivetypes.NewInventory(cycle, pin, "a", nil, parts, nil)))
		require.NoError(t, archiveStore.RecordInventory(ctx, lease, archivetypes.NewInventory(cycle, pin, "b", nil, parts[:1], nil)))

		inventoried, err := archiveStore.ListInventory(ctx, pin)
		require.NoError(t, err)
		byPartition := archivetypes.InventoryByPartition(inventoried)
		require.Len(t, byPartition["a"], 2)
		assert.Len(t, byPartition["b"], 1)
		assert.True(t, seen.Equal(byPartition["a"][0].FirstSeen))

		next := archivetypes.NewInventory(cycle, pin, "a", byPartition["a"], parts[1:], archivetypes.NewBlockRanges())
		require.NoError(t, archiveStore.RecordInventory(ctx, lease, next))

		inventoried, err = archiveStore.ListInventory(ctx, pin)
		require.NoError(t, err)
		byPartition = archivetypes.InventoryByPartition(inventoried)
		require.Len(t, byPartition["a"], 1, "the partition's inventory is replaced")
		assert.Equal(t, "p_2_2_0", byPartition["a"][0].Name)
		assert.Len(t, byPartition["b"], 1, "other partitions keep theirs")

		var lost []*archivetypes.LostPart
		require.NoError(t, archiveStore.(*store).sqlstore.BunDB().NewSelect().Model(&lost).Scan(ctx))
		require.Len(t, lost, 1)
		assert.Equal(t, "p_1_1_0", lost[0].PartName)
		assert.Equal(t, int64(3), lost[0].Rows)
		assert.Equal(t, pin.ID, lost[0].ShardID)
	})
}

func TestRecordInventoryFencedByLease(t *testing.T) {
	forEachStore(t, func(t *testing.T, archiveStore archivetypes.Store) {
		ctx := context.Background()
		stale := acquireTestLease(t, archiveStore)
		cycle := archivetypes.NewCycle(stale)
		require.NoError(t, archiveStore.StartCycle(ctx, cycle))
		_, err := archiveStore.AcquireLease(ctx, "logs", "a", time.Now())
		require.NoError(t, err)
		_, err = archiveStore.AcquireLease(ctx, "logs", "b", time.Now().Add(time.Minute))
		require.NoError(t, err)

		part := archivetypes.Part{Name: "p_1_1_0", Range: archivetypes.BlockRange{Min: 1, Max: 1}, Rows: 3, FirstSeen: time.Now()}
		err = archiveStore.RecordInventory(ctx, stale, archivetypes.NewInventory(cycle, testShardPin(t, archiveStore), "a", nil, []archivetypes.Part{part}, nil))
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseLost), err)
	})
}

func TestMarkPartsDropped(t *testing.T) {
	forEachStore(t, func(t *testing.T, archiveStore archivetypes.Store) {
		ctx := context.Background()
		lease := acquireTestLease(t, archiveStore)
		pin := testShardPin(t, archiveStore)
		require.NoError(t, archiveStore.Publish(ctx, lease, newTestPublication(t, archiveStore, lease, "a", archivetypes.BlockRange{Min: 1, Max: 2}, archivetypes.BlockRange{Min: 3, Max: 4}, archivetypes.BlockRange{Min: 6, Max: 6})))
		require.NoError(t, archiveStore.Publish(ctx, lease, newTestPublication(t, archiveStore, lease, "b", archivetypes.BlockRange{Min: 1, Max: 2})))

		droppedAt := time.Now().UTC().Truncate(time.Second)
		require.NoError(t, archiveStore.MarkPartsDropped(ctx, pin, "a", archivetypes.NewBlockRanges(archivetypes.BlockRange{Min: 1, Max: 4}), droppedAt))

		dropped := make(map[string]bool)
		for _, partitionID := range []string{"a", "b"} {
			parts, err := archiveStore.ListPublishedParts(ctx, pin, partitionID)
			require.NoError(t, err)
			for _, part := range parts {
				dropped[partitionID+"/"+part.PartName] = part.DroppedAt != nil
			}
		}
		assert.Equal(t, map[string]bool{"a/p_1_2": true, "a/p_3_4": true, "a/p_6_6": false, "b/p_1_2": false}, dropped, "parts merged and dropped together are marked, others kept")
	})
}
