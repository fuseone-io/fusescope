package parityrun

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
)

func coverageOf(s Summary, view string) CoverageView {
	for _, c := range s.Coverage {
		if c.View == view {
			return c
		}
	}
	return CoverageView{}
}

func TestPartialPairsOverTheLimitKeepTheRoundFromQualifying(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5, partial: true}, &store{p99: 5})
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.True(t, summary.Usable, "the round ran")
	assert.False(t, summary.Qualifying)
	assert.Contains(t, summary.Reasons, ReasonInconclusive)
}

func TestAnEngineTenTimesSlowerKeepsTheRoundFromQualifying(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5, delay: 20 * time.Millisecond}, &store{p99: 5})
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.True(t, summary.Usable)
	assert.Contains(t, summary.Reasons, ReasonLatency)
}

type failing struct{ instance string }

func (f failing) Failures(_ context.Context, start, _ time.Time) ([]parity.ExporterFailure, error) {
	minute := start.UnixNano() - start.UnixNano()%int64(time.Minute)
	return []parity.ExporterFailure{{Instance: f.instance, Minute: minute + int64(time.Minute), Reason: parity.ReasonSendFailed}}, nil
}

func TestAnObservedCollectorFailureKeepsTheRoundFromQualifying(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5}, &store{p99: 5})
	r.Health = failing{instance: "c-0"}
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.True(t, summary.Usable)
	assert.Contains(t, summary.Reasons, ReasonDualWriteUnhealthy)

	r, _, _, _ = round(t, &store{p99: 5}, &store{p99: 5})
	r.Health = failing{instance: "c-9"}
	summary, err = r.Run(context.Background())
	require.NoError(t, err)
	assert.NotContains(t, summary.Reasons, ReasonDualWriteUnhealthy, "an instance that does not serve the tenant")
}

func TestAWindowTheGateDropsLeavesItsPairsUnreached(t *testing.T) {
	engine := &store{p99: 5, extraCounts: true}
	r, _, _, _ := round(t, engine, &store{p99: 5})
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.Contains(t, summary.Reasons, ReasonCoverage)
	assert.Contains(t, summary.Reasons, ReasonTenantViewUncovered)
}

func TestTheLatencyCriterionReadsSuccessfulPairsOnly(t *testing.T) {
	tl := newTally()
	tl.plan("t", ViewSummary)
	tl.add("t", PairRecord{View: ViewSummary, Outcome: "match", EngineMs: 1, ClickHouseMs: 1})
	tl.add("t", PairRecord{View: ViewSummary, Outcome: "verdict", Category: parity.CategoryTimeout, Disposition: parity.Inconclusive, EngineMs: 30_000, ClickHouseMs: 1})
	tl.finish(NewMetrics())
	c := coverageOf(tl.Summary, ViewSummary)
	assert.Equal(t, 1, c.Successful)
	assert.InDelta(t, 1, c.EngineP95Ms, 0, "the timed-out call is not a latency")
}

func TestServicesComeFromTheServicesViewAndOperationsAreSampled(t *testing.T) {
	both := func() *store {
		return &store{p99: 5, services: []string{"only-in-the-view"}, ops: []string{"GET", "PUT", "DELETE"}}
	}
	r, _, _, _ := round(t, both(), both())
	r.Config.Sample.Operations = 2
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 4, coverageOf(summary, ViewTopOperations).Planned, "both services the view lists, though one has no gate counts, in both window classes")
	assert.Equal(t, 6, coverageOf(summary, ViewSpanList).Planned, "per class, two of the counted service's three operations, and one for the service the gate left out")
	assert.Equal(t, 4, coverageOf(summary, ViewSpanList).Reached, "the sampled operations of the counted service")
}

func TestARoundsBudgetCoversItsPlanning(t *testing.T) {
	r, _, _, dir := round(t, &store{p99: 5, delay: 30 * time.Millisecond}, &store{p99: 5, delay: 30 * time.Millisecond})
	r.Config.Budget = 10 * time.Millisecond
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.False(t, summary.Usable)
	assert.Contains(t, summary.Reasons, ReasonBudgetExhausted)
	_, records := lines(t, dir)
	assert.Zero(t, kindsOf(records)["pair"])
}

func TestACancelledRoundPublishesNothing(t *testing.T) {
	r, _, _, dir := round(t, &store{p99: 5, delay: 30 * time.Millisecond}, &store{p99: 5})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, err := r.Run(ctx)
	require.Error(t, err)
	files, _ := filepath.Glob(filepath.Join(dir, "*"))
	assert.Empty(t, files, "nor leaves a temporary file")
}

func TestAPairWhoseEvidenceOutlivesTheBudgetIsNotReached(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5}, &store{p99: 5})
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	slow := pair{spec: PairSpec{View: ViewSummary, Org: orgA}, call: func(context.Context, *parityexec.Graph) (any, []string, error) { return map[string]any{}, nil, nil },
		judge: func(ctx context.Context, _, _ any) (parity.View, parity.Context) {
			<-ctx.Done()
			return parity.Summary, parity.Context{}
		}}
	fp, err := parity.NewFingerprinter(make([]byte, parity.MinRunKeyBytes))
	require.NoError(t, err)
	got := r.execute(ctx, fp, []pair{slow})
	assert.Nil(t, got[0])
}

type blocking struct{}

func (blocking) Push(ctx context.Context, _ *prometheus.Registry) error {
	<-ctx.Done()
	return ctx.Err()
}

func TestAPushHasItsOwnDeadline(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5}, &store{p99: 5})
	r.Metrics = blocking{}
	r.Config.PushTimeout = 20 * time.Millisecond
	start := time.Now()
	summary, err := r.Run(context.Background())
	require.Error(t, err)
	assert.Less(t, time.Since(start), 5*time.Second)
	assert.Contains(t, summary.Reasons, ReasonMetricsPushFailed)
}
