package implarchive

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func TestAbandonStaleAttempts(t *testing.T) {
	ctx := context.Background()

	forEachStore(t, func(t *testing.T, archiveStore archivetypes.Store) {
		crashed := acquireTestLease(t, archiveStore)
		stale := newTestPublication(t, archiveStore, crashed, "20260903-15-0", archivetypes.BlockRange{Min: 1, Max: 3})
		published := newTestPublication(t, archiveStore, crashed, "20260903-15-0", archivetypes.BlockRange{Min: 4, Max: 5})
		_, err := archiveStore.Publish(ctx, crashed, published)
		require.NoError(t, err)
		otherSignal, err := archiveStore.AcquireLease(ctx, "traces", "a", time.Now().Add(time.Minute))
		require.NoError(t, err)
		otherSignalAttempt := archivetypes.NewExportAttempt(otherSignal, testShardPin(t, archiveStore), "20260903-15-0", "archive", "fusescope")
		require.NoError(t, archiveStore.CreateAttempt(ctx, otherSignalAttempt))

		_, err = archiveStore.AcquireLease(ctx, "logs", "a", time.Now().Add(-time.Second))
		require.NoError(t, err)
		current, err := archiveStore.AcquireLease(ctx, "logs", "b", time.Now().Add(time.Minute))
		require.NoError(t, err)
		require.Greater(t, current.Epoch, crashed.Epoch)
		ongoing := newTestPublication(t, archiveStore, current, "20260903-15-0", archivetypes.BlockRange{Min: 6, Max: 6})

		abandoned, err := archiveStore.AbandonStaleAttempts(ctx, current)
		require.NoError(t, err)

		assert.Equal(t, int64(1), abandoned)
		statuses := attemptStatuses(t, archiveStore)
		assert.Equal(t, archivetypes.AttemptStatusAbandoned, statuses[stale.Attempt.ID], "a pending attempt of an earlier epoch can never commit")
		assert.Equal(t, archivetypes.AttemptStatusPublished, statuses[published.Attempt.ID])
		assert.Equal(t, archivetypes.AttemptStatusPending, statuses[ongoing.Attempt.ID], "the holder's own attempts are left alone")
		assert.Equal(t, archivetypes.AttemptStatusPending, statuses[otherSignalAttempt.ID], "another signal's attempts are fenced by its own lease")
	})
}

func attemptStatuses(t *testing.T, archiveStore archivetypes.Store) map[valuer.UUID]string {
	t.Helper()

	var attempts []*archivetypes.Attempt
	require.NoError(t, archiveStore.(*store).sqlstore.BunDB().NewSelect().Model(&attempts).Scan(context.Background()))
	statuses := make(map[valuer.UUID]string, len(attempts))
	for _, attempt := range attempts {
		statuses[attempt.ID] = attempt.Status
	}
	return statuses
}
