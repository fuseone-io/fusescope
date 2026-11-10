package parityexec

import (
	"context"
	"encoding/json"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

// subject is who the parity is to the engine: service:parity.
const subject = "parity"

// Call asks one graph for a pair's view, the way the view's handler does, and returns the typed
// answer and the warnings of a partial answer.
type Call func(ctx context.Context, g *Graph) (any, []string, error)

// Pair is one comparison of a round, numbered for the order and for the refuser's count.
type Pair struct {
	Index int
	Call  Call
}

// Runner runs pairs on the two graphs. Each call gets a context of its own with the same deadline,
// so one side never inherits the time the other used; which side runs first alternates by the seed
// and the pair's index, half for each, so neither side's latency is biased by going second.
type Runner struct {
	Engine     *Graph
	ClickHouse *Graph
	Refuser    *Refuser
	Seed       parity.Seed
	Deadline   time.Duration
	// RetryWait is the pause before the one retry of a pair that timed out.
	RetryWait time.Duration
}

// Result is a pair's outcome, both sides of its last attempt and what it cost.
type Result struct {
	Outcome           Outcome
	Engine            Side
	ClickHouse        Side
	EngineFirst       bool
	Attempts          int
	EngineLatency     time.Duration
	ClickHouseLatency time.Duration
}

func (r Runner) engineFirst(index int) bool { return (uint64(r.Seed)+uint64(index))%2 == 0 }

// Run runs p once, and once more after RetryWait if it timed out.
func (r Runner) Run(ctx context.Context, p Pair) Result {
	result := Result{EngineFirst: r.engineFirst(p.Index)}
	for {
		result.Attempts++
		before := r.Refuser.Touches(p.Index)
		r.attempt(ctx, p, &result)
		touched := r.Refuser.Touches(p.Index) > before
		result.Outcome = Decide(result.Engine, result.ClickHouse, touched, result.Attempts > 1)
		if !result.Outcome.Retry {
			return result
		}
		select {
		case <-ctx.Done():
			result.Outcome = Outcome{Canceled: true}
			return result
		case <-time.After(r.RetryWait):
		}
	}
}

func (r Runner) attempt(ctx context.Context, p Pair, result *Result) {
	engine := func() { result.Engine, result.EngineLatency = r.side(ctx, p, r.Engine) }
	clickhouse := func() { result.ClickHouse, result.ClickHouseLatency = r.side(ctx, p, r.ClickHouse) }
	if result.EngineFirst {
		engine()
		clickhouse()
		return
	}
	clickhouse()
	engine()
}

func (r Runner) side(parent context.Context, p Pair, g *Graph) (Side, time.Duration) {
	ctx, cancel := context.WithTimeout(telemetrystore.WithService(WithPair(parent, p.Index), subject), r.Deadline)
	defer cancel()
	start := time.Now()
	answer, warnings, err := p.Call(ctx, g)
	elapsed := time.Since(start)
	if err != nil {
		return Side{Err: err}, elapsed
	}
	decoded, err := asJSON(answer)
	return Side{Answer: decoded, Warnings: warnings, Err: err}, elapsed
}

// asJSON is the answer as its handler would write it and parity reads it.
func asJSON(answer any) (any, error) {
	raw, err := json.Marshal(answer)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "error encoding an answer")
	}
	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "error decoding an answer")
	}
	return decoded, nil
}
