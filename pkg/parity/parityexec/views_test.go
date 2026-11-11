package parityexec

import (
	"context"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/modules/services"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/querier"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mutating is a querier that changes the request it is given, as the real one coerces its times.
type mutating struct {
	querier.Querier
	seen []qbtypes.QueryRangeRequest
}

func (m *mutating) QueryRange(_ context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	m.seen = append(m.seen, *req)
	req.Start *= 1000
	return &qbtypes.QueryRangeResponse{Type: req.RequestType, Warning: &qbtypes.QueryWarnData{Warnings: []qbtypes.QueryWarnDataAdditional{{Message: "partial"}}}}, nil
}

func TestEachSideOfAQueryRangeGetsItsOwnUncachedRequest(t *testing.T) {
	req := request(qbtypes.RequestTypeScalar, "p99(duration_nano)")
	req.NoCache = false
	start := req.Start
	call := QueryRange(org, req)
	m := &mutating{}
	g := &Graph{Querier: m}
	for i := 0; i < 2; i++ {
		_, warnings, err := call(context.Background(), g)
		require.NoError(t, err)
		assert.Equal(t, []string{"partial"}, warnings)
	}
	require.Len(t, m.seen, 2)
	for _, seen := range m.seen {
		assert.Equal(t, start, seen.Start, "neither side sees what the other's querier did")
		assert.True(t, seen.NoCache)
	}
	assert.Equal(t, start, req.Start)
}

func TestAQuantilePairCountsItsGroups(t *testing.T) {
	req := request(qbtypes.RequestTypeScalar, "p99(duration_nano)")
	counted, index := WithGroupCount(req)
	spec := counted.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	assert.Equal(t, []string{"p99(duration_nano)", "count()"}, expressions(spec))
	assert.Equal(t, map[string]int{"A": 1}, index)
	assert.Len(t, req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]).Aggregations, 1, "the request given is left alone")

	plain, index := WithGroupCount(request(qbtypes.RequestTypeScalar, "count()"))
	assert.Empty(t, index, "no quantile, nothing to count")
	assert.Len(t, plain.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]).Aggregations, 1)
}

type fakeServices struct {
	services.Module
	asked []string
}

func (f *fakeServices) Get(context.Context, valuer.UUID, *servicetypesv1.Request) ([]*servicetypesv1.ResponseItem, []string, error) {
	f.asked = append(f.asked, "services")
	return []*servicetypesv1.ResponseItem{{ServiceName: "cart"}}, []string{"partial"}, nil
}

func (f *fakeServices) GetTopOperations(_ context.Context, _ valuer.UUID, req *servicetypesv1.OperationsRequest) ([]servicetypesv1.OperationItem, []string, error) {
	f.asked = append(f.asked, "top:"+req.Service)
	return []servicetypesv1.OperationItem{{Name: "GET"}}, nil, nil
}

func (f *fakeServices) GetEntryPointOperations(_ context.Context, _ valuer.UUID, req *servicetypesv1.OperationsRequest) ([]servicetypesv1.OperationItem, []string, error) {
	f.asked = append(f.asked, "entry:"+req.Service)
	return []servicetypesv1.OperationItem{{Name: "GET"}}, nil, nil
}

type fakeTraces struct {
	tracedetail.Module
	asked []string
}

func (f *fakeTraces) GetTraceSummary(_ context.Context, _ valuer.UUID, traceID string) (*spantypes.TraceStats, []string, error) {
	f.asked = append(f.asked, "summary:"+traceID)
	return &spantypes.TraceStats{}, nil, nil
}

func (f *fakeTraces) GetWaterfallV4(_ context.Context, _ valuer.UUID, traceID, selected string, uncollapsed []string) (*spantypes.GettableWaterfallTrace, []string, error) {
	f.asked = append(f.asked, "waterfall:"+traceID+":"+selected+strings.Join(uncollapsed, ","))
	return &spantypes.GettableWaterfallTrace{}, []string{"partial"}, nil
}

func TestTheServiceAndTraceViewsAreCalledAsTheirHandlersDo(t *testing.T) {
	svc, traces := &fakeServices{}, &fakeTraces{}
	g := &Graph{Services: svc, TraceDetail: traces}
	ctx := context.Background()

	answer, warnings, err := Services(org, servicetypesv1.Request{Start: "1", End: "2"})(ctx, g)
	require.NoError(t, err)
	decoded, err := asJSON(answer)
	require.NoError(t, err)
	assert.Equal(t, "cart", decoded.(map[string]any)["data"].([]any)[0].(map[string]any)["serviceName"], "enveloped as the handler writes it")
	assert.Equal(t, []string{"partial"}, warnings)

	for _, call := range []Call{
		TopOperations(org, servicetypesv1.OperationsRequest{Service: "cart"}),
		EntryPointOperations(org, servicetypesv1.OperationsRequest{Service: "cart"}),
		Summary(org, "abc"),
		Waterfall(org, "abc"),
	} {
		_, _, err := call(ctx, g)
		require.NoError(t, err)
	}
	assert.Equal(t, []string{"services", "top:cart", "entry:cart"}, svc.asked)
	assert.Equal(t, []string{"summary:abc", "waterfall:abc:"}, traces.asked)
}
