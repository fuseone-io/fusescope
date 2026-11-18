package lease

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
)

func TestStoreAcquire(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlstore sqlstore.SQLStore) {
		ctx := context.Background()
		store := newStore(sqlstore)

		first, err := store.acquire(ctx, "job", "a", time.Minute)
		require.NoError(t, err)
		assert.Equal(t, Lease{Name: "job", Holder: "a", Epoch: 1}, first)

		for _, holder := range []string{"a", "b"} {
			_, err = store.acquire(ctx, "job", holder, time.Minute)
			assert.True(t, errors.Asc(err, ErrCodeHeld), "%s acquired a held lease: %v", holder, err)
		}

		other, err := store.acquire(ctx, "other", "b", time.Minute)
		require.NoError(t, err)
		assert.Equal(t, int64(1), other.Epoch, "leases are independent by name")
	})
}

func TestStoreAcquireAfterExpiry(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlstore sqlstore.SQLStore) {
		ctx := context.Background()
		store := newStore(sqlstore)

		_, err := store.acquire(ctx, "job", "a", 50*time.Millisecond)
		require.NoError(t, err)

		var taken Lease
		require.Eventually(t, func() bool {
			taken, err = store.acquire(ctx, "job", "b", time.Minute)
			return err == nil
		}, 5*time.Second, 10*time.Millisecond)
		assert.Equal(t, Lease{Name: "job", Holder: "b", Epoch: 2}, taken)
	})
}

func TestStoreRenew(t *testing.T) {
	testCases := []struct {
		name     string
		tamper   string
		wantLost bool
	}{
		{name: "Held_Renews"},
		{name: "RowStolen_Lost", tamper: "UPDATE lease SET holder = 'b'", wantLost: true},
		{name: "EpochChanged_Lost", tamper: "UPDATE lease SET epoch = epoch + 1", wantLost: true},
		{name: "Expired_Lost", tamper: "UPDATE lease SET expires_at = '2000-01-01 00:00:00+00:00'", wantLost: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, sqlstore sqlstore.SQLStore) {
				ctx := context.Background()
				store := newStore(sqlstore)
				lease, err := store.acquire(ctx, "job", "a", time.Minute)
				require.NoError(t, err)
				before := readLease(t, sqlstore)
				if testCase.tamper != "" {
					_, err = sqlstore.BunDB().ExecContext(ctx, testCase.tamper)
					require.NoError(t, err)
				}

				err = store.renew(ctx, lease, time.Hour)
				if testCase.wantLost {
					assert.True(t, errors.Asc(err, ErrCodeLost), "renewed a lost lease: %v", err)
					return
				}
				require.NoError(t, err)
				after := readLease(t, sqlstore)
				assert.Equal(t, before.Epoch, after.Epoch, "a renewal keeps the epoch")
				assert.Greater(t, after.ExpiresAt.Sub(before.ExpiresAt), 30*time.Minute)
			})
		})
	}
}

func TestStoreRelease(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlstore sqlstore.SQLStore) {
		ctx := context.Background()
		store := newStore(sqlstore)

		stale, err := store.acquire(ctx, "job", "a", 50*time.Millisecond)
		require.NoError(t, err)
		var current Lease
		require.Eventually(t, func() bool {
			current, err = store.acquire(ctx, "job", "b", time.Minute)
			return err == nil
		}, 5*time.Second, 10*time.Millisecond)

		require.NoError(t, store.release(ctx, stale))
		require.NoError(t, store.release(ctx, Lease{Name: "job", Holder: "b", Epoch: stale.Epoch}))
		_, err = store.acquire(ctx, "job", "c", time.Minute)
		assert.True(t, errors.Asc(err, ErrCodeHeld), "a stale release freed the new holder's lease: %v", err)

		require.NoError(t, store.release(ctx, current))
		next, err := store.acquire(ctx, "job", "c", time.Minute)
		require.NoError(t, err, "the holder's release frees the lease")
		assert.Equal(t, current.Epoch+1, next.Epoch, "the epoch keeps growing across releases")
	})
}
