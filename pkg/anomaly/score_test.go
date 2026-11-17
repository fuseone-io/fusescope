package anomaly

import (
	"math"
	"slices"
	"testing"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func label(name string, value any) *qbtypes.Label {
	return &qbtypes.Label{Key: telemetrytypes.TelemetryFieldKey{Name: name}, Value: value}
}

func series(labels []*qbtypes.Label, values ...float64) *qbtypes.TimeSeries {
	out := &qbtypes.TimeSeries{Labels: labels}
	for i, v := range values {
		out.Values = append(out.Values, &qbtypes.TimeSeriesValue{Timestamp: int64(i) * 60_000, Value: v})
	}
	return out
}

// seasons builds k baselines of one series from rows of values, all on the current timeline.
func seasons(labels []*qbtypes.Label, rows ...[]float64) [][]*qbtypes.TimeSeries {
	out := make([][]*qbtypes.TimeSeries, len(rows))
	for i, row := range rows {
		out[i] = []*qbtypes.TimeSeries{series(labels, row...)}
	}
	return out
}

func repeat(v float64, n int) []float64 {
	out := make([]float64, n)
	for i := range out {
		out[i] = v
	}
	return out
}

func ramp(base, step float64, n int) []float64 {
	out := make([]float64, n)
	for i := range out {
		out[i] = base + step*float64(i)
	}
	return out
}

func values(s *qbtypes.TimeSeries) map[int64]float64 {
	out := map[int64]float64{}
	for _, v := range s.Values {
		out[v.Timestamp] = v.Value
	}
	return out
}

func TestMedianAndMAD(t *testing.T) {
	testCases := []struct {
		name   string
		input  []float64
		median float64
		mad    float64
	}{
		{name: "Odd", input: []float64{3, 1, 2}, median: 2, mad: 1},
		{name: "Even_MeanOfMiddle", input: []float64{4, 1, 3, 2}, median: 2.5, mad: 1},
		{name: "OutlierDoesNotMoveMAD", input: []float64{10, 10, 10, 100}, median: 10, mad: 0},
		{name: "Single", input: []float64{7}, median: 7, mad: 0},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.InDelta(t, testCase.median, median(append([]float64(nil), testCase.input...)), 1e-12)
			assert.InDelta(t, testCase.mad, mad(append([]float64(nil), testCase.input...)), 1e-12)
		})
	}
}

func TestScore_Outcomes(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	noisy := [][]float64{ramp(100, 1, 10), ramp(102, 1, 10), ramp(98, 1, 10), ramp(101, 1, 10)}

	testCases := []struct {
		name       string
		current    *qbtypes.TimeSeries
		baselines  [][]*qbtypes.TimeSeries
		outcomes   map[Reason]int
		flat       bool
		saturated  int
		maxAbsZ    float64
		emptyScore bool
	}{
		{
			name:      "Normal_ScoredWithinBounds",
			current:   series(labels, ramp(100.5, 1, 10)...),
			baselines: seasons(labels, noisy...),
			outcomes:  map[Reason]int{ReasonScored: 10},
			maxAbsZ:   3,
		},
		{
			name:       "OneSeason_InsufficientBaseline",
			current:    series(labels, ramp(100, 1, 10)...),
			baselines:  seasons(labels, noisy[0]),
			outcomes:   map[Reason]int{ReasonInsufficientBaseline: 10},
			emptyScore: true,
		},
		{
			name:       "FewResiduals_InsufficientBaseline",
			current:    series(labels, 1, 2),
			baselines:  seasons(labels, []float64{1, 2}, []float64{2, 3}),
			outcomes:   map[Reason]int{ReasonInsufficientBaseline: 2},
			emptyScore: true,
		},
		{
			name:      "FlatZeroBaseline_SaturatesOnChange",
			current:   series(labels, append(repeat(0, 9), 1)...),
			baselines: seasons(labels, repeat(0, 10), repeat(0, 10), repeat(0, 10), repeat(0, 10)),
			outcomes:  map[Reason]int{ReasonFlatBaseline: 10},
			flat:      true,
			saturated: 1,
		},
		{
			name:      "OutlierSeason_StaysFlat",
			current:   series(labels, append(repeat(10, 9), 11)...),
			baselines: seasons(labels, repeat(10, 10), repeat(10, 10), repeat(10, 10), repeat(100, 10)),
			outcomes:  map[Reason]int{ReasonFlatBaseline: 10},
			flat:      true,
			saturated: 1,
		},
		{
			name: "PartialAndInvalid_TakePrecedence",
			current: func() *qbtypes.TimeSeries {
				s := series(labels, ramp(100.5, 1, 10)...)
				s.Values[0].Partial = true
				s.Values[1].Value = math.NaN()
				s.Values[2].Value = math.Inf(1)
				return s
			}(),
			baselines: seasons(labels, noisy...),
			outcomes:  map[Reason]int{ReasonPartial: 1, ReasonInvalidValue: 2, ReasonScored: 7},
			maxAbsZ:   3,
		},
		{
			name:      "NewTimestamp_MissingBaseline",
			current:   series(labels, ramp(100.5, 1, 11)...),
			baselines: seasons(labels, noisy...),
			outcomes:  map[Reason]int{ReasonScored: 10, ReasonMissingBaseline: 1},
			maxAbsZ:   3,
		},
		{
			name:       "NewSeries_InsufficientBaseline",
			current:    series([]*qbtypes.Label{label("service", "new")}, ramp(100, 1, 10)...),
			baselines:  seasons(labels, noisy...),
			outcomes:   map[Reason]int{ReasonInsufficientBaseline: 10},
			emptyScore: true,
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			result, err := Score([]*qbtypes.TimeSeries{testCase.current}, testCase.baselines, 3)
			require.NoError(t, err)
			require.Len(t, result.Scores, 1)
			require.Len(t, result.Predicted, 1)
			require.Len(t, result.Upper, 1)
			require.Len(t, result.Lower, 1)
			assert.Equal(t, testCase.outcomes, result.Outcomes)

			total := 0
			for _, n := range result.Outcomes {
				total += n
			}
			assert.Equal(t, len(testCase.current.Values), total)

			key, err := LabelsKey(testCase.current.Labels)
			require.NoError(t, err)
			assert.Equal(t, testCase.flat, result.PerSeries[key].FlatBaseline)
			assert.Equal(t, testCase.current.Labels, result.Scores[0].Labels)

			if testCase.emptyScore {
				assert.Empty(t, result.Scores[0].Values)
				return
			}
			saturated := 0
			for _, v := range result.Scores[0].Values {
				assert.False(t, math.IsNaN(v.Value) || math.IsInf(v.Value, 0))
				if math.Abs(v.Value) == zMax {
					saturated++
				} else if testCase.maxAbsZ > 0 {
					assert.LessOrEqual(t, math.Abs(v.Value), testCase.maxAbsZ)
				}
			}
			assert.Equal(t, testCase.saturated, saturated)
		})
	}
}

func TestScore_SpikeIsAnomalous(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	baselines := seasons(labels, ramp(100, 1, 10), ramp(102, 1, 10), ramp(98, 1, 10), ramp(101, 1, 10))
	current := ramp(100.5, 1, 10)
	current[9] = 400

	result, err := Score([]*qbtypes.TimeSeries{series(labels, current...)}, baselines, 3)
	require.NoError(t, err)

	scores, upper, lower, predicted := values(result.Scores[0]), values(result.Upper[0]), values(result.Lower[0]), values(result.Predicted[0])
	spike := int64(9 * 60_000)
	assert.Greater(t, scores[spike], 3.0)
	assert.Greater(t, 400.0, upper[spike])
	assert.InDelta(t, predicted[spike]+(predicted[spike]-lower[spike]), upper[spike], 1e-9)
	assert.InDelta(t, 109.5, predicted[spike], 1e-9)
	// Residuals are -0.5, 1.5, -2.5 and 0.5 at every timestamp: their MAD is 1.
	assert.InDelta(t, 3*1.4826, upper[spike]-predicted[spike], 1e-9)
}

func TestScore_IgnoresPartialBaselinePoints(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	baselines := seasons(labels, ramp(100, 1, 10), ramp(102, 1, 10), ramp(98, 1, 10), repeat(1e6, 10))
	for _, v := range baselines[3][0].Values {
		v.Partial = true
	}
	result, err := Score([]*qbtypes.TimeSeries{series(labels, ramp(100, 1, 10)...)}, baselines, 3)
	require.NoError(t, err)
	assert.InDelta(t, 100, values(result.Predicted[0])[0], 1e-9)
}

func TestScore_TinyScaleStaysFinite(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	tiny := 5e-324
	rows := make([][]float64, 4)
	for i := range rows {
		rows[i] = ramp(0, tiny*float64(i), 10)
	}
	result, err := Score([]*qbtypes.TimeSeries{series(labels, repeat(1e300, 10)...)}, seasons(labels, rows...), 3)
	require.NoError(t, err)
	require.NotEmpty(t, result.Scores[0].Values)
	for _, v := range result.Scores[0].Values {
		assert.LessOrEqual(t, math.Abs(v.Value), float64(zMax))
		assert.False(t, math.IsNaN(v.Value) || math.IsInf(v.Value, 0))
	}
}

func TestScore_UnsortedSeasonMatchesSorted(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	rows := [][]float64{ramp(100, 1, 10), ramp(102, 1, 10), ramp(98, 1, 10), ramp(101, 1, 10)}
	current := []*qbtypes.TimeSeries{series(labels, ramp(100.5, 2, 10)...)}
	sorted, err := Score(current, seasons(labels, rows...), 3)
	require.NoError(t, err)

	shuffled := seasons(labels, rows...)
	slices.Reverse(shuffled[1][0].Values)
	result, err := Score(current, shuffled, 3)
	require.NoError(t, err)
	assert.Equal(t, values(sorted.Scores[0]), values(result.Scores[0]))
	assert.Equal(t, values(sorted.Predicted[0]), values(result.Predicted[0]))
}

func TestScore_RepeatedTimestampCountsAsOneSeason(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	doubled := series(labels, ramp(100, 1, 10)...)
	doubled.Values = append(doubled.Values, doubled.Values...)
	result, err := Score([]*qbtypes.TimeSeries{series(labels, ramp(100, 1, 10)...)}, [][]*qbtypes.TimeSeries{{doubled}}, 3)
	require.NoError(t, err)
	assert.Equal(t, map[Reason]int{ReasonInsufficientBaseline: 10}, result.Outcomes)
}

func TestScore_ExtremeFiniteValuesEmitOnlyFiniteValues(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	testCases := []struct {
		name      string
		baselines [][]*qbtypes.TimeSeries
		current   []float64
		outcomes  map[Reason]int
	}{
		{
			name:      "UniformMaxBaseline_FlatNotOverflowed",
			baselines: seasons(labels, repeat(1e308, 10), repeat(1e308, 10), repeat(1e308, 10), repeat(1e308, 10)),
			current:   repeat(1e308, 10),
			outcomes:  map[Reason]int{ReasonFlatBaseline: 10},
		},
		{
			name:      "OppositeExtremes_ResidualsOverflow_Invalid",
			baselines: seasons(labels, repeat(math.MaxFloat64, 10), repeat(-math.MaxFloat64, 10), repeat(math.MaxFloat64, 10), repeat(-math.MaxFloat64, 10)),
			current:   repeat(0, 10),
			outcomes:  map[Reason]int{ReasonInvalidValue: 10},
		},
		{
			name:      "WideScale_BandsWouldOverflow",
			baselines: seasons(labels, ramp(1e307, 1e306, 10), ramp(-1e307, 1e306, 10), ramp(3e307, 1e306, 10), ramp(-3e307, 1e306, 10)),
			current:   repeat(1e308, 10),
			outcomes:  map[Reason]int{ReasonScored: 10},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			result, err := Score([]*qbtypes.TimeSeries{series(labels, testCase.current...)}, testCase.baselines, 7)
			require.NoError(t, err)
			assert.Equal(t, testCase.outcomes, result.Outcomes)
			for _, out := range [][]*qbtypes.TimeSeries{result.Predicted, result.Upper, result.Lower, result.Scores} {
				for _, v := range out[0].Values {
					assert.False(t, math.IsNaN(v.Value) || math.IsInf(v.Value, 0), "non-finite %v", v.Value)
				}
			}
		})
	}
}

func TestMedian_EvenCountDoesNotOverflow(t *testing.T) {
	assert.Equal(t, 1e308, median([]float64{1e308, 1e308}))
	assert.Equal(t, math.MaxFloat64, median([]float64{math.MaxFloat64, math.MaxFloat64}))
	assert.Equal(t, -math.MaxFloat64, median([]float64{-math.MaxFloat64, -math.MaxFloat64}))
	assert.Equal(t, 0.0, median([]float64{-math.MaxFloat64, math.MaxFloat64}))
}

func TestMedian_EvenCountDoesNotUnderflow(t *testing.T) {
	tiny := math.SmallestNonzeroFloat64
	assert.Equal(t, tiny, median([]float64{tiny, tiny}))
	assert.Equal(t, -tiny, median([]float64{-tiny, -tiny}))
	assert.Equal(t, 2*tiny, median([]float64{tiny, 3 * tiny}))
	assert.Equal(t, tiny, median([]float64{-tiny, 3 * tiny}))
}

func TestScore_SubnormalBaselineKeepsItsPrediction(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	tiny := math.SmallestNonzeroFloat64
	result, err := Score([]*qbtypes.TimeSeries{series(labels, repeat(tiny, 10)...)}, seasons(labels, repeat(tiny, 10), repeat(tiny, 10), repeat(tiny, 10), repeat(tiny, 10)), 3)
	require.NoError(t, err)
	require.NotEmpty(t, result.Predicted[0].Values)
	for _, v := range result.Predicted[0].Values {
		assert.Equal(t, tiny, v.Value)
	}
	for _, v := range result.Scores[0].Values {
		assert.Equal(t, 0.0, v.Value)
	}
}

func TestScore_FlatToleranceIgnoresRoundingNoise(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	baselines := seasons(labels, repeat(0.3, 10), repeat(0.3, 10), repeat(0.3, 10), repeat(0.3, 10))
	a, b := 0.1, 0.2
	current := repeat(a+b, 10)
	require.NotEqual(t, 0.3, current[0])

	result, err := Score([]*qbtypes.TimeSeries{series(labels, current...)}, baselines, 3)
	require.NoError(t, err)
	for _, v := range result.Scores[0].Values {
		assert.Equal(t, 0.0, v.Value)
	}
}

func TestScore_AlignsSeasonsByLabelsNotPosition(t *testing.T) {
	api, web := []*qbtypes.Label{label("service", "api")}, []*qbtypes.Label{label("service", "web")}
	baselines := make([][]*qbtypes.TimeSeries, 4)
	for i := range baselines {
		baselines[i] = []*qbtypes.TimeSeries{series(web, ramp(1000, 3, 10)...), series(api, ramp(100+float64(i), 1, 10)...)}
	}
	current := []*qbtypes.TimeSeries{series(api, ramp(101.5, 1, 10)...), series(web, ramp(1000, 3, 10)...)}

	result, err := Score(current, baselines, 3)
	require.NoError(t, err)
	require.Len(t, result.Predicted, 2)
	assert.Equal(t, api, result.Predicted[0].Labels)
	assert.InDelta(t, 101.5, values(result.Predicted[0])[0], 1e-9)
	assert.Equal(t, web, result.Predicted[1].Labels)
	assert.InDelta(t, 1000, values(result.Predicted[1])[0], 1e-9)
}

// The score is invariant to an affine change of every value (a > 0) when no floor applies.
func TestScore_AffineInvariance(t *testing.T) {
	labels := []*qbtypes.Label{label("service", "api")}
	rows := [][]float64{ramp(100, 1, 12), ramp(103, 1, 12), ramp(97, 1.5, 12), ramp(101, 0.5, 12)}
	current := ramp(99, 2, 12)

	base, err := Score([]*qbtypes.TimeSeries{series(labels, current...)}, seasons(labels, rows...), 3)
	require.NoError(t, err)

	testCases := []struct {
		name string
		a, c float64
	}{
		{name: "Scale", a: 7, c: 0},
		{name: "Translate", a: 1, c: -1e6},
		{name: "Both", a: 0.01, c: 42},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			transform := func(in []float64) []float64 {
				out := make([]float64, len(in))
				for i, v := range in {
					out[i] = testCase.a*v + testCase.c
				}
				return out
			}
			moved := make([][]float64, len(rows))
			for i, row := range rows {
				moved[i] = transform(row)
			}
			result, err := Score([]*qbtypes.TimeSeries{series(labels, transform(current)...)}, seasons(labels, moved...), 3)
			require.NoError(t, err)
			want := values(base.Scores[0])
			require.Len(t, result.Scores[0].Values, len(want))
			for _, v := range result.Scores[0].Values {
				assert.InDelta(t, want[v.Timestamp], v.Value, 1e-6)
			}
		})
	}
}

func TestScore_RejectsInvalidTarget(t *testing.T) {
	for _, target := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		_, err := Score(nil, nil, target)
		assert.Error(t, err)
	}
}

func TestLabelsKey(t *testing.T) {
	ab, err := LabelsKey([]*qbtypes.Label{label("a", "1"), label("b", "x")})
	require.NoError(t, err)
	ba, err := LabelsKey([]*qbtypes.Label{label("b", "x"), label("a", "1")})
	require.NoError(t, err)
	assert.Equal(t, ab, ba)

	testCases := []struct {
		name  string
		left  []*qbtypes.Label
		right []*qbtypes.Label
	}{
		{name: "SeparatorsInValues", left: []*qbtypes.Label{label("a", "x,b=y")}, right: []*qbtypes.Label{label("a", "x"), label("b", "y")}},
		{name: "NumberVersusString", left: []*qbtypes.Label{label("a", 1)}, right: []*qbtypes.Label{label("a", "1")}},
		{name: "EmptyVersusEmptyValue", left: nil, right: []*qbtypes.Label{label("a", "")}},
		{name: "QuoteInName", left: []*qbtypes.Label{label(`a"=s"b`, "c")}, right: []*qbtypes.Label{label("a", "b"), label("c", "")}},
		{name: "BoolVersusString", left: []*qbtypes.Label{label("a", true)}, right: []*qbtypes.Label{label("a", "true")}},
		{name: "NilVersusEmptyString", left: []*qbtypes.Label{label("a", nil)}, right: []*qbtypes.Label{label("a", "")}},
		{name: "HTMLCharacters", left: []*qbtypes.Label{label("a", "<&>")}, right: []*qbtypes.Label{label("a", "\\u003c&>")}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			left, err := LabelsKey(testCase.left)
			require.NoError(t, err)
			right, err := LabelsKey(testCase.right)
			require.NoError(t, err)
			assert.NotEqual(t, left, right)
		})
	}

	intKey, err := LabelsKey([]*qbtypes.Label{label("a", 1)})
	require.NoError(t, err)
	floatKey, err := LabelsKey([]*qbtypes.Label{label("a", 1.0)})
	require.NoError(t, err)
	assert.Equal(t, intKey, floatKey)

	empty, err := LabelsKey(nil)
	require.NoError(t, err)
	alsoEmpty, err := LabelsKey([]*qbtypes.Label{})
	require.NoError(t, err)
	assert.Equal(t, empty, alsoEmpty)
}

func BenchmarkScore(b *testing.B) {
	const numSeries, points = 1000, 60
	current := make([]*qbtypes.TimeSeries, numSeries)
	baselines := make([][]*qbtypes.TimeSeries, 4)
	for s := range numSeries {
		labels := []*qbtypes.Label{label("service", s), label("route", "/api/v1/orders")}
		current[s] = series(labels, ramp(100, 1, points)...)
		for i := range baselines {
			baselines[i] = append(baselines[i], series(labels, ramp(100+float64(i), 1, points)...))
		}
	}
	b.Run("Series1000_Points300000", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			if _, err := Score(current, baselines, 3); err != nil {
				b.Fatal(err)
			}
		}
	})
}
