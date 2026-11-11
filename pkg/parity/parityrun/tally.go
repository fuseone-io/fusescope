package parityrun

import (
	"math"
	"slices"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/parity"
)

// The round-level criteria of the phase 1 exit, applied to each round: a qualifying day is a day
// whose rounds all qualify (EvaluatePeriod), which is at least as strict as the daily criteria.
const (
	maxInconclusiveRatio = 0.02
	minCoverageRatio     = 0.95
	maxLatencyRatio      = 10.0
)

// The reasons that make a round unusable: it did not run as planned.
var unusableReasons = map[string]bool{
	ReasonHealthUnavailable: true, ReasonDataUnavailable: true, ReasonBudgetExhausted: true, ReasonMetricsPushFailed: true,
	ReasonRequeueUnavailable: true, ReasonRequeueFailed: true, ReasonRequeueInvalid: true,
}

type tenantView struct{ tenant, view string }

// tally gathers a round's summary as its pairs come in.
type tally struct {
	Summary
	counts     map[CountRecord]int
	planned    map[string]int
	reached    map[string]int
	successful map[string]int
	inconclusv map[string]int
	coverage   map[tenantView]bool
	engine     map[string][]float64
	ch         map[string][]float64
	divergent  map[parity.WindowClass]int
}

func newTally() *tally {
	return &tally{counts: map[CountRecord]int{}, planned: map[string]int{}, reached: map[string]int{}, successful: map[string]int{},
		inconclusv: map[string]int{}, coverage: map[tenantView]bool{},
		engine: map[string][]float64{}, ch: map[string][]float64{}, divergent: map[parity.WindowClass]int{}}
}

func (t *tally) addReason(reason string) {
	if !slices.Contains(t.Reasons, reason) {
		t.Reasons = append(t.Reasons, reason)
	}
}

// plan counts pairs of tenant's views as planned, whether or not they run.
func (t *tally) plan(tenant string, views ...string) {
	for _, v := range views {
		t.planned[v]++
		if _, seen := t.coverage[tenantView{tenant, v}]; !seen {
			t.coverage[tenantView{tenant, v}] = false
		}
	}
}

func (t *tally) add(org string, rec PairRecord) {
	t.counts[CountRecord{View: rec.View, Outcome: rec.Outcome, Category: rec.Category, Disposition: rec.Disposition}]++
	t.reached[rec.View]++
	if rec.Disposition == parity.Blocking {
		t.addReason(ReasonBlockingDifference)
	}
	if rec.Disposition == parity.Inconclusive {
		t.inconclusv[rec.View]++
	}
	if rec.compared() {
		t.successful[rec.View]++
		t.coverage[tenantView{org, rec.View}] = true
		t.engine[rec.View] = append(t.engine[rec.View], rec.EngineMs)
		t.ch[rec.View] = append(t.ch[rec.View], rec.ClickHouseMs)
	}
}

// finish fills the summary's counts and coverage in a stable order, applies the round's criteria,
// and records the round's metrics.
func (t *tally) finish(m *Metrics) {
	for key, n := range t.counts {
		key.Pairs = n
		t.Counts = append(t.Counts, key)
		for range n {
			m.Pair(key.View, key.Outcome, string(key.Category), string(key.Disposition))
		}
	}
	slices.SortFunc(t.Counts, func(a, b CountRecord) int {
		return strings.Compare(a.View+a.Outcome+string(a.Category)+string(a.Disposition), b.View+b.Outcome+string(b.Category)+string(b.Disposition))
	})
	var planned, reached, inconclusive int
	for _, view := range slices.Sorted(mapKeys(t.planned)) {
		c := CoverageView{View: view, Planned: t.planned[view], Reached: t.reached[view], Successful: t.successful[view],
			EngineP95Ms: p95(t.engine[view]), ClickHouseP95Ms: p95(t.ch[view])}
		t.Coverage = append(t.Coverage, c)
		planned, reached, inconclusive = planned+c.Planned, reached+c.Reached, inconclusive+t.inconclusv[view]
		m.Coverage(view, float64(c.Reached)/float64(c.Planned))
		for _, ms := range t.engine[view] {
			m.Latency(view, "engine", ms/1000)
		}
		for _, ms := range t.ch[view] {
			m.Latency(view, "clickhouse", ms/1000)
		}
		if c.Reached > 0 && float64(t.inconclusv[view]) >= maxInconclusiveRatio*float64(c.Reached) {
			t.addReason(ReasonInconclusive)
		}
		if c.ClickHouseP95Ms > 0 && c.EngineP95Ms/c.ClickHouseP95Ms >= maxLatencyRatio {
			t.addReason(ReasonLatency)
		}
	}
	if reached > 0 && float64(inconclusive) >= maxInconclusiveRatio*float64(reached) {
		t.addReason(ReasonInconclusive)
	}
	if planned > 0 && float64(reached) < minCoverageRatio*float64(planned) {
		t.addReason(ReasonCoverage)
	}
	for _, covered := range t.coverage {
		if !covered {
			t.addReason(ReasonTenantViewUncovered)
			break
		}
	}
	for class, n := range t.divergent {
		for range n {
			m.Divergent(class)
		}
	}
	t.settle()
}

// settle decides usable and qualifying from the reasons gathered.
func (t *tally) settle() {
	t.Usable = !slices.ContainsFunc(t.Reasons, func(r string) bool { return unusableReasons[r] })
	t.Qualifying = len(t.Reasons) == 0
}

// p95 is the nearest-rank 95th percentile of values.
func p95(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := slices.Sorted(slices.Values(values))
	return sorted[int(math.Ceil(0.95*float64(len(sorted))))-1]
}

func mapKeys[V any](m map[string]V) func(func(string) bool) {
	return func(yield func(string) bool) {
		for k := range m {
			if !yield(k) {
				return
			}
		}
	}
}
