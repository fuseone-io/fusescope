package parityrun

import (
	"context"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/querier"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// answering records each request and answers it with the function given.
type answering struct {
	querier.Querier
	requests []*qbtypes.QueryRangeRequest
	answer   func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse
}

func (a *answering) QueryRange(_ context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	a.requests = append(a.requests, req)
	return a.answer(req), nil
}

func spec(req *qbtypes.QueryRangeRequest) qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation] {
	return req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
}

func scalar(rows ...[]any) *qbtypes.QueryRangeResponse {
	return &qbtypes.QueryRangeResponse{Data: qbtypes.QueryData{Results: []any{&qbtypes.ScalarData{Data: rows}}}}
}

var minuteWindow = parity.Window{Start: int64(29_000_000) * int64(time.Minute), End: int64(29_000_002) * int64(time.Minute)}

func TestTheGateCountsEachServiceByMinute(t *testing.T) {
	ms := minuteWindow.Start / int64(time.Millisecond)
	series := func(index int, service string, a, b float64) *qbtypes.AggregationBucket {
		return &qbtypes.AggregationBucket{Index: index, Series: []*qbtypes.TimeSeries{{
			Labels: []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: "service.name"}, Value: service}},
			Values: []*qbtypes.TimeSeriesValue{{Timestamp: ms, Value: a}, {Timestamp: ms + 60_000, Value: b}},
		}}}
	}
	q := &answering{answer: func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse {
		return &qbtypes.QueryRangeResponse{Data: qbtypes.QueryData{Results: []any{&qbtypes.TimeSeriesData{Aggregations: []*qbtypes.AggregationBucket{series(0, "cart", 10, 12), series(1, "cart", 10, 11)}}}}}
	}}
	got, err := serviceCounts(context.Background(), q, org, minuteWindow)
	require.NoError(t, err)
	assert.Equal(t, parity.ServiceCounts{"cart": {
		minuteWindow.Start:                      {Raw: 10, Distinct: 10},
		minuteWindow.Start + int64(time.Minute): {Raw: 12, Distinct: 11},
	}}, got)
	require.Len(t, q.requests, 1)
	req := q.requests[0]
	assert.Equal(t, qbtypes.RequestTypeTimeSeries, req.RequestType)
	assert.True(t, req.NoCache)
	assert.Equal(t, uint64(ms), req.Start)
	s := spec(req)
	assert.Equal(t, time.Minute, s.StepInterval.Duration)
	assert.Equal(t, []string{"count()", "count_distinct(span_id)"}, expressionsOf(s))
	assert.Equal(t, "service.name", s.GroupBy[0].Name)
}

func expressionsOf(s qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]) []string {
	var out []string
	for _, a := range s.Aggregations {
		out = append(out, a.Expression)
	}
	return out
}

func TestTraceCandidatesCarryTheirSizeAndErrors(t *testing.T) {
	q := &answering{answer: func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse {
		return scalar([]any{"t1", uint64(900), uint64(1)}, []any{"t2", uint64(3), uint64(0)})
	}}
	got, err := traceCandidates(context.Background(), q, org, minuteWindow)
	require.NoError(t, err)
	assert.Equal(t, []parity.TraceCandidate{{ID: "t1", Spans: 900, HasError: true}, {ID: "t2", Spans: 3}}, got)
	s := spec(q.requests[0])
	assert.Equal(t, "trace_id", s.GroupBy[0].Name)
	assert.Equal(t, []string{"count()", "countIf(has_error = true)"}, expressionsOf(s))
	assert.Equal(t, traceCandidateLimit, s.Limit)
}

func TestOperationsAreTheServicesSpanNames(t *testing.T) {
	q := &answering{answer: func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse {
		return scalar([]any{"GET", uint64(5)}, []any{"PUT", uint64(1)})
	}}
	got, err := operations(context.Background(), q, org, minuteWindow, "o'cart")
	require.NoError(t, err)
	assert.Equal(t, []string{"GET", "PUT"}, got)
	assert.Equal(t, `resource.service.name = 'o\'cart'`, spec(q.requests[0]).Filter.Expression)
}

func TestAbsentKeyColumnsAreTheKeysSomeSpansLack(t *testing.T) {
	q := &answering{answer: func(req *qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse {
		s := spec(req)
		if len(s.GroupBy) == 0 {
			if s.Filter.Expression == "http.route NOT EXISTS" {
				return scalar([]any{uint64(4)})
			}
			return scalar([]any{uint64(0)})
		}
		return scalar([]any{"/cart", uint64(3)}, []any{"/pay", uint64(1)})
	}}
	got, err := absentColumns(context.Background(), q, org, minuteWindow)
	require.NoError(t, err)
	assert.Equal(t, []parity.AbsentKeyColumn{{Attribute: "http.route", Present: []string{"/cart", "/pay"}}}, got)
	assert.Len(t, q.requests, len(parity.AbsentKeyAttributes())+1, "a count per key, values for the one lacking")
}
