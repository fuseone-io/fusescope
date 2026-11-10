package parity

import (
	"bytes"
	"cmp"
	"slices"
)

// TraceReason is why a trace was sampled.
type TraceReason string

const (
	// ReasonAboveMaxRows is a trace the engine refuses as too large.
	ReasonAboveMaxRows TraceReason = "above_max_rows"
	// ReasonLargest is among the largest traces the engine still returns whole.
	ReasonLargest   TraceReason = "largest"
	ReasonWithError TraceReason = "with_error"
	// ReasonWindowed is a trace whose waterfall returns only a window.
	ReasonWindowed TraceReason = "windowed"
	ReasonRandom   TraceReason = "random"
)

// TraceCandidate is a trace of the window, with its span count and whether a span has an error.
type TraceCandidate struct {
	ID       string
	Spans    int64
	HasError bool
}

// TraceLimits are the engine's query.max_rows and the span count above which the waterfall is
// windowed.
type TraceLimits struct {
	MaxRows       int64
	WindowedAbove int64
}

// SampledTrace is a trace to compare and why it was picked.
type SampledTrace struct {
	ID     string
	Reason TraceReason
}

// Traces is up to the total of a tenant's traces, each kind up to its quota, in this order: above
// max_rows, the largest within it (max_rows included), with an error, windowed, then random ones.
// A trace listed twice is one, at its larger count.
func (s Sampler) Traces(tenant string, candidates []TraceCandidate, limits TraceLimits) []SampledTrace {
	byID := map[string]TraceCandidate{}
	for _, c := range candidates {
		prev, ok := byID[c.ID]
		if ok {
			c.Spans, c.HasError = max(c.Spans, prev.Spans), c.HasError || prev.HasError
		}
		byID[c.ID] = c
	}
	pool := make([]TraceCandidate, 0, len(byID))
	ranks := make(map[string][]byte, len(byID))
	for id, c := range byID {
		pool = append(pool, c)
		ranks[id] = s.rank("trace", tenant, "", id)
	}
	byRank := func(a, b TraceCandidate) int { return bytes.Compare(ranks[a.ID], ranks[b.ID]) }
	slices.SortFunc(pool, byRank)

	q := s.cfg.Traces
	within := func(c TraceCandidate) bool { return c.Spans <= limits.MaxRows }
	largest := slices.Clone(pool)
	slices.SortStableFunc(largest, func(a, b TraceCandidate) int { return cmp.Compare(b.Spans, a.Spans) })

	var out []SampledTrace
	chosen := map[string]bool{}
	take := func(from []TraceCandidate, quota int, reason TraceReason, keep func(TraceCandidate) bool) {
		for _, c := range from {
			if quota == 0 || len(out) == q.Total {
				return
			}
			if !chosen[c.ID] && keep(c) {
				chosen[c.ID] = true
				out = append(out, SampledTrace{ID: c.ID, Reason: reason})
				quota--
			}
		}
	}
	take(pool, q.AboveMaxRows, ReasonAboveMaxRows, func(c TraceCandidate) bool { return !within(c) })
	take(largest, q.Largest, ReasonLargest, within)
	take(pool, q.WithError, ReasonWithError, func(c TraceCandidate) bool { return c.HasError })
	take(pool, q.Windowed, ReasonWindowed, func(c TraceCandidate) bool { return within(c) && c.Spans > limits.WindowedAbove })
	take(pool, q.Total, ReasonRandom, func(TraceCandidate) bool { return true })
	return out
}
