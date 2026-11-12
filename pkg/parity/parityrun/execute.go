package parityrun

import (
	"context"
	"slices"
	"strings"
	"sync"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

// done is a pair that ran: its record, and whether it is to run again next round.
type done struct {
	record  PairRecord
	requeue bool
}

// execute runs the pairs, at most Concurrency at once, under the round's budget, and returns what
// each reached, in plan order. A pair the budget cuts, during its calls or its evidence, is
// planned and not reached.
func (r Round) execute(ctx context.Context, fp *parity.Fingerprinter, pairs []pair) []*done {
	runner := parityexec.Runner{Engine: r.Engine, ClickHouse: r.ClickHouse, Refuser: r.Refuser, Seed: r.Seed, Deadline: r.Config.Deadline, RetryWait: r.Config.RetryWait}
	out := make([]*done, len(pairs))
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
			if result.Outcome.Canceled || ctx.Err() != nil {
				return
			}
			rec := r.record(telemetrystore.WithService(ctx, subject), fp, p, result)
			if ctx.Err() != nil {
				return
			}
			out[i] = &done{record: rec, requeue: result.Outcome.Requeue}
		}()
	}
	wg.Wait()
	return out
}

// record is a pair's outcome as the report keeps it: compared answers become their differences,
// each classified, and the pair takes the worst disposition among them.
func (r Round) record(ctx context.Context, fp *parity.Fingerprinter, p pair, result parityexec.Result) PairRecord {
	rec := PairRecord{
		View: p.spec.View, Tenant: fp.Segment(p.spec.Org), Params: fp.Value(p.spec).MAC, WindowClass: p.spec.Class, Requeued: p.requeued,
		EngineFirst: result.EngineFirst, Attempts: result.Attempts,
		EngineMs: durationMs(result.EngineLatency), ClickHouseMs: durationMs(result.ClickHouseLatency),
	}
	for side, err := range map[string]error{"engine": result.Engine.Err, "clickhouse": result.ClickHouse.Err} {
		if e := ErrorOf(side, err); e != nil {
			rec.Errors = append(rec.Errors, *e)
		}
	}
	slices.SortStableFunc(rec.Errors, func(a, b ErrorRecord) int { return strings.Compare(a.Side, b.Side) })
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
	classified(&rec, fp, parity.Compare(engine, clickhouse, rule), classify)
	return rec
}

// classified records diffs on rec, each classified, the pair taking the worst verdict, and the
// errors the evidence met while classifying them.
func classified(rec *PairRecord, fp *parity.Fingerprinter, diffs []parity.Difference, classify parity.Context) {
	for _, d := range diffs {
		v := parity.Classify(d, classify)
		rec.Differences = append(rec.Differences, DifferenceRecord{Path: fp.Path(d.Path...), Kind: d.Kind, Category: v.Category, Disposition: v.Disposition})
		takeWorst(rec, v)
	}
	keepEvidenceErrors(rec, classify)
}

// keepEvidenceErrors adds to the pair's errors, once per kind, those its evidence met while its
// differences were classified, under the side "evidence".
func keepEvidenceErrors(rec *PairRecord, classify parity.Context) {
	if classify.EvidenceErrors == nil {
		return
	}
	for _, err := range classify.EvidenceErrors() {
		if e := ErrorOf("evidence", err); e != nil && !slices.Contains(rec.Errors, *e) {
			// "evidence" sorts after the sides', which record sorted: the list stays sorted.
			rec.Errors = append(rec.Errors, *e)
		}
	}
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

// compared tells whether both sides answered whole: only such pairs count as successful and enter
// the latency criterion.
func (rec PairRecord) compared() bool { return rec.Outcome == "match" || rec.Outcome == "differ" }
