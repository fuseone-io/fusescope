package implarchive

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

const testLeaseDuration = 400 * time.Millisecond

// renewalFailingStore fails every renewal after the first acquisition with renewErr.
type renewalFailingStore struct {
	archivetypes.Store
	renewErr func(renewal int64) error
	calls    atomic.Int64
}

func (store *renewalFailingStore) AcquireLease(ctx context.Context, signal string, holder string, expiresAt time.Time) (*archivetypes.Lease, error) {
	call := store.calls.Add(1)
	if call > 1 && expiresAt.After(time.Now()) {
		if err := store.renewErr(call - 1); err != nil {
			return nil, err
		}
	}
	return store.Store.AcquireLease(ctx, signal, holder, expiresAt)
}

func TestRunUnderLease(t *testing.T) {
	ctx := context.Background()
	logger := instrumentationtest.New().Logger()

	forEachStore(t, func(t *testing.T, store archivetypes.Store) {
		ran := false
		err := runUnderLease(ctx, store, logger, "logs", "a", leaseDuration, func(ctx context.Context, lease *archivetypes.Lease) error {
			ran = true
			_, err := store.AcquireLease(ctx, "logs", "b", time.Now().Add(time.Minute))
			assert.True(t, errors.Asc(err, archivetypes.ErrCodeLeaseHeld), "the lease is held while fn runs: %v", err)
			return nil
		})
		require.NoError(t, err)
		assert.True(t, ran)

		_, err = store.AcquireLease(ctx, "logs", "b", time.Now().Add(time.Minute))
		require.NoError(t, err, "the lease is released once fn returns")

		err = runUnderLease(ctx, store, logger, "logs", "a", leaseDuration, func(context.Context, *archivetypes.Lease) error {
			t.Error("fn ran while another backend holds the lease")
			return nil
		})
		require.NoError(t, err)
	})
}

func TestRunUnderLeaseRenewal(t *testing.T) {
	logger := instrumentationtest.New().Logger()
	transient := errors.New(errors.TypeInternal, errors.CodeInternal, "metastore unavailable")

	testCases := []struct {
		name       string
		renewErr   func(renewal int64) error
		wantCancel bool
	}{
		{name: "Renewed_KeepsRunning", renewErr: func(int64) error { return nil }},
		{name: "TakenOver_Cancels", renewErr: func(int64) error {
			return errors.New(errors.TypeAlreadyExists, archivetypes.ErrCodeLeaseHeld, "held by b")
		}, wantCancel: true},
		{name: "OneTransientError_KeepsRunning", renewErr: func(renewal int64) error {
			if renewal == 1 {
				return transient
			}
			return nil
		}},
		{name: "TransientErrorsUntilExpiry_CancelsBeforeExpiry", renewErr: func(int64) error { return transient }, wantCancel: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			store := &renewalFailingStore{Store: newTestStore(t), renewErr: testCase.renewErr}
			started := time.Now()

			err := runUnderLease(context.Background(), store, logger, "logs", "a", testLeaseDuration, func(ctx context.Context, _ *archivetypes.Lease) error {
				select {
				case <-ctx.Done():
					assert.True(t, testCase.wantCancel, "cancelled although the lease was kept")
					assert.Less(t, time.Since(started), testLeaseDuration, "cancelled only once the lease had expired")
				case <-time.After(3 * testLeaseDuration):
					assert.False(t, testCase.wantCancel, "not cancelled although the lease was lost")
				}
				return nil
			})
			require.NoError(t, err)
		})
	}
}
