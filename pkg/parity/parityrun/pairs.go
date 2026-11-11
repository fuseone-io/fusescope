package parityrun

import (
	"context"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// The views a round compares.
const (
	ViewServices        = "services"
	ViewTopOperations   = "top_operations"
	ViewEntryOperations = "entry_operations"
	ViewSpanList        = "span_list"
	ViewTimeSeries      = "time_series"
	ViewScalar          = "scalar"
	ViewAbsentKey       = "absent_key"
	ViewSummary         = "summary"
	ViewWaterfall       = "waterfall"
)

// Views are every view a round compares, the ones the period needs pairs of.
var Views = []string{ViewServices, ViewTopOperations, ViewEntryOperations, ViewSpanList, ViewTimeSeries, ViewScalar, ViewAbsentKey, ViewSummary, ViewWaterfall}

// PairSpec is everything a pair is built from, over an absolute window, so a pair can run again in
// a later round. It names tenant data: it travels through the RequeueStore only, and the report
// keeps its fingerprint.
type PairSpec struct {
	View      string                `json:"view"`
	Org       string                `json:"org"`
	Class     parity.WindowClass    `json:"class"`
	Window    parity.Window         `json:"window"`
	Service   string                `json:"service,omitempty"`
	Operation string                `json:"operation,omitempty"`
	TraceID   string                `json:"trace_id,omitempty"`
	Spans     int64                 `json:"spans,omitempty"`
	Reason    parity.TraceReason    `json:"reason,omitempty"`
	Case      *parity.AbsentKeyCase `json:"case,omitempty"`
}

// pair is a spec built: how both graphs are called, and how its answers are compared.
type pair struct {
	spec     PairSpec
	org      valuer.UUID
	requeued bool
	call     parityexec.Call
	limit    *parityexec.TraceLimit
	judge    func(ctx context.Context, engine, clickhouse any) (parity.View, parity.Context)
}

var (
	timestampKey = telemetrytypes.TelemetryFieldKey{Name: "timestamp", FieldContext: telemetrytypes.FieldContextSpan}
	spanIDKey    = telemetrytypes.TelemetryFieldKey{Name: "span_id", FieldContext: telemetrytypes.FieldContextSpan}
	latestFirst  = []qbtypes.OrderBy{
		{Key: qbtypes.OrderByKey{TelemetryFieldKey: timestampKey}, Direction: qbtypes.OrderDirectionDesc},
		{Key: qbtypes.OrderByKey{TelemetryFieldKey: spanIDKey}, Direction: qbtypes.OrderDirectionAsc},
	}
)

func nanos(ns int64) string { return strconv.FormatInt(ns, 10) }

// build is the pair of spec.
//
// # Errors
//
// A spec of no known view, of an org that is not an id, or missing what its view needs.
func (r Round) build(ev parityexec.Evidencer, spec PairSpec) (pair, error) {
	org, err := valuer.NewUUID(spec.Org)
	if err != nil || spec.Window.Start >= spec.Window.End {
		return pair{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "a pair spec needs an org and a window")
	}
	ev.Org = org
	p := pair{spec: spec, org: org}
	w, cfg := spec.Window, r.Config
	switch spec.View {
	case ViewServices:
		req := servicetypesv1.Request{Start: nanos(w.Start), End: nanos(w.End)}
		p.call = parityexec.Services(org, req)
		p.judge = func(ctx context.Context, _, clickhouse any) (parity.View, parity.Context) {
			return parity.Services, ev.ServicesContext(ctx, req, clickhouse)
		}
	case ViewTopOperations, ViewEntryOperations:
		if spec.Service == "" {
			return pair{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "an operations pair needs a service")
		}
		entry := spec.View == ViewEntryOperations
		req := servicetypesv1.OperationsRequest{Start: nanos(w.Start), End: nanos(w.End), Service: spec.Service, Limit: cfg.OperationsLimit}
		p.call = parityexec.TopOperations(org, req)
		if entry {
			p.call = parityexec.EntryPointOperations(org, req)
		}
		p.judge = func(ctx context.Context, engine, clickhouse any) (parity.View, parity.Context) {
			return parity.Operations, ev.OperationsContext(ctx, entry, req, engine, clickhouse)
		}
	case ViewSpanList, ViewTimeSeries, ViewScalar:
		if spec.Service == "" || spec.Operation == "" {
			return pair{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "an operation pair needs its service and operation")
		}
		p.setQueryRange(ev, operationRequest(spec, cfg.ListLimit), false)
	case ViewAbsentKey:
		if spec.Case == nil {
			return pair{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "an absent-key pair needs its case")
		}
		p.setQueryRange(ev, absentKeyRequest(spec, cfg.ListLimit), true)
	case ViewSummary, ViewWaterfall:
		if spec.TraceID == "" {
			return pair{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "a trace pair needs its trace")
		}
		p.limit = &parityexec.TraceLimit{Spans: spec.Spans, MaxRows: cfg.Limits.MaxRows}
		view := parity.Summary
		p.call = parityexec.Summary(org, spec.TraceID)
		if spec.View == ViewWaterfall {
			view, p.call = parity.Waterfall, parityexec.Waterfall(org, spec.TraceID)
		}
		p.judge = func(context.Context, any, any) (parity.View, parity.Context) { return view, parity.Context{} }
	default:
		return pair{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "no view %q", spec.View)
	}
	return p, nil
}

func (p *pair) setQueryRange(ev parityexec.Evidencer, req *qbtypes.QueryRangeRequest, absentKey bool) {
	req, _ = parityexec.WithGroupCount(req)
	p.call = parityexec.QueryRange(p.org, req)
	p.judge = func(ctx context.Context, _, clickhouse any) (parity.View, parity.Context) {
		c := ev.QueryRangeContext(ctx, req, clickhouse)
		c.AbsentKeyCase = absentKey
		return parityexec.QueryRangeView(req), c
	}
}

// operationRequest is the query range view of one operation: its latest spans, its latency over
// time, or its latency over the window.
func operationRequest(spec PairSpec, listLimit int) *qbtypes.QueryRangeRequest {
	filter := &qbtypes.Filter{Expression: parityexec.Group{}.Where(serviceKey, spec.Service).Where(nameKey, spec.Operation).Filter}
	switch spec.View {
	case ViewSpanList:
		return builderRequest(qbtypes.RequestTypeRaw, spec.Window, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{Filter: filter, Limit: listLimit, Order: latestFirst})
	case ViewTimeSeries:
		return builderRequest(qbtypes.RequestTypeTimeSeries, spec.Window, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
			Filter: filter, StepInterval: qbtypes.Step{Duration: time.Minute},
			Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}, {Expression: "p99(duration_nano)"}},
		})
	}
	return builderRequest(qbtypes.RequestTypeScalar, spec.Window, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		Filter:       filter,
		Aggregations: []qbtypes.TraceAggregation{{Expression: "p50(duration_nano)"}, {Expression: "p99(duration_nano)"}},
	})
}

// absentKeyRequest is the list, count or selection an absent-key case asks for.
func absentKeyRequest(spec PairSpec, listLimit int) *qbtypes.QueryRangeRequest {
	c := spec.Case
	q := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{}
	if c.Filter != "" {
		q.Filter = &qbtypes.Filter{Expression: c.Filter}
	}
	if c.Shape == parity.ShapeCount {
		q.Aggregations = []qbtypes.TraceAggregation{{Expression: "count()"}}
		return builderRequest(qbtypes.RequestTypeScalar, spec.Window, q)
	}
	if c.Shape == parity.ShapeSelect {
		q.SelectFields = []telemetrytypes.TelemetryFieldKey{{Name: c.Attribute}}
	}
	q.Limit, q.Order = listLimit, latestFirst
	return builderRequest(qbtypes.RequestTypeRaw, spec.Window, q)
}

// validSpec checks everything a queued spec needs, before it is gated: a spec that fails it never
// becomes valid later, so it leaves the queue.
//
// # Errors
//
// An unknown class or view, a window that is empty, misaligned or before the tenant's dual write,
// or a spec without what its view asks for.
func (r Round) validSpec(spec PairSpec, tenant Tenant) error {
	invalid := func(format string, args ...any) error {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeRound, format, args...)
	}
	step := int64(r.Config.Window.Step)
	w := spec.Window
	switch {
	case spec.Class != parity.Settled && spec.Class != parity.Recent:
		return invalid("a spec of no window class")
	case step <= 0 || w.Start >= w.End || w.Start%step != 0 || w.End%step != 0:
		return invalid("a spec window must be non-empty and aligned to the step")
	case w.Start < tenant.DualWriteEpoch.UnixNano():
		return invalid("a spec window starts before the tenant's dual write")
	}
	switch spec.View {
	case ViewServices:
		return nil
	case ViewTopOperations, ViewEntryOperations:
		if spec.Service == "" {
			return invalid("an operations spec needs its service")
		}
	case ViewSpanList, ViewTimeSeries, ViewScalar:
		if spec.Service == "" || spec.Operation == "" {
			return invalid("an operation spec needs its service and operation")
		}
	case ViewSummary, ViewWaterfall:
		if !traceID.MatchString(spec.TraceID) {
			return invalid("a trace spec needs a trace id")
		}
	case ViewAbsentKey:
		return validCase(spec.Case)
	default:
		return invalid("a spec of no view")
	}
	return nil
}

func validCase(c *parity.AbsentKeyCase) error {
	invalid := errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "an absent-key spec needs a case of a promoted key")
	if c == nil || !slices.Contains(parity.AbsentKeyAttributes(), c.Attribute) {
		return invalid
	}
	switch c.Shape {
	case parity.ShapeSelect:
		if c.Filter != "" {
			return invalid
		}
	case parity.ShapeList, parity.ShapeCount:
		if !strings.HasPrefix(c.Filter, c.Attribute+" ") {
			return invalid
		}
	default:
		return invalid
	}
	return nil
}
