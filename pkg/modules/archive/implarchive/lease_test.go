package implarchive

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

func TestRunUnderLease(t *testing.T) {
	ctx := context.Background()
	logger := instrumentationtest.New().Logger()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		ran := false
		err := runUnderLease(ctx, store, logger, "logs", "a", func(ctx context.Context, lease *archivetypes.Lease) error {
			ran = true
			_, err := store.AcquireLease(ctx, "logs", "b", time.Now().Add(time.Minute))
			assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseHeld), "the lease is held while fn runs: %v", err)
			return nil
		})
		require.NoError(t, err)
		assert.True(t, ran)

		_, err = store.AcquireLease(ctx, "logs", "b", time.Now().Add(time.Minute))
		require.NoError(t, err, "the lease is released once fn returns")

		err = runUnderLease(ctx, store, logger, "logs", "a", func(context.Context, *archivetypes.Lease) error {
			t.Error("fn ran while another backend holds the lease")
			return nil
		})
		require.NoError(t, err)
	})
}
