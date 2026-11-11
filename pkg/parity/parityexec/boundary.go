package parityexec

import (
	"context"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

// boundarySample is how many spans of an operation are looked at for a witness.
const boundarySample = 50

var (
	serviceKey   = telemetrytypes.TelemetryFieldKey{Name: "service.name", FieldContext: telemetrytypes.FieldContextResource}
	operationKey = telemetrytypes.TelemetryFieldKey{Name: "name", FieldContext: telemetrytypes.FieldContextSpan}
)

// Boundary confirms that operation of service is a top-level operation in ClickHouse only because
// a span of it has its parent in another service with its remoteness unknown (D7): no span of the
// operation in the window is a root, and among a deterministic sample of its spans with is_remote
// unknown at least one has its parent, found by (trace_id, parent_span_id), in another service.
// Spans whose parent is missing or in the same service are no witnesses; they deny nothing.
//
// # Errors
//
// A query ClickHouse refused, or an answer of another shape.
func (e Evidencer) Boundary(ctx context.Context, window Group, service, operation string) (bool, error) {
	spans := Group{Start: window.Start, End: window.End}.Where(serviceKey, service).Where(operationKey, operation)
	roots := spans.Where(telemetrytypes.TelemetryFieldKey{Name: "isRoot"}, true)
	count := e.query(roots)
	count.Aggregations = []qbtypes.TraceAggregation{{Expression: "count()"}}
	resp, err := e.Querier.QueryRange(ctx, e.Org, e.request(roots, qbtypes.RequestTypeScalar, count))
	if err != nil {
		return false, err
	}
	row, err := scalarRow(resp, 1)
	if err != nil || row[0] != 0 {
		return false, err
	}

	unknown := spans.Where(telemetrytypes.TelemetryFieldKey{Name: "is_remote"}, "unknown")
	sample := e.query(unknown)
	sample.SelectFields = []telemetrytypes.TelemetryFieldKey{{Name: "trace_id"}, {Name: "parent_span_id"}}
	sample.Order = []qbtypes.OrderBy{
		{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "timestamp"}}, Direction: qbtypes.OrderDirectionAsc},
		{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "span_id"}}, Direction: qbtypes.OrderDirectionAsc},
	}
	sample.Limit = boundarySample
	resp, err = e.Querier.QueryRange(ctx, e.Org, e.request(unknown, qbtypes.RequestTypeRaw, sample))
	if err != nil {
		return false, err
	}
	var parents []string
	for _, r := range rawRows(resp) {
		trace, _ := r.Data["trace_id"].(string)
		parent, _ := r.Data["parent_span_id"].(string)
		if trace != "" && parent != "" {
			parents = append(parents, "(trace_id = "+literal(trace)+" AND span_id = "+literal(parent)+")")
		}
	}
	if len(parents) == 0 {
		return false, nil
	}
	return e.parentElsewhere(ctx, window, service, parents)
}

func (e Evidencer) parentElsewhere(ctx context.Context, window Group, service string, parents []string) (bool, error) {
	g := Group{Start: window.Start, End: window.End, Filter: strings.Join(parents, " OR ")}
	lookup := e.query(g)
	lookup.SelectFields = []telemetrytypes.TelemetryFieldKey{{Name: "trace_id"}, {Name: "span_id"}, serviceKey}
	lookup.Limit = len(parents)
	resp, err := e.Querier.QueryRange(ctx, e.Org, e.request(g, qbtypes.RequestTypeRaw, lookup))
	if err != nil {
		return false, err
	}
	for _, r := range rawRows(resp) {
		other, ok := r.Data[serviceKey.Name].(string)
		if !ok {
			return false, errors.NewInternalf(errors.CodeInternal, "a parent span has no service")
		}
		if other != service {
			return true, nil
		}
	}
	return false, nil
}
