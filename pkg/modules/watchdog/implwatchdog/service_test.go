package implwatchdog

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/lease"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/organizationtest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func TestService(t *testing.T) {
	testCases := []struct {
		name      string
		enabled   bool
		evaluated bool
	}{
		{name: "FlagOff_NeverEvaluates", enabled: false, evaluated: false},
		{name: "FlagOn_EvaluatesUnderLease", enabled: true, evaluated: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
				settings := instrumentationtest.New().ToProviderSettings()
				runner, err := lease.New(settings, sqlStore, time.Minute)
				require.NoError(t, err)
				getter := organizationtest.NewMockGetter(t)
				getter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{{Identifiable: types.Identifiable{ID: testOrgID}}}, nil).Maybe()
				evaluated := make(chan struct{}, 1)
				var holders, sessions atomic.Int32
				var evaluate evaluateFunc = func(ctx context.Context, _ valuer.UUID, _ watchdogtypes.Window) error {
					var holder string
					assert.NoError(t, sqlStore.BunDB().NewSelect().Table("lease").Column("holder").Where("name = ?", leaseName).Scan(ctx, &holder))
					if holder == runner.Holder() {
						holders.Add(1)
					}
					select {
					case evaluated <- struct{}{}:
					default:
					}
					return nil
				}
				flagger := flaggertest.WithBooleanFlags(t, map[string]bool{"watchdog": testCase.enabled})
				service := newService(settings, flagger, runner, NewModule(NewStore(sqlStore)), getter, func() evaluateFunc { sessions.Add(1); return evaluate })
				service.retryInterval = 10 * time.Millisecond

				done := make(chan error, 1)
				go func() { done <- service.Start(context.Background()) }()
				select {
				case <-evaluated:
					assert.True(t, testCase.evaluated, "evaluated with the flag off")
				case <-time.After(200 * time.Millisecond):
					assert.False(t, testCase.evaluated, "not evaluated with the flag on")
				}
				require.NoError(t, service.Stop(context.Background()))
				select {
				case err := <-done:
					assert.NoError(t, err)
				case <-time.After(5 * time.Second):
					t.Fatal("Start did not return after Stop")
				}
				if testCase.evaluated {
					assert.Equal(t, int32(1), holders.Load(), "evaluated while holding the lease")
					assert.Equal(t, int32(1), sessions.Load(), "one session per lease")
				}
			})
		})
	}
}
