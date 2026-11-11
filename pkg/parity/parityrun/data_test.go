package parityrun

import (
	"context"
	"strings"
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

func TestTraceCandidatesAreTheLargestARandomRunAndTheFailedOnes(t *testing.T) {
	big, small, failed := "a0000000000000000000000000000000", "c0000000000000000000000000000000", "f0000000000000000000000000000000"
	q := &answering{answer: func(req *qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse {
		s := spec(req)
		switch {
		case s.Filter == nil:
			return scalar([]any{big, uint64(900), uint64(0)})
		case strings.Contains(s.Filter.Expression, "has_error"):
			return scalar([]any{failed, uint64(1), uint64(1)})
		case strings.Contains(s.Filter.Expression, " IN "):
			return scalar([]any{failed, uint64(2), uint64(1)})
		}
		return scalar([]any{small, uint64(3), uint64(0)})
	}}
	got, err := traceCandidates(context.Background(), q, org, minuteWindow, 7)
	require.NoError(t, err)
	assert.ElementsMatch(t, []parity.TraceCandidate{{ID: big, Spans: 900}, {ID: small, Spans: 3}, {ID: failed, Spans: 2, HasError: true}}, got, "a failed trace counts all its spans")
	require.Len(t, q.requests, 4)
	largest, random, failures, totals := spec(q.requests[0]), spec(q.requests[1]), spec(q.requests[2]), spec(q.requests[3])
	assert.Equal(t, "spans", largest.Order[0].Key.Name)
	assert.Equal(t, qbtypes.OrderDirectionDesc, largest.Order[0].Direction)
	start := randomTraceStart(7, minuteWindow)
	assert.Regexp(t, `^[0-9a-f]{32}$`, start)
	assert.Equal(t, "trace_id >= '"+start+"'", random.Filter.Expression, "a run of the trace id space from a point the seed picks")
	assert.Equal(t, "trace_id", random.Order[0].Key.Name)
	assert.Equal(t, "has_error = true AND trace_id >= '"+start+"'", failures.Filter.Expression)
	assert.Equal(t, "trace_id IN ('"+failed+"')", totals.Filter.Expression)
	for _, s := range []qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{largest, random, failures} {
		assert.Equal(t, traceCandidateLimit, s.Limit)
	}
	assert.NotEqual(t, start, randomTraceStart(8, minuteWindow))
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
