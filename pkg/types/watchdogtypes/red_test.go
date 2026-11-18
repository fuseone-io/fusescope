package watchdogtypes

import (
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

var testWindow = NewWindow(time.Date(2026, 11, 18, 12, 2, 0, 0, time.UTC))

func serviceSeries(service string, values map[int64]float64) *qbtypes.TimeSeries {
	series := &qbtypes.TimeSeries{Labels: []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: "service.name"}, Value: service}}}
	for _, timestamp := range testWindow.Buckets() {
		if value, ok := values[timestamp]; ok {
			series.Values = append(series.Values, &qbtypes.TimeSeriesValue{Timestamp: timestamp, Value: value})
		}
	}
	return series
}

func TestParseRED(t *testing.T) {
	b := testWindow.Buckets()
	resp := &qbtypes.QueryRangeResponse{
		Data: qbtypes.QueryData{Results: []any{&qbtypes.TimeSeriesData{QueryName: redQueryName, Aggregations: []*qbtypes.AggregationBucket{
			{Index: 0, Series: []*qbtypes.TimeSeries{
				serviceSeries("checkout", map[int64]float64{b[0]: 10, b[1]: 20}),
				{Labels: []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: "host.name"}, Value: "a"}}, Values: []*qbtypes.TimeSeriesValue{{Timestamp: b[0], Value: 1}}},
			}},
			{Index: 1, Series: []*qbtypes.TimeSeries{{
				Labels: []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: "service.name"}, Value: "checkout"}},
				Values: []*qbtypes.TimeSeriesValue{{Timestamp: b[0], Value: 1}, {Timestamp: b[1], Value: 2, Partial: true}, {Timestamp: b[2], Value: math.NaN()}},
			}}},
			{Index: 2, Series: []*qbtypes.TimeSeries{serviceSeries("checkout", map[int64]float64{b[1]: 5e6})}},
		}}}},
		Warning: &qbtypes.QueryWarnData{Message: "partial", Warnings: []qbtypes.QueryWarnDataAdditional{{Message: "a shard timed out"}}},
	}

	result := ParseRED(resp)
	require.Contains(t, result.Services, "checkout")
	assert.Len(t, result.Services, 1)
	red := result.Services["checkout"]
	assert.Equal(t, map[int64]float64{b[0]: 10, b[1]: 20}, red.Requests)
	assert.Equal(t, map[int64]float64{b[0]: 1}, red.Errors)
	assert.Equal(t, map[int64]float64{b[1]: 5e6}, red.P99)
	assert.Equal(t, []string{"partial", "a shard timed out"}, result.Warnings)
}

func TestNewREDRequests(t *testing.T) {
	testCases := []struct {
		name      string
		req       *qbtypes.QueryRangeRequest
		filter    string
		services  []any
		limit     int
		timeShift int64
	}{
		{
			name:      "Discovery_ShiftedAndLimited",
			req:       NewDiscoveryRequest(testWindow, 2, 7),
			filter:    "isRoot = true OR isEntryPoint = true",
			limit:     7,
			timeShift: 172_800,
		},
		{
			name:     "Current_FilteredToServices",
			req:      NewCurrentRequest(testWindow, []string{"checkout", "it's \"quoted\""}),
			filter:   "(isRoot = true OR isEntryPoint = true) AND service.name IN $watchdog_services",
			services: []any{"checkout", "it's \"quoted\""},
			limit:    2,
		},
		{
			name:      "Baseline_FilteredAndShifted",
			req:       NewBaselineRequest(testWindow, 4, []string{"cart"}),
			filter:    "(isRoot = true OR isEntryPoint = true) AND service.name IN $watchdog_services",
			services:  []any{"cart"},
			limit:     1,
			timeShift: 345_600,
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			req := testCase.req
			assert.Equal(t, uint64(testWindow.Start.UnixMilli()), req.Start)
			assert.Equal(t, uint64(testWindow.End.UnixMilli()), req.End)
			assert.Equal(t, qbtypes.RequestTypeTimeSeries, req.RequestType)
			require.Len(t, req.CompositeQuery.Queries, 1)
			spec, ok := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
			require.True(t, ok)
			assert.Equal(t, telemetrytypes.SignalTraces, spec.Signal)
			assert.Equal(t, BucketStep, spec.StepInterval.Duration)
			assert.Equal(t, testCase.filter, spec.Filter.Expression)
			assert.Equal(t, testCase.limit, spec.Limit)
			require.Len(t, spec.Aggregations, 3)
			assert.Equal(t, "count()", spec.Aggregations[0].Expression)
			assert.Equal(t, "countIf(status_code = 2)", spec.Aggregations[1].Expression)
			assert.Equal(t, "p99(duration_nano)", spec.Aggregations[2].Expression)
			require.Len(t, spec.GroupBy, 1)
			assert.Equal(t, "service.name", spec.GroupBy[0].Name)
			require.Len(t, spec.Order, 1)
			assert.Equal(t, qbtypes.OrderDirectionDesc, spec.Order[0].Direction)
			if testCase.services == nil {
				assert.Empty(t, req.Variables)
			} else {
				assert.Equal(t, testCase.services, req.Variables["watchdog_services"].Value)
			}
			if testCase.timeShift == 0 {
				assert.Empty(t, spec.Functions)
				return
			}
			require.Len(t, spec.Functions, 1)
			assert.Equal(t, qbtypes.FunctionNameTimeShift, spec.Functions[0].Name)
			assert.Equal(t, testCase.timeShift, spec.Functions[0].Args[0].Value)
		})
	}
}
