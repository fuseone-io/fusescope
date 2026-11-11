package parityexec

import (
	"context"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/querier"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// distribution answers the evidence queries as ClickHouse would over values: counts with
// countIf thresholds, and an ordered list read at an offset. drift changes values after the
// first count, as new data would.
type distribution struct {
	querier.Querier
	values   []float64
	nulls    int
	drift    bool
	requests []qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]
	windows  [][2]uint64
	vars     []map[string]qbtypes.VariableItem
}

var threshold = regexp.MustCompile(`^countIf\(duration_nano (<|<=) ([0-9.e+-]+)\)$`)

func (d *distribution) QueryRange(_ context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	d.requests = append(d.requests, spec)
	d.windows = append(d.windows, [2]uint64{req.Start, req.End})
	d.vars = append(d.vars, req.Variables)
	if req.RequestType == qbtypes.RequestTypeRaw {
		sorted := slices.Sorted(slices.Values(d.values))
		row := &qbtypes.RawRow{Data: map[string]any{"duration_nano": sorted[spec.Offset]}}
		return &qbtypes.QueryRangeResponse{Type: qbtypes.RequestTypeRaw, Data: qbtypes.QueryData{Results: []any{&qbtypes.RawData{QueryName: "A", Rows: []*qbtypes.RawRow{row}}}}}, nil
	}
	if d.drift && len(d.requests) > 1 {
		d.values = append(d.values, 1)
	}
	var row []any
	for _, agg := range spec.Aggregations {
		switch agg.Expression {
		case "count()":
			row = append(row, uint64(len(d.values)+d.nulls))
		case "count(duration_nano)":
			row = append(row, uint64(len(d.values)))
		default:
			m := threshold.FindStringSubmatch(agg.Expression)
			if m == nil {
				panic(agg.Expression)
			}
			v, _ := strconv.ParseFloat(m[2], 64)
			n := 0
			for _, x := range d.values {
				if (m[1] == "<" && x < v) || (m[1] == "<=" && x <= v) {
					n++
				}
			}
			row = append(row, uint64(n))
		}
	}
	return &qbtypes.QueryRangeResponse{Type: qbtypes.RequestTypeScalar, Data: qbtypes.QueryData{Results: []any{&qbtypes.ScalarData{QueryName: "A", Data: [][]any{row}}}}}, nil
}

// numeric resolves duration_nano as one numeric key and anything else as text.
type numeric struct{}

func (numeric) GetKeysMulti(_ context.Context, _ valuer.UUID, selectors []*telemetrytypes.FieldKeySelector) (map[string][]*telemetrytypes.TelemetryFieldKey, bool, error) {
	out := map[string][]*telemetrytypes.TelemetryFieldKey{}
	for _, s := range selectors {
		switch s.Name {
		case "duration_nano":
			out[s.Name] = []*telemetrytypes.TelemetryFieldKey{{Name: s.Name, FieldContext: telemetrytypes.FieldContextSpan, FieldDataType: telemetrytypes.FieldDataTypeInt64}}
		case "retries":
			out[s.Name] = []*telemetrytypes.TelemetryFieldKey{
				{Name: s.Name, FieldContext: telemetrytypes.FieldContextAttribute, FieldDataType: telemetrytypes.FieldDataTypeFloat64},
				{Name: s.Name, FieldContext: telemetrytypes.FieldContextResource, FieldDataType: telemetrytypes.FieldDataTypeFloat64},
			}
		default:
			out[s.Name] = []*telemetrytypes.TelemetryFieldKey{{Name: s.Name, FieldContext: telemetrytypes.FieldContextAttribute, FieldDataType: telemetrytypes.FieldDataTypeString}}
		}
	}
	return out, true, nil
}

func group() Group {
	return Group{Start: 1_000, End: 61_000, Filter: "service.name = 'cart'", Field: "duration_nano"}
}

func evidencer(d *distribution) Evidencer {
	return Evidencer{Querier: d, Keys: numeric{}, Org: org}
}

func TestTheRankRuleReadsOnlyTheCounts(t *testing.T) {
	values := make([]float64, 0, 100_000)
	for i := 1; i <= 100_000; i++ {
		values = append(values, float64(i))
	}
	d := &distribution{values: values, nulls: 3}
	got, ok, err := evidencer(d).Quantile(context.Background(), group(), 0.5, 50_000)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, QuantileEvidence{Rows: 100_003, Evidence: parity.QuantileEvidence{N: 100_000, Below: 49_999, AtOrBelow: 50_000}}, got, "count() for the rows, count(field) for the distribution")
	require.Len(t, d.requests, 1, "no order statistic is read")
	spec := d.requests[0]
	assert.Equal(t, "(service.name = 'cart')", spec.Filter.Expression)
	assert.Equal(t, [][2]uint64{{1_000, 61_000}}, d.windows)
	assert.Equal(t, []string{"count()", "count(duration_nano)", "countIf(duration_nano < 50000)", "countIf(duration_nano <= 50000)"}, expressions(spec))
}

func expressions(spec qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]) []string {
	var out []string
	for _, a := range spec.Aggregations {
		out = append(out, a.Expression)
	}
	return out
}

func TestTheOrderStatisticRuleReadsTheRanksAndCountsAgain(t *testing.T) {
	d := &distribution{values: []float64{800, 200, 400, 200, 400, 200}}
	got, ok, err := evidencer(d).Quantile(context.Background(), group(), 0.99, 780)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, &parity.OrderStatistics{Low: 400, High: 800}, got.Evidence.Bounds)
	require.Len(t, d.requests, 4, "counts, two ranks, counts again")
	for i, offset := range []int{4, 5} {
		raw := d.requests[1+i]
		assert.Equal(t, offset, raw.Offset)
		assert.Equal(t, 1, raw.Limit)
		require.Len(t, raw.Order, 1)
		assert.Equal(t, "duration_nano", raw.Order[0].Key.Name)
		assert.Equal(t, qbtypes.OrderDirectionAsc, raw.Order[0].Direction)
	}
	assert.Equal(t, parity.Verdict{Category: parity.CategoryApproximation, Disposition: parity.Accepted}, parity.JudgeQuantile(0.99, 780, got.Evidence))
}

func TestEqualRanksAreReadOnce(t *testing.T) {
	d := &distribution{values: []float64{1, 2, 3, 4, 5}}
	got, ok, err := evidencer(d).Quantile(context.Background(), group(), 0.5, 3)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, &parity.OrderStatistics{Low: 3, High: 3}, got.Evidence.Bounds)
	assert.Len(t, d.requests, 3)
}

func TestDataThatMovedBetweenTheQueriesIsNoEvidence(t *testing.T) {
	d := &distribution{values: []float64{800, 200, 400, 200, 400, 200}, drift: true}
	_, ok, err := evidencer(d).Quantile(context.Background(), group(), 0.99, 780)
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestAFieldThatIsNotOneNumericKeyIsNoEvidence(t *testing.T) {
	for _, field := range []string{"http.route", "retries"} {
		d := &distribution{values: []float64{1}}
		g := group()
		g.Field = field
		_, ok, err := evidencer(d).Quantile(context.Background(), g, 0.5, 1)
		require.NoError(t, err)
		assert.False(t, ok, field)
		assert.Empty(t, d.requests, "%s: nothing is asked", field)
	}
}

func TestQuantileFieldsComeFromTheirExpression(t *testing.T) {
	for expr, want := range map[string]string{"p99(duration_nano)": "duration_nano", "p50(attribute.retries)": "attribute.retries"} {
		field, q, ok := QuantileField(expr)
		assert.True(t, ok, expr)
		assert.Equal(t, want, field)
		assert.Positive(t, q)
	}
	for _, expr := range []string{"avg(duration_nano)", "p99(duration_nano + 1)", "count()", "p100(x)"} {
		_, _, ok := QuantileField(expr)
		assert.False(t, ok, expr)
	}
}

func TestAGroupIsTheViewsQueryNarrowed(t *testing.T) {
	g := group().Where(telemetrytypes.TelemetryFieldKey{Name: "name", FieldContext: telemetrytypes.FieldContextSpan}, "o'brien").Where(telemetrytypes.TelemetryFieldKey{Name: "http.status_code"}, float64(200))
	assert.Equal(t, `(service.name = 'cart') AND span.name = 'o\'brien' AND http.status_code = 200`, g.Filter)
	empty := Group{Start: 1, End: 2, Field: "duration_nano"}.Where(telemetrytypes.TelemetryFieldKey{Name: "http.route"}, "")
	assert.Equal(t, `http.route = ''`, empty.Filter, "ClickHouse's group of the empty value holds the absent key too")
	assert.True(t, strings.HasPrefix(group().Filter, "service.name"))
}

func TestABucketIsItsStepWithinTheWindow(t *testing.T) {
	window := Group{Start: 90_000, End: 250_000}
	for _, c := range []struct {
		ts         uint64
		start, end uint64
	}{
		{60_000, 90_000, 120_000}, // the partial first bucket
		{120_000, 120_000, 180_000},
		{240_000, 240_000, 250_000}, // the partial last bucket
	} {
		b, ok := window.Bucket(c.ts, 60_000)
		require.True(t, ok)
		assert.Equal(t, [2]uint64{c.start, c.end}, [2]uint64{b.Start, b.End}, "ts=%d", c.ts)
	}
	_, ok := window.Bucket(300_000, 60_000)
	assert.False(t, ok, "a bucket outside the window")
	_, ok = window.Bucket(60_000, 0)
	assert.False(t, ok)
}

// partial resolves duration_nano as one numeric key, in a listing it says is incomplete.
type partial struct{ numeric }

func (p partial) GetKeysMulti(ctx context.Context, org valuer.UUID, selectors []*telemetrytypes.FieldKeySelector) (map[string][]*telemetrytypes.TelemetryFieldKey, bool, error) {
	keys, _, err := p.numeric.GetKeysMulti(ctx, org, selectors)
	return keys, false, err
}

func TestAnIncompleteKeyListingProvesNoUniqueField(t *testing.T) {
	d := &distribution{values: []float64{1}}
	_, ok, err := Evidencer{Querier: d, Keys: partial{}, Org: org}.Quantile(context.Background(), group(), 0.5, 1)
	require.NoError(t, err)
	assert.False(t, ok, "another variant may be among the keys not listed")
	assert.Empty(t, d.requests)
}
