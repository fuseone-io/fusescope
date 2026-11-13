package integrations

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testLease = time.Minute

var dashboardKind = cloudintegrationtypes.IntegrationAssetKindDashboard

func TestClaimIntegrationAsset(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			repo, err := NewInstalledIntegrationsSqliteRepo(open(t))
			require.NoError(t, err)
			org := valuer.GenerateUUID().StringValue()
			now := time.Now()

			claimed, outcome, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "overview", now, testLease)
			require.NoError(t, err)
			require.Equal(t, assetClaimed, outcome)
			assert.Equal(t, cloudintegrationtypes.IntegrationAssetStateCreating, claimed.State)
			assert.EqualValues(t, 1, claimed.Generation)
			assert.NotEmpty(t, claimed.ResourceID, "the resource ID is chosen before the resource is created")

			busy, outcome, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "overview", now.Add(testLease-time.Second), testLease)
			require.NoError(t, err)
			assert.Equal(t, assetBusy, outcome, "a live lease is not taken over")
			assert.Equal(t, claimed.ID, busy.ID)

			other, outcome, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", cloudintegrationtypes.IntegrationAssetKindAlert, "overview", now, testLease)
			require.NoError(t, err)
			assert.Equal(t, assetClaimed, outcome, "an alert and a dashboard may share a slug")
			assert.NotEqual(t, claimed.ResourceID, other.ResourceID)

			ok, err := repo.finalizeIntegrationAsset(ctx, claimed.ID, claimed.Generation, "1.0.0", now)
			require.NoError(t, err)
			assert.True(t, ok)
			ready, outcome, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "overview", now.Add(2*testLease), testLease)
			require.NoError(t, err)
			assert.Equal(t, assetReady, outcome)
			assert.Equal(t, claimed.ResourceID, ready.ResourceID)
			assert.Equal(t, "1.0.0", ready.Version)
			assert.Zero(t, ready.LeaseUntil)

			ok, err = repo.setIntegrationAssetVersion(ctx, ready.ID, ready.Generation, "1.1.0", now)
			require.NoError(t, err)
			assert.True(t, ok)
			ok, err = repo.setIntegrationAssetVersion(ctx, ready.ID, ready.Generation+1, "1.2.0", now)
			require.NoError(t, err)
			assert.False(t, ok, "a version is recorded only on the generation it was read at")

			require.NoError(t, repo.markIntegrationAssetDeleting(ctx, ready.ID, now))
			deleting, outcome, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "overview", now, testLease)
			require.NoError(t, err)
			assert.Equal(t, assetDeleting, outcome, "an asset being removed cannot be claimed")
			assert.Greater(t, deleting.Generation, ready.Generation)
			ok, err = repo.setIntegrationAssetVersion(ctx, ready.ID, deleting.Generation, "1.2.0", now)
			require.NoError(t, err)
			assert.False(t, ok, "a deleting asset is not marked ready")

			require.NoError(t, repo.deleteIntegrationAsset(ctx, ready.ID))
			require.NoError(t, repo.deleteIntegrationAsset(ctx, ready.ID), "deleting is idempotent")
			gone, err := repo.getIntegrationAsset(ctx, ready.ID)
			require.NoError(t, err)
			assert.Nil(t, gone)
			again, outcome, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "overview", now, testLease)
			require.NoError(t, err)
			assert.Equal(t, assetClaimed, outcome)
			assert.NotEqual(t, claimed.ResourceID, again.ResourceID, "a new claim reserves a new resource")
		})
	}
}

// A creation whose lease passed is taken over with its resource ID, so the
// new holder finds or makes the same resource, and the old holder can no
// longer finalize.
func TestClaimIntegrationAssetTakesOverAnExpiredLease(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			repo, err := NewInstalledIntegrationsSqliteRepo(open(t))
			require.NoError(t, err)
			org := valuer.GenerateUUID().StringValue()
			now := time.Now()

			first, _, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "overview", now, testLease)
			require.NoError(t, err)
			second, outcome, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "overview", now.Add(testLease), testLease)
			require.NoError(t, err)
			require.Equal(t, assetClaimed, outcome)
			assert.Equal(t, first.ID, second.ID)
			assert.Equal(t, first.ResourceID, second.ResourceID)
			assert.Equal(t, first.Generation+1, second.Generation)

			ok, err := repo.finalizeIntegrationAsset(ctx, first.ID, first.Generation, "1.0.0", now)
			require.NoError(t, err)
			assert.False(t, ok, "the holder that lost its lease cannot finalize")
			ok, err = repo.finalizeIntegrationAsset(ctx, second.ID, second.Generation, "1.0.0", now)
			require.NoError(t, err)
			assert.True(t, ok)
		})
	}
}

func TestClaimIntegrationAssetConcurrently(t *testing.T) {
	const installers = 8
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			repo, err := NewInstalledIntegrationsSqliteRepo(open(t))
			require.NoError(t, err)
			org := valuer.GenerateUUID().StringValue()
			now := time.Now()

			claimAll := func(at time.Time) map[assetClaim][]*cloudintegrationtypes.StorableIntegrationAsset {
				var mu sync.Mutex
				var wg sync.WaitGroup
				outcomes := map[assetClaim][]*cloudintegrationtypes.StorableIntegrationAsset{}
				for range installers {
					wg.Add(1)
					go func() {
						defer wg.Done()
						row, outcome, err := repo.claimIntegrationAsset(ctx, org, "builtin-demo", dashboardKind, "overview", at, testLease)
						if !assert.NoError(t, err) {
							return
						}
						mu.Lock()
						outcomes[outcome] = append(outcomes[outcome], row)
						mu.Unlock()
					}()
				}
				wg.Wait()
				return outcomes
			}

			fresh := claimAll(now)
			require.Len(t, fresh[assetClaimed], 1, "one installer claims a new asset")
			assert.Len(t, fresh[assetBusy], installers-1)

			expired := claimAll(now.Add(testLease))
			require.Len(t, expired[assetClaimed], 1, "one installer takes over an expired lease")
			assert.Len(t, expired[assetBusy], installers-1)
			assert.EqualValues(t, 2, expired[assetClaimed][0].Generation)
			assert.Equal(t, fresh[assetClaimed][0].ResourceID, expired[assetClaimed][0].ResourceID)

			assets, err := repo.listIntegrationAssets(ctx, org, "builtin-demo")
			require.NoError(t, err)
			assert.Len(t, assets, 1)
		})
	}
}
