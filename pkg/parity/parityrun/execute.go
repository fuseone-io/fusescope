package parityrun

import (
	"context"
	"math"
	"slices"
	"strings"
	"sync"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

// execute runs the pairs, at most Concurrency at once and within the round's budget, and writes
// their records in plan order. A pair the budget leaves out, or cancels, is planned and not reached.
func (r Round) execute(ctx context.Context, fp *parity.Fingerprinter, report ReportWriter, t *tally, pairs []pair) error {
	ctx, cancel := context.WithTimeout(ctx, r.Config.Budget)
	defer cancel()
	if len(pairs) > r.Config.MaxPairs {
		pairs = pairs[:r.Config.MaxPairs]
		t.addReason(ReasonBudgetExhausted)
	}
	runner := parityexec.Runner{Engine: r.Engine, ClickHouse: r.ClickHouse, Refuser: r.Refuser, Seed: r.Seed, Deadline: r.Config.Deadline, RetryWait: r.Config.RetryWait}
	records := make([]*PairRecord, len(pairs))
	sem := make(chan struct{}, max(r.Config.Concurrency, 1))
	var wg sync.WaitGroup
	for i, p := range pairs {
		if ctx.Err() != nil {
			break
		}
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer func() { <-sem; wg.Done() }()
			result := runner.Run(ctx, parityexec.Pair{Index: i, Call: p.call, Limit: p.limit})
			if result.Outcome.Canceled {
				return
			}
			rec := r.record(telemetrystore.WithService(ctx, subject), fp, p, result)
			records[i] = &rec
		}()
	}
	wg.Wait()
	if ctx.Err() != nil {
		t.addReason(ReasonBudgetExhausted)
	}
	for _, rec := range records {
		if rec == nil {
			continue
		}
		t.add(*rec)
		if err := report.Write(*rec); err != nil {
			return err
		}
	}
	return nil
}

// record is a pair's outcome as the report keeps it: compared answers become their differences,
// each classified, and the pair takes the worst disposition among them.
func (r Round) record(ctx context.Context, fp *parity.Fingerprinter, p pair, result parityexec.Result) PairRecord {
	rec := PairRecord{
		View: p.view, Tenant: fp.Segment(p.tenant.StringValue()), Params: fp.Value(p.params).MAC, WindowClass: p.class,
		EngineFirst: result.EngineFirst, Attempts: result.Attempts,
		EngineMs: durationMs(result.EngineLatency), ClickHouseMs: durationMs(result.ClickHouseLatency),
	}
	for side, err := range map[string]error{"engine": result.Engine.Err, "clickhouse": result.ClickHouse.Err} {
		if e := ErrorOf(side, err); e != nil {
			rec.Errors = append(rec.Errors, *e)
		}
	}
	slices.SortFunc(rec.Errors, func(a, b ErrorRecord) int { return strings.Compare(a.Side, b.Side) })
	o := result.Outcome
	switch {
	case o.BothFailed != "":
		rec.Outcome, rec.BothFailed = "both_failed", o.BothFailed
		return rec
	case o.Verdict != nil:
		rec.Outcome, rec.Category, rec.Disposition = "verdict", o.Verdict.Category, o.Verdict.Disposition
		return rec
	}
	view, classify := p.judge(ctx, result.Engine.Answer, result.ClickHouse.Answer)
	engine, rule := view.Normalize(result.Engine.Answer)
	clickhouse, _ := view.Normalize(result.ClickHouse.Answer)
	rec.Outcome = "match"
	for _, d := range parity.Compare(engine, clickhouse, rule) {
		v := parity.Classify(d, classify)
		rec.Differences = append(rec.Differences, DifferenceRecord{Path: fp.Path(d.Path...), Kind: d.Kind, Category: v.Category, Disposition: v.Disposition})
		takeWorst(&rec, v)
	}
	return rec
}

// takeWorst makes v the pair's verdict when it is the pair's first difference or worse than the
// verdict so far.
func takeWorst(rec *PairRecord, v parity.Verdict) {
	if rec.Outcome != "differ" || severity(v.Disposition) > severity(rec.Disposition) {
		rec.Category, rec.Disposition = v.Category, v.Disposition
	}
	rec.Outcome = "differ"
}

func severity(d parity.Disposition) int {
	switch d {
	case parity.Blocking:
		return 3
	case parity.Inconclusive:
		return 2
	case parity.Accepted:
		return 1
	}
	return 0
}

// tally gathers a round's summary as its pairs come in.
type tally struct {
	Summary
	counts    map[CountRecord]int
	planned   map[string]int
	reached   map[string]int
	engine    map[string][]float64
	ch        map[string][]float64
	divergent map[parity.WindowClass]int
}

func newTally() *tally {
	return &tally{counts: map[CountRecord]int{}, planned: map[string]int{}, reached: map[string]int{},
		engine: map[string][]float64{}, ch: map[string][]float64{}, divergent: map[parity.WindowClass]int{}}
}

func (t *tally) addReason(reason string) {
	if !slices.Contains(t.Reasons, reason) {
		t.Reasons = append(t.Reasons, reason)
	}
}

func (t *tally) plan(views ...string) {
	for _, v := range views {
		t.planned[v]++
	}
}

func (t *tally) add(rec PairRecord) {
	t.counts[CountRecord{View: rec.View, Outcome: rec.Outcome, Category: rec.Category, Disposition: rec.Disposition}]++
	t.reached[rec.View]++
	t.engine[rec.View] = append(t.engine[rec.View], rec.EngineMs)
	t.ch[rec.View] = append(t.ch[rec.View], rec.ClickHouseMs)
	if rec.Disposition == parity.Blocking {
		t.addReason(ReasonBlockingDifference)
	}
}

// observe fills the summary's counts and coverage, in a stable order, and the round's metrics.
func (t *tally) observe(m *Metrics) {
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
	views := slices.Sorted(mapKeys(t.planned))
	for _, view := range views {
		c := CoverageView{View: view, Planned: t.planned[view], Reached: t.reached[view], EngineP95Ms: p95(t.engine[view]), ClickHouseP95Ms: p95(t.ch[view])}
		t.Coverage = append(t.Coverage, c)
		m.Coverage(view, float64(c.Reached)/float64(c.Planned))
		for _, ms := range t.engine[view] {
			m.Latency(view, "engine", ms/1000)
		}
		for _, ms := range t.ch[view] {
			m.Latency(view, "clickhouse", ms/1000)
		}
	}
	for class, n := range t.divergent {
		for range n {
			m.Divergent(class)
		}
	}
}

// p95 is the nearest-rank 95th percentile of values.
func p95(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := slices.Sorted(slices.Values(values))
	return sorted[int(math.Ceil(0.95*float64(len(sorted))))-1]
}
