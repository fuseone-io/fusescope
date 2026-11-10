package parity

import "math"

// rankTolerance is δ in the rank error a quantile may have, δ·q·(1 − q): it narrows with the tail,
// about 0.001 at the p99 and 0.0001 at the p999.
const rankTolerance = 0.1

// QuantileEvidence is what ClickHouse says about the exact distribution of one group, for the
// value v fusescope-engine answered: the group's size, the order statistics around the exact rank
// of the quantile, and how many values are below v and at or below it.
type QuantileEvidence struct {
	N         int64
	Low, High float64
	Below     int64
	AtOrBelow int64
}

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
	accepted := e.Low <= v && v <= e.High
	if tolerance := rankTolerance * q * (1 - q); tolerance > 1/float64(e.N) {
		accepted = rankError(q, e) <= tolerance
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
// statistics in order, and counts that fit the size. Anything else never judges a quantile.
func (e QuantileEvidence) valid() bool {
	finite := !math.IsNaN(e.Low) && !math.IsInf(e.Low, 0) && !math.IsNaN(e.High) && !math.IsInf(e.High, 0)
	return e.N > 0 && finite && e.Low <= e.High && 0 <= e.Below && e.Below <= e.AtOrBelow && e.AtOrBelow <= e.N
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
