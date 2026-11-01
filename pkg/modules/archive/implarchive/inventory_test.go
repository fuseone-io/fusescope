package implarchive

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

func TestTakeInventory(t *testing.T) {
	ctx := context.Background()
	heldSince := time.Now().Add(-20 * time.Hour)
	held := archivetypes.Part{Name: "20260903-15-0_6_6_0", Range: archivetypes.BlockRange{Min: 6, Max: 6}, DataVersion: 6, Rows: 1, FirstSeen: heldSince}
	merged := archivetypes.Part{Name: "20260903-15-0_6_7_1", Range: archivetypes.BlockRange{Min: 6, Max: 7}, DataVersion: 6, Rows: 2, FirstSeen: time.Now()}
	expired := archivetypes.Part{Name: "20260902-15-0_1_1_0", Range: archivetypes.BlockRange{Min: 1, Max: 1}, DataVersion: 1, Rows: 5, FirstSeen: heldSince}
	partition := archivetypes.Partition{ID: "20260903-15-0", Day: time.Now().AddDate(0, 0, -30), RetentionDays: 15}

	testCases := []struct {
		name         string
		complete     bool
		wantLost     []string
		wantRecorded []string
	}{
		{name: "EveryReplicaAnswered_RecordedWithLosses", complete: true, wantLost: []string{expired.Name}, wantRecorded: []string{merged.Name}},
		{name: "AReplicaMissing_NothingRecorded", wantRecorded: []string{held.Name, expired.Name}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			archiveStore := newTestStore(t)
			service := newTestExportService(t, archiveStore)
			run := newTestCycleRun(t, archiveStore)
			pin := testShardPin(t, archiveStore)
			require.NoError(t, archiveStore.RecordInventory(ctx, run.lease, archivetypes.NewInventory(run.cycle, pin, partition.ID, nil, []archivetypes.Part{held}, nil)))
			require.NoError(t, archiveStore.RecordInventory(ctx, run.lease, archivetypes.NewInventory(run.cycle, pin, "20260902-15-0", nil, []archivetypes.Part{expired}, nil)))

			jobs := []exportJob{{table: testLogsTable, partition: partition, shard: 1, pin: pin, snapshot: map[string][]archivetypes.Part{"ch-1:9000": {merged}}}}
			shard := shardSnapshot{shard: 1, pin: pin, complete: testCase.complete, partitionIDs: map[string]string{partition.ID: "ch-1:9000"}}
			service.takeInventory(ctx, run, shard, jobs)

			assert.Equal(t, heldSince.Unix(), jobs[0].snapshot["ch-1:9000"][0].FirstSeen.Unix(), "a merge of held parts keeps their first sight, across restarts")
			assert.Equal(t, int64(1), run.tally[testLogsTable.Name][archivetypes.UnarchivedLevelCritical], "a partition far past retention with nothing archived is critical")

			inventoried, err := archiveStore.ListInventory(ctx, pin)
			require.NoError(t, err)
			recorded := make([]string, 0, len(inventoried))
			for _, part := range inventoried {
				recorded = append(recorded, part.PartName)
			}
			assert.ElementsMatch(t, testCase.wantRecorded, recorded)

			var lost []*archivetypes.LostPart
			require.NoError(t, archiveStore.(*store).sqlstore.BunDB().NewSelect().Model(&lost).Scan(ctx))
			lostNames := make([]string, 0, len(lost))
			for _, part := range lost {
				lostNames = append(lostNames, part.PartName)
			}
			assert.ElementsMatch(t, testCase.wantLost, lostNames, "a partition gone before it was archived is recorded as lost")
		})
	}
}

func newTestCycleRun(t *testing.T, archiveStore archivetypes.Store) *cycleRun {
	t.Helper()

	cycle := archivetypes.NewCycle(acquireTestLease(t, archiveStore))
	require.NoError(t, archiveStore.StartCycle(context.Background(), cycle))
	return newCycleRun(acquireTestLease(t, archiveStore), cycle)
}
