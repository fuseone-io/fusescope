package parityexec

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/parity"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func decoded(t *testing.T, raw string) any {
	t.Helper()
	var v any
	require.NoError(t, json.Unmarshal([]byte(raw), &v))
	return v
}

func sixValues() *distribution {
	return &distribution{values: []float64{800, 200, 400, 200, 400, 200}}
}

var accepted = parity.Verdict{Category: parity.CategoryApproximation, Disposition: parity.Accepted}

func TestAServicesQuantileIsJudgedOnItsServicesGroup(t *testing.T) {
	d := sixValues()
	req := servicetypesv1.Request{Start: "1000000000", End: "61000000000"}
	clickhouse := decoded(t, `{"data":[{"serviceName":"cart","p99":664,"numCalls":6}]}`)
	c := evidencer(d).ServicesContext(context.Background(), req, clickhouse)
	path := parity.Path{"data", parity.Dynamic("cart"), 0, "p99"}
	q, ok := c.QuantileOf(path)
	require.True(t, ok)
	ev, ok := c.QuantileEvidence(path, q, 780)
	require.True(t, ok)
	assert.Equal(t, accepted, parity.JudgeQuantile(q, 780, ev))
	assert.Equal(t, "(isRoot = true OR isEntryPoint = true) AND resource.service.name = 'cart'", d.requests[0].Filter.Expression, "the module's own request, narrowed to the service")
	assert.Equal(t, [2]uint64{1000, 61000}, d.windows[0])

	moved := decoded(t, `{"data":[{"serviceName":"cart","p99":664,"numCalls":7}]}`)
	_, ok = evidencer(sixValues()).ServicesContext(context.Background(), req, moved).QuantileEvidence(path, q, 780)
	assert.False(t, ok, "a group whose size changed since the view answered is no evidence")
}

func TestAnOperationsQuantileIsJudgedOnItsOperationsGroup(t *testing.T) {
	d := sixValues()
	req := servicetypesv1.OperationsRequest{Start: "1000000000", End: "61000000000", Service: "cart", Limit: 2}
	engine := decoded(t, `{"data":[{"name":"GET","p99":780,"numCalls":6},{"name":"PUT","p99":400,"numCalls":6}]}`)
	clickhouse := decoded(t, `{"data":[{"name":"GET","p99":664,"numCalls":6},{"name":"POST","p99":400,"numCalls":6}]}`)
	c := evidencer(d).OperationsContext(context.Background(), false, req, engine, clickhouse)
	path := parity.Path{"items", parity.Dynamic("GET"), 0, "p95"}
	q, ok := c.QuantileOf(path)
	require.True(t, ok)
	assert.InDelta(t, 0.95, q, 1e-9)
	_, ok = c.QuantileEvidence(path, q, 780)
	require.True(t, ok)
	assert.Contains(t, d.requests[0].Filter.Expression, "span.name = 'GET'")
	assert.Contains(t, d.requests[0].Filter.Expression, "service.name IN $1")
	assert.Contains(t, fmt.Sprint(d.vars[0]), "cart", "the service travels in the module's own variables")
	require.NotNil(t, c.OperationOrder)
	require.NotNil(t, c.OperationCut)
	assert.Equal(t, accepted, c.OperationCut(), "PUT's 400 could be POST's: the same distribution here")

	entry := evidencer(sixValues()).OperationsContext(context.Background(), true, req, engine, clickhouse)
	_, ok = entry.QuantileEvidence(path, 0.95, 780)
	assert.True(t, ok)
}

func scalarRequest() *qbtypes.QueryRangeRequest {
	req := request(qbtypes.RequestTypeScalar, "p99(duration_nano)")
	spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	spec.GroupBy = []qbtypes.GroupByKey{{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "service.name", FieldContext: telemetrytypes.FieldContextResource}}}
	req.CompositeQuery.Queries[0].Spec = spec
	counted, _ := WithGroupCount(req)
	return counted
}

func TestAScalarQuantileIsJudgedOnItsRowsGroup(t *testing.T) {
	d := sixValues()
	req := scalarRequest()
	clickhouse := decoded(t, `{"type":"scalar","data":{"results":[{"queryName":"A","columns":[
		{"name":"service.name","fieldContext":"resource","columnType":"group"},
		{"name":"__result_0","columnType":"aggregation","aggregationIndex":0},
		{"name":"__result_1","columnType":"aggregation","aggregationIndex":1}],
		"data":[["cart",664,6]]}]}}`)
	c := evidencer(d).QueryRangeContext(context.Background(), req, clickhouse)
	path := parity.Path{"data", "results", 0, "data", parity.Dynamic("cart"), 0, 1}
	q, ok := c.QuantileOf(path)
	require.True(t, ok)
	assert.InDelta(t, 0.99, q, 1e-9)
	ev, ok := c.QuantileEvidence(path, q, 780)
	require.True(t, ok)
	assert.Equal(t, accepted, parity.JudgeQuantile(q, 780, ev))
	assert.Equal(t, "(http.route = '/cart') AND resource.service.name = 'cart'", d.requests[0].Filter.Expression)

	moved := decoded(t, `{"type":"scalar","data":{"results":[{"queryName":"A","columns":[
		{"name":"service.name","fieldContext":"resource","columnType":"group"},
		{"name":"__result_0","columnType":"aggregation","aggregationIndex":0},
		{"name":"__result_1","columnType":"aggregation","aggregationIndex":1}],
		"data":[["cart",664,9]]}]}}`)
	_, ok = evidencer(sixValues()).QueryRangeContext(context.Background(), req, moved).QuantileEvidence(path, q, 780)
	assert.False(t, ok, "the group's count() no longer matches")
}

func TestATimeSeriesQuantileIsJudgedOnItsBucket(t *testing.T) {
	d := sixValues()
	req := scalarRequest()
	req.RequestType = qbtypes.RequestTypeTimeSeries
	req.Start, req.End = 90_000, 250_000
	spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	spec.StepInterval = qbtypes.Step{Duration: time.Minute}
	req.CompositeQuery.Queries[0].Spec = spec
	labels := `"labels":[{"key":{"name":"service.name","fieldContext":"resource"},"value":"cart"}]`
	clickhouse := decoded(t, `{"type":"time_series","data":{"results":[{"queryName":"A","aggregations":[
		{"index":0,"series":[{`+labels+`,"values":[{"timestamp":60000,"value":664},{"timestamp":240000,"value":664}]}]},
		{"index":1,"series":[{`+labels+`,"values":[{"timestamp":60000,"value":6},{"timestamp":240000,"value":6}]}]}]}]}}`)
	c := evidencer(d).QueryRangeContext(context.Background(), req, clickhouse)
	var key string
	for k := range navigate(t, normalizedSeries(t, req, clickhouse)) {
		key = k
	}
	for i, window := range [][2]uint64{{90_000, 120_000}, {240_000, 250_000}} {
		path := parity.Path{"data", "results", 0, "aggregations", 0, "series", parity.Dynamic(key), 0, "values", i, "value"}
		q, ok := c.QuantileOf(path)
		require.True(t, ok)
		_, ok = c.QuantileEvidence(path, q, 780)
		require.True(t, ok, "bucket %d", i)
		assert.Equal(t, window, d.windows[len(d.windows)-4], "the partial bucket, counts first")
	}
}

func normalizedSeries(t *testing.T, req *qbtypes.QueryRangeRequest, answer any) any {
	t.Helper()
	copied, err := asJSON(answer)
	require.NoError(t, err)
	normalized, _ := QueryRangeView(req).Normalize(copied)
	return normalized
}

func navigate(t *testing.T, normalized any) map[string]any {
	t.Helper()
	got, ok := at(normalized, parity.Path{"data", "results", 0, "aggregations", 0, "series"})
	require.True(t, ok)
	return map[string]any(got.(parity.Keyed))
}

func TestEntryPointOperationsConfirmTheirServiceBoundary(t *testing.T) {
	req := servicetypesv1.OperationsRequest{Start: "1000000000", End: "61000000000", Service: "back", Limit: 2}
	answer := decoded(t, `{"data":[]}`)
	entry := evidencer(sixValues()).OperationsContext(context.Background(), true, req, answer, answer)
	assert.Equal(t, "back", entry.Service)
	assert.NotNil(t, entry.ServiceBoundary)
	top := evidencer(sixValues()).OperationsContext(context.Background(), false, req, answer, answer)
	assert.Nil(t, top.ServiceBoundary, "a parent elsewhere changes no top operation")
}

func TestAServicesBoundaryIsConfirmedWithinTheViewsFilter(t *testing.T) {
	s := &spans{all: []span{{"t1", "b1", "", "back", "handle", "unknown", ""}}}
	req := servicetypesv1.Request{Start: "1000000000", End: "61000000000"}
	c := Evidencer{Querier: s, Org: org}.ServicesContext(context.Background(), req, decoded(t, `{"data":[]}`))
	c.ServiceBoundary("back", "handle")
	require.NotEmpty(t, s.requests)
	assert.Contains(t, s.requests[0].Filter.Expression, "(isRoot = true OR isEntryPoint = true)", "the roots counted are the view's")
}
