package parity

import "math"

// rankTolerance is δ in the rank error a quantile may have, δ·q·(1 − q): it narrows with the tail,
// about 0.001 at the p99 and 0.0001 at the p999.
const rankTolerance = 0.1

// QuantileEvidence is what ClickHouse says about the exact distribution of one group, for the
// value v fusescope-engine answered: the group's size, the order statistics around the exact rank
// of the quantile, and how many values are below v and at or below it.
type QuantileEvidence struct {
	N int64
	// Bounds are read only by the order statistic rule; the rank rule judges on the counts.
	Bounds    *OrderStatistics
	Below     int64
	AtOrBelow int64
}

// OrderStatistics are the two values of a group around the exact rank of its quantile.
type OrderStatistics struct {
	Low, High float64
}

// QuantileRule is how a quantile over a sample is judged.
type QuantileRule string

const (
	RuleOrderStatistics QuantileRule = "order_statistics"
	RuleRank            QuantileRule = "rank"
)

// JudgeQuantile judges the engine's value v of the quantile q against ClickHouse's exact
// distribution, chosen by the sample's resolution: when the rank tolerance is wider than one
// value, v may be off by that rank error, deliberately looser than the order statistics; when it
// is not, v must lie between the two order statistics around the exact rank. Neither rule is
// relative, so a zero or a constant group needs its exact value. An empty group is a row
// difference; evidence that describes no distribution, or a q that is not a quantile, is
// inconclusive, never accepted.
func JudgeQuantile(q, v float64, e QuantileEvidence) Verdict {
	if e.N == 0 && e.Below == 0 && e.AtOrBelow == 0 && validQuantile(q, v) {
		return Verdict{Category: CategoryRows, Disposition: Blocking}
	}
	if !validQuantile(q, v) || !e.valid() {
		return Verdict{Category: CategoryApproximation, Disposition: Inconclusive}
	}
	rule, _, _ := QuantileRuleFor(q, e.N)
	accepted := rankError(q, e) <= rankTolerance*q*(1-q)
	if rule == RuleOrderStatistics {
		if e.Bounds == nil {
			return Verdict{Category: CategoryApproximation, Disposition: Inconclusive}
		}
		accepted = e.Bounds.Low <= v && v <= e.Bounds.High
	}
	if accepted {
		return Verdict{Category: CategoryApproximation, Disposition: Accepted}
	}
	return Verdict{Category: CategoryApproximation, Disposition: Blocking}
}

// validQuantile tells whether q is a quantile and v a finite value.
func validQuantile(q, v float64) bool {
	return !math.IsNaN(q) && 0 <= q && q <= 1 && !math.IsNaN(v) && !math.IsInf(v, 0)
}

// valid tells whether the evidence describes a distribution: a positive size, finite order
// statistics in order when given, and counts that fit the size. Anything else never judges a quantile.
func (e QuantileEvidence) valid() bool {
	if b := e.Bounds; b != nil && (math.IsNaN(b.Low) || math.IsInf(b.Low, 0) || math.IsNaN(b.High) || math.IsInf(b.High, 0) || b.Low > b.High) {
		return false
	}
	return e.N > 0 && 0 <= e.Below && e.Below <= e.AtOrBelow && e.AtOrBelow <= e.N
}

// rankError is how far q is from the ranks v covers, [F(v⁻), F(v)]: below v and at or below it,
// so a value tied many times covers every rank it holds.
func rankError(q float64, e QuantileEvidence) float64 {
	n := float64(e.N)
	from, to := float64(e.Below)/n, float64(e.AtOrBelow)/n
	switch {
	case q < from:
		return from - q
	case q > to:
		return q - to
	}
	return 0
}

// orderStatisticRanks are the 1-based ranks around the exact rank of q among n values,
// h = q·(n − 1) + 1.
func orderStatisticRanks(q float64, n int64) (int64, int64) {
	h := q*float64(n-1) + 1
	low, high := int64(math.Floor(h)), int64(math.Ceil(h))
	return min(max(low, 1), n), min(max(high, 1), n)
}

// QuantileRuleFor is the rule that judges the quantile q over n values, by resolution: the order
// statistics when one value is no finer than the rank tolerance, the rank error otherwise. For the
// order statistics it also gives their 1-based ranks, which may be equal.
func QuantileRuleFor(q float64, n int64) (QuantileRule, int64, int64) {
	if rankTolerance*q*(1-q) > 1/float64(n) {
		return RuleRank, 0, 0
	}
	low, high := orderStatisticRanks(q, n)
	return RuleOrderStatistics, low, high
}
