package parityexec

import (
	"context"
	"encoding/json"

	"github.com/fuseone-io/fusescope/pkg/modules/services/implservices"
	"github.com/fuseone-io/fusescope/pkg/parity"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

// operationsQuantile is the quantile top and entry point operations are ordered by.
const operationsQuantile = 0.99

// ServicesContext is how a services pair's differences are classified: a service's p99 is judged
// on the module's own request narrowed to the service, and the size of that group must still be
// the numCalls ClickHouse answered. A top-level operation ClickHouse alone counts is confirmed as a
// service boundary by Boundary.
func (e Evidencer) ServicesContext(ctx context.Context, req servicetypesv1.Request, clickhouse any) parity.Context {
	view, start, end, err := implservices.ServicesRequest(&req)
	base, fields := baseGroup(view)
	calls := numCalls(clickhouse, "serviceName")
	window := Group{Start: start, End: end}
	return parity.Context{
		QuantileOf: func(path parity.Path) (float64, bool) {
			f, ok := fields[path.Last()]
			return f.q, ok && len(path) == 4 && path[0] == "data"
		},
		QuantileEvidence: func(path parity.Path, q, v float64) (parity.QuantileEvidence, bool) {
			service, ok := path[1].(parity.Dynamic)
			f, known := fields[path.Last()]
			if err != nil || !ok || !known {
				return parity.QuantileEvidence{}, false
			}
			g := base.Where(serviceKey, string(service))
			g.Field = f.field
			return e.stable(ctx, g, q, v, calls[string(service)])
		},
		ServiceBoundary: func(service, operation string) bool {
			confirmed, err := e.Boundary(ctx, window, service, operation)
			return err == nil && confirmed
		},
	}
}

// OperationsContext is how a top or entry point operations pair's differences are classified: a
// quantile is judged on the module's request narrowed to the operation, its order by
// JudgeOperationOrder, and the operations at its limit by JudgeOperationCut.
func (e Evidencer) OperationsContext(ctx context.Context, entry bool, req servicetypesv1.OperationsRequest, engine, clickhouse any) parity.Context {
	build := implservices.TopOperationsRequest
	if entry {
		build = implservices.EntryPointOperationsRequest
	}
	view, err := build(&req)
	base, fields := baseGroup(view)
	calls := numCalls(clickhouse, "name")
	for name, n := range numCalls(engine, "name") {
		if _, ok := calls[name]; !ok {
			calls[name] = n
		}
	}
	evidence := func(operation string, q, v float64, alias string) (parity.QuantileEvidence, bool) {
		f, known := fields[alias]
		if err != nil || !known {
			return parity.QuantileEvidence{}, false
		}
		g := base.Where(operationKey, operation)
		g.Field = f.field
		return e.stable(ctx, g, q, v, calls[operation])
	}
	byP99 := func(operation string, v float64) (parity.QuantileEvidence, bool) {
		return evidence(operation, operationsQuantile, v, "p99")
	}
	engineAnswer, clickhouseAnswer := copyOf(engine), copyOf(clickhouse)
	return parity.Context{
		QuantileOf: func(path parity.Path) (float64, bool) {
			f, ok := fields[path.Last()]
			return f.q, ok && len(path) == 4 && path[0] == "items"
		},
		QuantileEvidence: func(path parity.Path, q, v float64) (parity.QuantileEvidence, bool) {
			operation, ok := path[1].(parity.Dynamic)
			if !ok {
				return parity.QuantileEvidence{}, false
			}
			return evidence(string(operation), q, v, path.Last())
		},
		OperationOrder: func() parity.Verdict { return parity.JudgeOperationOrder(engineAnswer, clickhouseAnswer, byP99) },
		OperationCut: func() parity.Verdict {
			return parity.JudgeOperationCut(engineAnswer, clickhouseAnswer, req.Limit, byP99)
		},
	}
}

// stable is g's evidence when its row count is still rows, the group's size in the view's answer:
// a group that changed between the view and the evidence is no evidence.
func (e Evidencer) stable(ctx context.Context, g Group, q, v float64, rows int64) (parity.QuantileEvidence, bool) {
	got, ok, err := e.Quantile(ctx, g, q, v)
	if err != nil || !ok || got.Rows != rows {
		return parity.QuantileEvidence{}, false
	}
	return got.Evidence, true
}

type quantileField struct {
	field string
	q     float64
}

// baseGroup is the window and filter of a view's one builder query, and its quantile aggregations
// by alias.
func baseGroup(req *qbtypes.QueryRangeRequest) (Group, map[string]quantileField) {
	fields := map[string]quantileField{}
	if req == nil || len(req.CompositeQuery.Queries) != 1 {
		return Group{}, fields
	}
	spec, ok := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	if !ok {
		return Group{}, fields
	}
	for _, a := range spec.Aggregations {
		if field, q, ok := QuantileField(a.Expression); ok {
			fields[a.Alias] = quantileField{field: field, q: q}
		}
	}
	g := Group{Start: req.Start, End: req.End, Variables: req.Variables}
	if spec.Filter != nil {
		g.Filter = spec.Filter.Expression
	}
	return g, fields
}

// numCalls is the numCalls of each item of an answer's data, by the item's name field.
func numCalls(answer any, name string) map[string]int64 {
	out := map[string]int64{}
	envelope, _ := answer.(map[string]any)
	items, _ := envelope["data"].([]any)
	for _, item := range items {
		m, _ := item.(map[string]any)
		key, _ := m[name].(string)
		if n, ok := number(m["numCalls"]); ok {
			out[key] = int64(n)
		}
	}
	return out
}

func copyOf(answer any) any {
	copied, err := asJSON(answer)
	if err != nil {
		return nil
	}
	return copied
}

// at is the value at path in a normalized answer.
func at(v any, path parity.Path) (any, bool) {
	for _, segment := range path {
		switch s := segment.(type) {
		case string:
			m, ok := v.(map[string]any)
			if !ok {
				return nil, false
			}
			v, ok = m[s]
			if !ok {
				return nil, false
			}
		case parity.Dynamic:
			m, ok := v.(parity.Keyed)
			if !ok {
				return nil, false
			}
			v, ok = m[string(s)]
			if !ok {
				return nil, false
			}
		case int:
			list, ok := v.([]any)
			if !ok || s < 0 || s >= len(list) {
				return nil, false
			}
			v = list[s]
		default:
			return nil, false
		}
	}
	return v, true
}

// fieldKey is the key a column descriptor or a series label names.
func fieldKey(descriptor any) (telemetrytypes.TelemetryFieldKey, bool) {
	raw, err := json.Marshal(descriptor)
	if err != nil {
		return telemetrytypes.TelemetryFieldKey{}, false
	}
	var key telemetrytypes.TelemetryFieldKey
	if err := json.Unmarshal(raw, &key); err != nil || key.Name == "" {
		return telemetrytypes.TelemetryFieldKey{}, false
	}
	return key, true
}
