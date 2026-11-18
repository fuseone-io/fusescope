package implwatchdog

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/organizationtest"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func orgs(n int) []*types.Organization {
	list := make([]*types.Organization, n)
	for i := range list {
		list[i] = &types.Organization{Identifiable: types.Identifiable{ID: valuer.MustNewUUID(fmt.Sprintf("0196e2e4-0000-7000-8000-%012d", i+1))}}
	}
	return list
}

// recorder notes which organizations each cycle started and how many ran at
// once.
type recorder struct {
	mu       sync.Mutex
	started  []valuer.UUID
	inFlight atomic.Int32
	peak     atomic.Int32
}

func (r *recorder) record(orgID valuer.UUID) func() {
	r.mu.Lock()
	r.started = append(r.started, orgID)
	r.mu.Unlock()
	n := r.inFlight.Add(1)
	for {
		peak := r.peak.Load()
		if n <= peak || r.peak.CompareAndSwap(peak, n) {
			break
		}
	}
	return func() { r.inFlight.Add(-1) }
}

func (r *recorder) take() []valuer.UUID {
	r.mu.Lock()
	defer r.mu.Unlock()
	started := r.started
	r.started = nil
	return started
}

func newTestScheduler(t *testing.T, list []*types.Organization, evaluate func(ctx context.Context, orgID valuer.UUID, window watchdogtypes.Window) error, deadline time.Duration) *scheduler {
	getter := organizationtest.NewMockGetter(t)
	getter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return(list, nil)
	s, err := newScheduler(instrumentationtest.New().ToProviderSettings(), getter, evaluate)
	require.NoError(t, err)
	s.deadline = deadline
	return s
}

func ids(list []*types.Organization, indexes ...int) []valuer.UUID {
	out := make([]valuer.UUID, len(indexes))
	for i, index := range indexes {
		out[i] = list[index].ID
	}
	return out
}

func TestScheduler_DeadlineCutsCycle_NextStartsAfterLastStarted(t *testing.T) {
	list := orgs(5)
	r := &recorder{}
	slow := func(ctx context.Context, orgID valuer.UUID, _ watchdogtypes.Window) error {
		defer r.record(orgID)()
		<-ctx.Done()
		return ctx.Err()
	}
	s := newTestScheduler(t, list, slow, 30*time.Millisecond)

	expected := [][]valuer.UUID{ids(list, 0, 1), ids(list, 2, 3), ids(list, 4, 0)}
	visited := map[valuer.UUID]bool{}
	for cycle, want := range expected {
		report := s.runCycle(context.Background(), storeStart)
		started := r.take()
		assert.ElementsMatch(t, want, started, "cycle %d", cycle)
		assert.Equal(t, map[string]int{orgSkippedDeadline: 5}, report, "cycle %d", cycle)
		for _, id := range started {
			visited[id] = true
		}
	}
	assert.Len(t, visited, len(list), "every organization is visited over successive cycles")
	assert.LessOrEqual(t, r.peak.Load(), int32(maxParallelOrgs))
}

func TestScheduler_Concurrency(t *testing.T) {
	list := orgs(7)
	r := &recorder{}
	evaluate := func(ctx context.Context, orgID valuer.UUID, _ watchdogtypes.Window) error {
		defer r.record(orgID)()
		time.Sleep(5 * time.Millisecond)
		return nil
	}
	s := newTestScheduler(t, list, evaluate, time.Minute)

	report := s.runCycle(context.Background(), storeStart)

	assert.Equal(t, map[string]int{orgEvaluated: 7}, report)
	assert.ElementsMatch(t, ids(list, 0, 1, 2, 3, 4, 5, 6), r.take())
	assert.Equal(t, int32(maxParallelOrgs), r.peak.Load())
}

func TestScheduler_FailedOrgDoesNotStopOthers(t *testing.T) {
	list := orgs(3)
	r := &recorder{}
	evaluate := func(ctx context.Context, orgID valuer.UUID, _ watchdogtypes.Window) error {
		defer r.record(orgID)()
		if orgID == list[0].ID {
			return errors.Newf(errors.TypeInternal, errors.CodeInternal, "clickhouse is down")
		}
		return nil
	}
	s := newTestScheduler(t, list, evaluate, time.Minute)

	report := s.runCycle(context.Background(), storeStart)

	assert.Equal(t, map[string]int{orgError: 1, orgEvaluated: 2}, report)
	assert.ElementsMatch(t, ids(list, 0, 1, 2), r.take())
}

func TestScheduler_OrgBudget(t *testing.T) {
	testCases := []struct {
		name     string
		deadline time.Duration
		budget   time.Duration
	}{
		{name: "CycleLong_BudgetCaps", deadline: time.Hour, budget: orgBudget},
		{name: "CycleShort_TimeLeftCaps", deadline: 10 * time.Second, budget: 10 * time.Second},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var budget time.Duration
			evaluate := func(ctx context.Context, _ valuer.UUID, _ watchdogtypes.Window) error {
				deadline, ok := ctx.Deadline()
				require.True(t, ok)
				budget = time.Until(deadline)
				return nil
			}
			s := newTestScheduler(t, orgs(1), evaluate, testCase.deadline)

			s.runCycle(context.Background(), storeStart)

			assert.InDelta(t, testCase.budget.Seconds(), budget.Seconds(), 1)
		})
	}
}

func TestScheduler_EvaluatesTheLaggedWindow(t *testing.T) {
	var window watchdogtypes.Window
	evaluate := func(_ context.Context, _ valuer.UUID, w watchdogtypes.Window) error {
		window = w
		return nil
	}
	s := newTestScheduler(t, orgs(1), evaluate, time.Minute)

	s.runCycle(context.Background(), storeStart.Add(4*time.Minute))

	assert.Equal(t, watchdogtypes.NewWindow(storeStart.Add(4*time.Minute)), window)
}
