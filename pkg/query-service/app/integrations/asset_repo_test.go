package integrations

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testLease = time.Minute

var (
	activeOperation       = cloudintegrationtypes.IntegrationOperationStateActive
	uninstallingOperation = cloudintegrationtypes.IntegrationOperationStateUninstalling
)

func assertCode(t *testing.T, err error, code errors.Code) {
	t.Helper()
	require.Error(t, err)
	_, got, _, _, _, _ := errors.Unwrapb(err)
	assert.Equal(t, code, got, "got %v", err)
}

func TestIntegrationOperation(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			repo, err := NewInstalledIntegrationsSqliteRepo(open(t))
			require.NoError(t, err)
			org := valuer.GenerateUUID().StringValue()
			now := time.Now()
			acquire := func(state cloudintegrationtypes.IntegrationOperationState, at time.Time) (*integrationOperation, error) {
				return repo.acquireIntegrationOperation(ctx, org, "builtin-demo", state, at, testLease)
			}

			install, err := acquire(activeOperation, now)
			require.NoError(t, err)
			assert.EqualValues(t, 1, install.generation)
			_, err = acquire(activeOperation, now.Add(testLease-time.Second))
			assertCode(t, err, ErrCodeIntegrationBusy)
			_, err = acquire(uninstallingOperation, now.Add(testLease-time.Second))
			assertCode(t, err, ErrCodeIntegrationBusy)

			require.NoError(t, repo.releaseIntegrationOperation(ctx, install, now))
			upgrade, err := acquire(activeOperation, now)
			require.NoError(t, err, "a released operation is taken over at once")
			assert.EqualValues(t, 2, upgrade.generation)

			uninstall, err := acquire(uninstallingOperation, now.Add(testLease))
			require.NoError(t, err, "an expired lease is taken over")
			assert.EqualValues(t, 3, uninstall.generation)
			ran := false
			err = repo.runInOperation(ctx, upgrade, now, testLease, func(context.Context) error { ran = true; return nil })
			assertCode(t, err, ErrCodeIntegrationBusy)
			assert.False(t, ran, "an operation that was taken over runs nothing")

			require.NoError(t, repo.releaseIntegrationOperation(ctx, uninstall, now))
			_, err = acquire(activeOperation, now.Add(10*testLease))
			assertCode(t, err, ErrCodeIntegrationUninstalling)
			again, err := acquire(uninstallingOperation, now)
			require.NoError(t, err, "uninstalling again takes an unfinished uninstallation over")

			require.NoError(t, repo.runInOperation(ctx, again, now, testLease, func(ctx context.Context) error {
				return repo.finishUninstallation(ctx, again, now)
			}))
			reinstall, err := acquire(activeOperation, now)
			require.NoError(t, err)
			assert.Greater(t, reinstall.generation, again.generation+1, "no generation is held twice")
			err = repo.runInOperation(ctx, install, now, testLease, func(context.Context) error { ran = true; return nil })
			assertCode(t, err, ErrCodeIntegrationBusy)
			assert.False(t, ran)
		})
	}
}

// A step of an operation that was taken over writes nothing: its
// transaction is rolled back with the confirming update.
func TestRunInOperationWritesNothingOnceTakenOver(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			repo, err := NewInstalledIntegrationsSqliteRepo(open(t))
			require.NoError(t, err)
			org := valuer.GenerateUUID().StringValue()
			now := time.Now()

			op, err := repo.acquireIntegrationOperation(ctx, org, "builtin-demo", activeOperation, now, testLease)
			require.NoError(t, err)
			require.NoError(t, repo.runInOperation(ctx, op, now, testLease, func(ctx context.Context) error {
				_, err := repo.reserveIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "kept", now)
				return err
			}))
			failing := errors.Newf(errors.TypeInternal, errors.CodeInternal, "creation failed")
			err = repo.runInOperation(ctx, op, now, testLease, func(ctx context.Context) error {
				if _, err := repo.reserveIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "rolled-back", now); err != nil {
					return err
				}
				return failing
			})
			assert.ErrorIs(t, err, failing)

			assets, err := repo.listIntegrationAssets(ctx, org, "builtin-demo")
			require.NoError(t, err)
			require.Len(t, assets, 1, "a failed step leaves nothing")
			assert.Equal(t, "kept", assets[0].Slug)
		})
	}
}

var dashboardKind = cloudintegrationtypes.IntegrationAssetKindDashboard

func TestAcquireIntegrationOperationConcurrently(t *testing.T) {
	const requests = 8
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			repo, err := NewInstalledIntegrationsSqliteRepo(open(t))
			require.NoError(t, err)
			org := valuer.GenerateUUID().StringValue()
			now := time.Now()

			acquireAll := func(at time.Time) (won []*integrationOperation, busy int) {
				var mu sync.Mutex
				var wg sync.WaitGroup
				for i := range requests {
					state := activeOperation
					if i%2 == 1 {
						state = uninstallingOperation
					}
					wg.Add(1)
					go func() {
						defer wg.Done()
						op, err := repo.acquireIntegrationOperation(ctx, org, "builtin-demo", state, at, testLease)
						mu.Lock()
						defer mu.Unlock()
						if err != nil {
							assert.True(t, errors.Ast(err, errors.TypeAlreadyExists), "got %v", err)
							busy++
							return
						}
						won = append(won, op)
					}()
				}
				wg.Wait()
				return won, busy
			}

			won, busy := acquireAll(now)
			require.Len(t, won, 1, "one request acquires a new operation")
			assert.Equal(t, requests-1, busy)
			first := won[0]

			won, busy = acquireAll(now.Add(testLease))
			require.Len(t, won, 1, "one request takes an expired operation over")
			assert.Equal(t, requests-1, busy)
			assert.Equal(t, first.generation+1, won[0].generation)
		})
	}
}
