package parityexec

import (
	"context"
	"encoding/json"

	"github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// envelope is how the services and trace detail handlers write an answer.
type envelope struct {
	Data any `json:"data"`
}

// QueryRange is the query range view of req for org. Each
// side gets its own copy, decoded as the handler decodes it, without the bucket cache: the querier
// changes the request it runs.
func QueryRange(org valuer.UUID, req *qbtypes.QueryRangeRequest) Call {
	raw, err := json.Marshal(req)
	return func(ctx context.Context, g *Graph) (any, []string, error) {
		if err != nil {
			return nil, nil, errors.WrapInternalf(err, errors.CodeInternal, "error encoding a query range request")
		}
		var copied qbtypes.QueryRangeRequest
		if err := json.Unmarshal(raw, &copied); err != nil {
			return nil, nil, errors.WrapInternalf(err, errors.CodeInternal, "error decoding a query range request")
		}
		copied.NoCache = true
		resp, err := g.Querier.QueryRange(ctx, org, &copied)
		if err != nil {
			return nil, nil, err
		}
		var warnings []string
		if resp.Warning != nil {
			for _, w := range resp.Warning.Warnings {
				warnings = append(warnings, w.Message)
			}
		}
		return resp, warnings, nil
	}
}

// WithGroupCount adds count() to every builder query of req holding a quantile, so the size of
// each of its groups can be checked against the evidence. index names the position of the count
// in each query it was added to. req itself is left alone.
func WithGroupCount(req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeRequest, map[string]int) {
	copied := *req
	copied.CompositeQuery.Queries = make([]qbtypes.QueryEnvelope, len(req.CompositeQuery.Queries))
	index := map[string]int{}
	for i, q := range req.CompositeQuery.Queries {
		copied.CompositeQuery.Queries[i] = q
		spec, ok := q.Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
		if !ok || !holdsQuantile(spec) {
			continue
		}
		spec.Aggregations = append(append([]qbtypes.TraceAggregation(nil), spec.Aggregations...), qbtypes.TraceAggregation{Expression: "count()"})
		index[spec.Name] = len(spec.Aggregations) - 1
		copied.CompositeQuery.Queries[i].Spec = spec
	}
	return &copied, index
}

func holdsQuantile(spec qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]) bool {
	for _, a := range spec.Aggregations {
		if _, _, ok := QuantileField(a.Expression); ok {
			return true
		}
	}
	return false
}

// Services is the services list.
func Services(org valuer.UUID, req servicetypesv1.Request) Call {
	return func(ctx context.Context, g *Graph) (any, []string, error) {
		items, warnings, err := g.Services.Get(ctx, org, &req)
		return envelope{Data: items}, warnings, err
	}
}

// TopOperations is a service's top operations.
func TopOperations(org valuer.UUID, req servicetypesv1.OperationsRequest) Call {
	return func(ctx context.Context, g *Graph) (any, []string, error) {
		items, warnings, err := g.Services.GetTopOperations(ctx, org, &req)
		return envelope{Data: items}, warnings, err
	}
}

// EntryPointOperations is a service's entry point operations.
func EntryPointOperations(org valuer.UUID, req servicetypesv1.OperationsRequest) Call {
	return func(ctx context.Context, g *Graph) (any, []string, error) {
		items, warnings, err := g.Services.GetEntryPointOperations(ctx, org, &req)
		return envelope{Data: items}, warnings, err
	}
}

// Summary is a trace's summary.
func Summary(org valuer.UUID, traceID string) Call {
	return func(ctx context.Context, g *Graph) (any, []string, error) {
		stats, warnings, err := g.TraceDetail.GetTraceSummary(ctx, org, traceID)
		return envelope{Data: stats}, warnings, err
	}
}

// Waterfall is a trace's waterfall, opened at its root with nothing expanded.
func Waterfall(org valuer.UUID, traceID string) Call {
	return func(ctx context.Context, g *Graph) (any, []string, error) {
		trace, warnings, err := g.TraceDetail.GetWaterfallV4(ctx, org, traceID, "", nil)
		return envelope{Data: trace}, warnings, err
	}
}
