package parity

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
)

// evidence is a group's exact distribution as ClickHouse describes it for the engine's value v:
// its size, the order statistics around the exact rank of q, and how many values are below and at
// or below v.
func evidence(values []float64, q, v float64) QuantileEvidence {
	n := len(values)
	e := QuantileEvidence{N: int64(n)}
	if n == 0 {
		return e
	}
	low, high := orderStatisticRanks(q, int64(n))
	e.Low, e.High = values[low-1], values[high-1]
	for _, x := range values {
		if x < v {
			e.Below++
		}
		if x <= v {
			e.AtOrBelow++
		}
	}
	return e
}

func sequence(n int) []float64 {
	values := make([]float64, n)
	for i := range values {
		values[i] = float64(i + 1)
	}
	return values
}

func TestAQuantileWithinTheOrderStatisticsIsAnAcceptedApproximation(t *testing.T) {
	// 200, 200, 200, 400, 400, 800: the p99's exact rank, 5.95, lies between 400 and 800.
	values := []float64{200, 200, 200, 400, 400, 800}
	for _, v := range []float64{400, 664, 780, 800} {
		assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, JudgeQuantile(0.99, v, evidence(values, 0.99, v)), "v=%v", v)
	}
}

func TestAQuantileOutsideTheOrderStatisticsBlocks(t *testing.T) {
	values := []float64{200, 200, 200, 400, 400, 800}
	for _, v := range []float64{399, 801, 0} {
		assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Blocking}, JudgeQuantile(0.99, v, evidence(values, 0.99, v)), "v=%v", v)
	}
}

func TestALargeSampleIsJudgedByRankError(t *testing.T) {
	values := sequence(100_000)
	cases := []struct {
		q, v   float64
		accept bool
	}{
		{0.5, 50_000, true},
		{0.5, 52_000, true},  // rank error 0.02, under 0.025
		{0.5, 53_000, false}, // 0.03
		{0.99, 99_050, true}, // 0.0005, under about 0.001
		{0.99, 99_200, false},
		{0.999, 99_905, true}, // 0.00005, under about 0.0001
		{0.999, 99_950, false},
	}
	for _, c := range cases {
		want := Verdict{Category: CategoryApproximation, Disposition: Accepted}
		if !c.accept {
			want.Disposition = Blocking
		}
		assert.Equal(t, want, JudgeQuantile(c.q, c.v, evidence(values, c.q, c.v)), "q=%v v=%v", c.q, c.v)
	}
}

func TestTiesAreJudgedByTheRankIntervalOfTheValue(t *testing.T) {
	// 10 000 values, the middle 4 000 all 7: v = 7 spans ranks 0.3 to 0.7, and covers the p50.
	values := make([]float64, 0, 10_000)
	for i := 0; i < 3_000; i++ {
		values = append(values, 1)
	}
	for i := 0; i < 4_000; i++ {
		values = append(values, 7)
	}
	for i := 0; i < 3_000; i++ {
		values = append(values, 9)
	}
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, JudgeQuantile(0.5, 7, evidence(values, 0.5, 7)))
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Blocking}, JudgeQuantile(0.5, 9, evidence(values, 0.5, 9)), "9 starts at rank 0.7")
}

func TestAnEmptyGroupIsARowDifference(t *testing.T) {
	assert.Equal(t, Verdict{Category: CategoryRows, Disposition: Blocking}, JudgeQuantile(0.99, 5, evidence(nil, 0.99, 5)))
}

func TestASingleValueGroupNeedsThatValue(t *testing.T) {
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, JudgeQuantile(0.99, 42, evidence([]float64{42}, 0.99, 42)))
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Blocking}, JudgeQuantile(0.99, 41, evidence([]float64{42}, 0.99, 41)))
}

func TestAConstantOrZeroGroupNeedsItsValue(t *testing.T) {
	zeros := []float64{0, 0, 0, 0, 0}
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, JudgeQuantile(0.95, 0, evidence(zeros, 0.95, 0)))
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Blocking}, JudgeQuantile(0.95, 1, evidence(zeros, 0.95, 1)), "no relative tolerance around a zero")
}

func TestTheOrderStatisticRanksSurroundTheExactRank(t *testing.T) {
	for _, c := range []struct {
		q         float64
		n         int64
		low, high int64
	}{
		{0.99, 6, 5, 6},  // h = 5.95
		{0.5, 5, 3, 3},   // h = 3
		{0.5, 4, 2, 3},   // h = 2.5
		{0.999, 1, 1, 1}, // a single value
		{0, 10, 1, 1},
		{1, 10, 10, 10},
	} {
		low, high := orderStatisticRanks(c.q, c.n)
		assert.Equal(t, [2]int64{c.low, c.high}, [2]int64{low, high}, "q=%v n=%v", c.q, c.n)
	}
}

func TestInvalidEvidenceIsInconclusiveNeverAccepted(t *testing.T) {
	valid := evidence([]float64{1, 2, 3, 4}, 0.5, 2)
	inconclusive := Verdict{Category: CategoryApproximation, Disposition: Inconclusive}
	cases := map[string]struct {
		q, v float64
		e    QuantileEvidence
	}{
		"q below 0":          {-0.1, 2, valid},
		"q above 1":          {1.1, 2, valid},
		"q not a number":     {math.NaN(), 2, valid},
		"v not finite":       {0.5, math.Inf(1), valid},
		"negative size":      {0.5, 2, QuantileEvidence{N: -1, Low: 1, High: 2}},
		"more at or below":   {0.5, 2, QuantileEvidence{N: 4, Low: 2, High: 3, Below: 1, AtOrBelow: 5}},
		"below past at":      {0.5, 2, QuantileEvidence{N: 4, Low: 2, High: 3, Below: 3, AtOrBelow: 2}},
		"negative below":     {0.5, 2, QuantileEvidence{N: 4, Low: 2, High: 3, Below: -1, AtOrBelow: 2}},
		"low past high":      {0.5, 2, QuantileEvidence{N: 4, Low: 3, High: 2, Below: 1, AtOrBelow: 2}},
		"low not finite":     {0.5, 2, QuantileEvidence{N: 4, Low: math.NaN(), High: 3, Below: 1, AtOrBelow: 2}},
		"rank past the size": {0.5, 2, QuantileEvidence{N: 100_000, Low: 2, High: 2, Below: 100_001, AtOrBelow: 200_000}},
	}
	for name, c := range cases {
		assert.Equal(t, inconclusive, JudgeQuantile(c.q, c.v, c.e), name)
	}
	assert.Equal(t, Verdict{Category: CategoryRows, Disposition: Blocking}, JudgeQuantile(0.5, 2, QuantileEvidence{}), "an empty group is still a row difference")
}
