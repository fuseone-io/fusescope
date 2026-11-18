package lease

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
)

// manualTicker hands the renewal loop a tick only when the test sends one.
type manualTicker struct {
	interval time.Duration
	ticks    chan time.Time
}

func withManualTicker(runner *Runner) *manualTicker {
	ticker := &manualTicker{ticks: make(chan time.Time)}
	runner.newTicker = func(interval time.Duration) (<-chan time.Time, func()) {
		ticker.interval = interval
		return ticker.ticks, func() {}
	}
	return ticker
}

// tick returns once the loop has taken the tick; a second tick returns once
// the first renewal is done.
func (ticker *manualTicker) tick(t *testing.T) {
	t.Helper()
	select {
	case ticker.ticks <- time.Now():
	case <-time.After(5 * time.Second):
		t.Fatal("the renewal loop took no tick")
	}
}

func newTestRunner(t *testing.T, store sqlstore.SQLStore, duration time.Duration) *Runner {
	runner, err := New(factorytest.NewSettings(), store, duration)
	require.NoError(t, err)
	return runner
}

func waitDone(t *testing.T, ctx context.Context) {
	t.Helper()
	select {
	case <-ctx.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("the callback context was not cancelled")
	}
}

func TestNewRejectsDurationsTooShortToRenew(t *testing.T) {
	for _, duration := range []time.Duration{0, -time.Second, 3} {
		_, err := New(factorytest.NewSettings(), nil, duration)
		assert.True(t, errors.Ast(err, errors.TypeInvalidInput), "duration %s: %v", duration, err)
	}
}

func TestRunOnlyOneHolderRuns(t *testing.T) {
	forEachStore(t, func(t *testing.T, store sqlstore.SQLStore) {
		const holders = 5
		var ran atomic.Int64
		release := make(chan struct{})
		results := make(chan error, holders)
		var wg sync.WaitGroup
		for range holders {
			runner := newTestRunner(t, store, time.Minute)
			wg.Add(1)
			go func() {
				defer wg.Done()
				results <- runner.Run(context.Background(), "job", func(ctx context.Context, lease Lease) error {
					ran.Add(1)
					assert.Equal(t, runner.Holder(), lease.Holder)
					<-release
					return nil
				})
			}()
		}

		for range holders - 1 {
			err := <-results
			assert.True(t, errors.Asc(err, ErrCodeHeld), "a second holder got the lease: %v", err)
		}
		close(release)
		wg.Wait()
		require.NoError(t, <-results)
		assert.Equal(t, int64(1), ran.Load())
	})
}

func TestRunReleasesTheLease(t *testing.T) {
	forEachStore(t, func(t *testing.T, store sqlstore.SQLStore) {
		ctx := context.Background()
		first := newTestRunner(t, store, time.Minute)
		var firstEpoch int64
		wantErr := errors.New(errors.TypeInternal, errors.CodeInternal, "failed")
		err := first.Run(ctx, "job", func(_ context.Context, lease Lease) error {
			firstEpoch = lease.Epoch
			return wantErr
		})
		assert.ErrorIs(t, err, wantErr)

		second := newTestRunner(t, store, time.Minute)
		require.NoError(t, second.Run(ctx, "job", func(_ context.Context, lease Lease) error {
			assert.Equal(t, firstEpoch+1, lease.Epoch, "a new holder fences the previous one")
			return nil
		}))
	})
}

func TestRunRenewsEveryQuarter(t *testing.T) {
	forEachStore(t, func(t *testing.T, store sqlstore.SQLStore) {
		runner := newTestRunner(t, store, time.Hour)
		ticker := withManualTicker(runner)

		require.NoError(t, runner.Run(context.Background(), "job", func(ctx context.Context, lease Lease) error {
			shortened := readLease(t, store).ExpiresAt.Add(-30 * time.Minute)
			_, err := store.BunDB().ExecContext(ctx, "UPDATE lease SET expires_at = ?", shortened)
			require.NoError(t, err)

			ticker.tick(t)
			assert.Equal(t, 15*time.Minute, ticker.interval)
			ticker.tick(t)
			after := readLease(t, store)
			assert.Equal(t, lease.Epoch, after.Epoch)
			assert.Greater(t, after.ExpiresAt.Sub(shortened), 20*time.Minute, "the renewal moved the expiry a duration ahead")
			assert.NoError(t, ctx.Err())
			return nil
		}))
	})
}

func TestRunCancelsOnceTheLeaseIsLost(t *testing.T) {
	testCases := []struct {
		name   string
		tamper string
	}{
		{name: "RowStolen", tamper: "UPDATE lease SET holder = 'other'"},
		{name: "EpochChanged", tamper: "UPDATE lease SET epoch = epoch + 1"},
		{name: "Expired", tamper: "UPDATE lease SET expires_at = '2000-01-01 00:00:00+00:00'"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, store sqlstore.SQLStore) {
				runner := newTestRunner(t, store, time.Hour)
				ticker := withManualTicker(runner)

				var tampered leaseRow
				require.NoError(t, runner.Run(context.Background(), "job", func(ctx context.Context, _ Lease) error {
					_, err := store.BunDB().ExecContext(ctx, testCase.tamper)
					require.NoError(t, err)
					tampered = readLease(t, store)
					ticker.tick(t)
					waitDone(t, ctx)
					assert.True(t, errors.Asc(context.Cause(ctx), ErrCodeLost), "cause: %v", context.Cause(ctx))
					return nil
				}))
				assert.Equal(t, tampered, readLease(t, store), "the stale holder's release left the row alone")
			})
		})
	}
}

func TestRunCancelsBeforeExpiryWhenRenewalsFail(t *testing.T) {
	forEachStore(t, func(t *testing.T, store sqlstore.SQLStore) {
		const duration = 800 * time.Millisecond
		runner := newTestRunner(t, store, duration)
		ticker := withManualTicker(runner)
		started := time.Now()

		require.NoError(t, runner.Run(context.Background(), "job", func(ctx context.Context, _ Lease) error {
			_, err := store.BunDB().ExecContext(ctx, "DROP TABLE lease")
			require.NoError(t, err)
			ticker.tick(t)
			ticker.tick(t)
			assert.NoError(t, ctx.Err(), "a failed renewal is retried while the lease lasts")

			waitDone(t, ctx)
			assert.Greater(t, time.Since(started), duration/2, "cancelled while the lease lasted")
			assert.Less(t, time.Since(started), duration*3/4+duration/8, "cancelled at three quarters of the lease, before its expiry")
			assert.True(t, errors.Asc(context.Cause(ctx), ErrCodeLost), "cause: %v", context.Cause(ctx))
			return nil
		}))
	})
}

func TestRunRenewalRestartsTheSafetyWindow(t *testing.T) {
	forEachStore(t, func(t *testing.T, store sqlstore.SQLStore) {
		const duration = 800 * time.Millisecond
		runner := newTestRunner(t, store, duration)
		ticker := withManualTicker(runner)
		started := time.Now()

		require.NoError(t, runner.Run(context.Background(), "job", func(ctx context.Context, _ Lease) error {
			time.Sleep(duration / 2)
			ticker.tick(t)
			ticker.tick(t)
			renewed := time.Now()

			time.Sleep(time.Until(started.Add(duration*3/4 + duration/8)))
			assert.NoError(t, ctx.Err(), "the renewal moved the window past the acquisition's three quarters")

			waitDone(t, ctx)
			assert.GreaterOrEqual(t, time.Since(renewed), duration*3/4-duration/8, "cancelled three quarters after the renewal")
			assert.Less(t, time.Since(renewed), duration*3/4+duration/8, "cancelled three quarters after the renewal")
			assert.True(t, errors.Asc(context.Cause(ctx), ErrCodeLost), "cause: %v", context.Cause(ctx))
			return nil
		}))
	})
}

func TestRunStopsWithItsContext(t *testing.T) {
	forEachStore(t, func(t *testing.T, store sqlstore.SQLStore) {
		runner := newTestRunner(t, store, time.Hour)
		ctx, cancel := context.WithCancel(context.Background())
		err := runner.Run(ctx, "job", func(ctx context.Context, _ Lease) error {
			cancel()
			waitDone(t, ctx)
			return ctx.Err()
		})
		assert.ErrorIs(t, err, context.Canceled)

		other := newTestRunner(t, store, time.Hour)
		require.NoError(t, other.Run(context.Background(), "job", func(context.Context, Lease) error { return nil }), "the lease is released although its context was cancelled")
	})
}
