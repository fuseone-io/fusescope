package parityrun

import (
	"context"
	"strconv"
	"time"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// pair is one comparison of a round: its view, what it asks for (fingerprinted in the report), how
// both graphs are called, and how its answers are compared and classified.
type pair struct {
	view   string
	tenant valuer.UUID
	class  parity.WindowClass
	params any
	call   parityexec.Call
	limit  *parityexec.TraceLimit
	judge  func(ctx context.Context, engine, clickhouse any) (parity.View, parity.Context)
}

var (
	timestampKey = telemetrytypes.TelemetryFieldKey{Name: "timestamp", FieldContext: telemetrytypes.FieldContextSpan}
	spanIDKey    = telemetrytypes.TelemetryFieldKey{Name: "span_id", FieldContext: telemetrytypes.FieldContextSpan}
)

func nanos(ns int64) string { return strconv.FormatInt(ns, 10) }

func servicesPair(ev parityexec.Evidencer, org valuer.UUID, class parity.WindowClass, w parity.Window) pair {
	req := servicetypesv1.Request{Start: nanos(w.Start), End: nanos(w.End)}
	return pair{view: "services", tenant: org, class: class, params: req, call: parityexec.Services(org, req),
		judge: func(ctx context.Context, _, clickhouse any) (parity.View, parity.Context) {
			return parity.Services, ev.ServicesContext(ctx, req, clickhouse)
		}}
}

func operationsPair(ev parityexec.Evidencer, org valuer.UUID, class parity.WindowClass, w parity.Window, service string, limit int, entry bool) pair {
	req := servicetypesv1.OperationsRequest{Start: nanos(w.Start), End: nanos(w.End), Service: service, Limit: limit}
	view, call := "top_operations", parityexec.TopOperations(org, req)
	if entry {
		view, call = "entry_operations", parityexec.EntryPointOperations(org, req)
	}
	return pair{view: view, tenant: org, class: class, params: req, call: call,
		judge: func(ctx context.Context, engine, clickhouse any) (parity.View, parity.Context) {
			return parity.Operations, ev.OperationsContext(ctx, entry, req, engine, clickhouse)
		}}
}

func queryRangePair(ev parityexec.Evidencer, view string, org valuer.UUID, class parity.WindowClass, req *qbtypes.QueryRangeRequest, absentKey bool) pair {
	req, _ = parityexec.WithGroupCount(req)
	return pair{view: view, tenant: org, class: class, params: req, call: parityexec.QueryRange(org, req),
		judge: func(ctx context.Context, _, clickhouse any) (parity.View, parity.Context) {
			c := ev.QueryRangeContext(ctx, req, clickhouse)
			c.AbsentKeyCase = absentKey
			return parityexec.QueryRangeView(req), c
		}}
}

// servicePairs are the query range views of one service: its latest spans, and its operations'
// latency over time and over the window.
func servicePairs(ev parityexec.Evidencer, org valuer.UUID, class parity.WindowClass, w parity.Window, service string, listLimit int) []pair {
	filter := &qbtypes.Filter{Expression: parityexec.Group{}.Where(serviceKey, service).Filter}
	byName := []qbtypes.GroupByKey{{TelemetryFieldKey: nameKey}}
	list := builderRequest(qbtypes.RequestTypeRaw, w, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		Filter: filter, Limit: listLimit,
		Order: []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: timestampKey}, Direction: qbtypes.OrderDirectionDesc}, {Key: qbtypes.OrderByKey{TelemetryFieldKey: spanIDKey}, Direction: qbtypes.OrderDirectionAsc}},
	})
	series := builderRequest(qbtypes.RequestTypeTimeSeries, w, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		Filter: filter, GroupBy: byName, StepInterval: qbtypes.Step{Duration: time.Minute},
		Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}, {Expression: "p99(duration_nano)"}},
	})
	scalar := builderRequest(qbtypes.RequestTypeScalar, w, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		Filter: filter, GroupBy: byName,
		Aggregations: []qbtypes.TraceAggregation{{Expression: "p50(duration_nano)"}, {Expression: "p99(duration_nano)"}},
	})
	return []pair{
		queryRangePair(ev, "span_list", org, class, list, false),
		queryRangePair(ev, "time_series", org, class, series, false),
		queryRangePair(ev, "scalar", org, class, scalar, false),
	}
}

// absentKeyPairs are the cases of every promoted key some spans lack, over the tenant's window.
func absentKeyPairs(ev parityexec.Evidencer, org valuer.UUID, class parity.WindowClass, w parity.Window, cases []parity.AbsentKeyCase, listLimit int) []pair {
	out := make([]pair, 0, len(cases))
	for _, c := range cases {
		spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{}
		if c.Filter != "" {
			spec.Filter = &qbtypes.Filter{Expression: c.Filter}
		}
		kind := qbtypes.RequestTypeRaw
		switch c.Shape {
		case parity.ShapeCount:
			kind, spec.Aggregations = qbtypes.RequestTypeScalar, []qbtypes.TraceAggregation{{Expression: "count()"}}
		case parity.ShapeSelect:
			spec.SelectFields = []telemetrytypes.TelemetryFieldKey{{Name: c.Attribute}}
			fallthrough
		default:
			spec.Limit = listLimit
			spec.Order = []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: timestampKey}, Direction: qbtypes.OrderDirectionDesc}, {Key: qbtypes.OrderByKey{TelemetryFieldKey: spanIDKey}, Direction: qbtypes.OrderDirectionAsc}}
		}
		out = append(out, queryRangePair(ev, "absent_key", org, class, builderRequest(kind, w, spec), true))
	}
	return out
}

// tracePairs are the summary and the waterfall of every sampled trace, each with its size against
// the engine's max_rows.
func tracePairs(org valuer.UUID, class parity.WindowClass, traces []parity.SampledTrace, spans map[string]int64, maxRows int64) []pair {
	out := make([]pair, 0, 2*len(traces))
	for _, tr := range traces {
		limit := &parityexec.TraceLimit{Spans: spans[tr.ID], MaxRows: maxRows}
		params := map[string]string{"trace_id": tr.ID, "reason": string(tr.Reason)}
		out = append(out,
			pair{view: "summary", tenant: org, class: class, params: params, call: parityexec.Summary(org, tr.ID), limit: limit,
				judge: func(context.Context, any, any) (parity.View, parity.Context) { return parity.Summary, parity.Context{} }},
			pair{view: "waterfall", tenant: org, class: class, params: params, call: parityexec.Waterfall(org, tr.ID), limit: limit,
				judge: func(context.Context, any, any) (parity.View, parity.Context) {
					return parity.Waterfall, parity.Context{}
				}},
		)
	}
	return out
}
