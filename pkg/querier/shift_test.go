package querier

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAdjustTimeRangeForShift tests the time range adjustment logic.
func TestAdjustTimeRangeForShift(t *testing.T) {
	tests := []struct {
		name           string
		spec           qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]
		timeRange      qbtypes.TimeRange
		requestType    qbtypes.RequestType
		expectedFromMS uint64
		expectedToMS   uint64
	}{
		{
			name: "no shift",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{},
			},
			timeRange: qbtypes.TimeRange{
				From: 1000000,
				To:   2000000,
			},
			requestType:    qbtypes.RequestTypeTimeSeries,
			expectedFromMS: 1000000,
			expectedToMS:   2000000,
		},
		{
			name: "shift by 60 seconds using timeShift function",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: "60"},
						},
					},
				},
			},
			timeRange: qbtypes.TimeRange{
				From: 1000000,
				To:   2000000,
			},
			requestType:    qbtypes.RequestTypeTimeSeries,
			expectedFromMS: 940000,  // 1000000 - 60000
			expectedToMS:   1940000, // 2000000 - 60000
		},
		{
			name: "shift by negative 30 seconds (future shift)",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: "-30"},
						},
					},
				},
			},
			timeRange: qbtypes.TimeRange{
				From: 1000000,
				To:   2000000,
			},
			requestType:    qbtypes.RequestTypeTimeSeries,
			expectedFromMS: 1030000, // 1000000 - (-30000)
			expectedToMS:   2030000, // 2000000 - (-30000)
		},
		{
			name: "no shift for raw request type even with timeShift function",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: "3600"},
						},
					},
				},
			},
			timeRange: qbtypes.TimeRange{
				From: 1000000,
				To:   2000000,
			},
			requestType:    qbtypes.RequestTypeRaw,
			expectedFromMS: 1000000, // No shift for raw queries
			expectedToMS:   2000000,
		},
		{
			name: "shift applied for scalar request type with timeShift function",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: "3600"},
						},
					},
				},
			},
			timeRange: qbtypes.TimeRange{
				From: 10000000,
				To:   20000000,
			},
			requestType:    qbtypes.RequestTypeScalar,
			expectedFromMS: 6400000,  // 10000000 - 3600000
			expectedToMS:   16400000, // 20000000 - 3600000
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := adjustTimeRangeForShift(tt.spec, tt.timeRange, tt.requestType)
			assert.Equal(t, tt.expectedFromMS, result.From, "fromMS mismatch")
			assert.Equal(t, tt.expectedToMS, result.To, "toMS mismatch")
		})
	}
}

// TestExtractShiftFromBuilderQuery tests the shift extraction logic.
func TestExtractShiftFromBuilderQuery(t *testing.T) {
	tests := []struct {
		name            string
		spec            qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]
		expectedShiftBy int64
	}{
		{
			name: "extract from timeShift function with float64",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: float64(3600)},
						},
					},
				},
			},
			expectedShiftBy: 3600,
		},
		{
			name: "extract from timeShift function with int64",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: int64(3600)},
						},
					},
				},
			},
			expectedShiftBy: 3600,
		},
		{
			name: "extract from timeShift function with string",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: "3600"},
						},
					},
				},
			},
			expectedShiftBy: 3600,
		},
		{
			name: "extract from timeShift function with object value",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: map[string]any{"value": "7200"}},
						},
					},
				},
			},
			expectedShiftBy: 7200,
		},
		{
			name: "no timeShift function",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameAbsolute,
					},
				},
			},
			expectedShiftBy: 0,
		},
		{
			name: "invalid timeShift value",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: "invalid"},
						},
					},
				},
			},
			expectedShiftBy: 0,
		},
		{
			name: "multiple functions with timeShift",
			spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
				Functions: []qbtypes.Function{
					{
						Name: qbtypes.FunctionNameAbsolute,
					},
					{
						Name: qbtypes.FunctionNameTimeShift,
						Args: []qbtypes.FunctionArg{
							{Value: "1800"},
						},
					},
					{
						Name: qbtypes.FunctionNameClampMax,
						Args: []qbtypes.FunctionArg{
							{Value: "100"},
						},
					},
				},
			},
			expectedShiftBy: 1800,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shiftBy := extractShiftFromBuilderQuery(tt.spec)
			assert.Equal(t, tt.expectedShiftBy, shiftBy)
		})
	}
}

// A shifted query's window is already shifted, so the cache's missing ranges are too: a ranged
// copy must read them as given, not shift them a second time.
func TestCreateRangedQueryKeepsAShiftedQuerysMissingRange(t *testing.T) {
	timeShift := []qbtypes.Function{{Name: qbtypes.FunctionNameTimeShift, Args: []qbtypes.FunctionArg{{Value: "3600"}}}}
	window := qbtypes.TimeRange{From: 10_000_000, To: 20_000_000}
	shifted := qbtypes.TimeRange{From: window.From - 3_600_000, To: window.To - 3_600_000}
	missing := qbtypes.TimeRange{From: shifted.To - 600_000, To: shifted.To}
	org := valuer.GenerateUUID()
	q := &querier{}

	testCases := []struct {
		name  string
		query qbtypes.Query
	}{
		{name: "Metrics", query: newBuilderQuery(nil, nil, org, nil, qbtypes.QueryTypeBuilder, qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{Name: "A", Signal: telemetrytypes.SignalMetrics, Functions: timeShift}, shifted, qbtypes.RequestTypeTimeSeries, nil, builderConfig{})},
		{name: "Logs", query: newBuilderQuery(nil, nil, org, nil, qbtypes.QueryTypeBuilder, qbtypes.QueryBuilderQuery[qbtypes.LogAggregation]{Name: "B", Signal: telemetrytypes.SignalLogs, Functions: timeShift}, shifted, qbtypes.RequestTypeTimeSeries, nil, builderConfig{})},
		{name: "Traces", query: newBuilderQuery(nil, nil, org, nil, qbtypes.QueryTypeBuilder, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{Name: "C", Signal: telemetrytypes.SignalTraces, Functions: timeShift}, shifted, qbtypes.RequestTypeScalar, nil, builderConfig{})},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ranged := q.createRangedQuery(org, testCase.query, missing)
			require.NotNil(t, ranged)
			from, to := ranged.Window()
			assert.Equal(t, missing.From, from)
			assert.Equal(t, missing.To, to)
		})
	}
}

// windowRecorder records the window of each statement it is asked to build, then fails it; the
// failure makes executeWithCache fall back to the whole window, recorded after the missing range.
type windowRecorder struct {
	mu      sync.Mutex
	windows []qbtypes.TimeRange
}

func (r *windowRecorder) Build(_ context.Context, _ valuer.UUID, start, end uint64, _ qbtypes.RequestType, _ qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation], _ map[string]qbtypes.VariableItem) (*qbtypes.Statement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.windows = append(r.windows, qbtypes.TimeRange{From: start, To: end})
	return nil, errors.NewInternalf(errors.CodeInternal, "recorded")
}

func TestExecuteWithCacheReadsAShiftedQuerysMissingRangeOnce(t *testing.T) {
	const hourMS = uint64(3_600_000)
	end := uint64(time.Now().Add(-2*time.Hour).Truncate(time.Minute).UnixMilli()) - hourMS
	shifted := qbtypes.TimeRange{From: end - 2*hourMS, To: end}
	step := qbtypes.Step{Duration: time.Minute}
	spec := qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
		Name:         "A",
		Signal:       telemetrytypes.SignalMetrics,
		StepInterval: step,
		Aggregations: []qbtypes.MetricAggregation{{MetricName: "requests"}},
		Functions:    []qbtypes.Function{{Name: qbtypes.FunctionNameTimeShift, Args: []qbtypes.FunctionArg{{Value: "3600"}}}},
	}
	spec.ShiftBy = extractShiftFromBuilderQuery(spec)
	org := valuer.GenerateUUID()
	recorder := &windowRecorder{}
	bc := createTestBucketCache(t)
	q := &querier{logger: instrumentationtest.New().Logger(), bucketCache: bc, metricStmtBuilder: recorder}
	query := newBuilderQuery[qbtypes.MetricAggregation](nil, nil, org, recorder, qbtypes.QueryTypeBuilder, spec, shifted, qbtypes.RequestTypeTimeSeries, nil, builderConfig{})

	cachedEnd := shifted.From + hourMS
	earlier := newBuilderQuery[qbtypes.MetricAggregation](nil, nil, org, recorder, qbtypes.QueryTypeBuilder, spec, qbtypes.TimeRange{From: shifted.From, To: cachedEnd}, qbtypes.RequestTypeTimeSeries, nil, builderConfig{})
	bc.Put(context.Background(), org, earlier, step, &qbtypes.Result{Type: qbtypes.RequestTypeTimeSeries, Value: createTestTimeSeries("A", shifted.From, cachedEnd, uint64(step.Milliseconds()))})

	_, err := q.executeWithCache(context.Background(), org, query, step, make(chan struct{}, 1))
	require.Error(t, err)

	require.NotEmpty(t, recorder.windows)
	assert.Equal(t, cachedEnd, recorder.windows[0].From)
	assert.Equal(t, shifted.To, recorder.windows[0].To)
}
