package parityexec

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/parity"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

// QueryRangeView is the view a query range pair of req is compared with: its quantile
// aggregations are left for the judgement, a scalar keeps its rows' order only when ordered, and a
// raw list asked latest first is compared row by row by identity, at its limit.
func QueryRangeView(req *qbtypes.QueryRangeRequest) parity.View {
	spec, ok := onlyTraceQuery(req)
	quantiles := map[int]float64{}
	if ok {
		for i, a := range spec.Aggregations {
			if _, q, isQuantile := QuantileField(a.Expression); isQuantile {
				quantiles[i] = q
			}
		}
	}
	switch req.RequestType {
	case qbtypes.RequestTypeScalar:
		return parity.ScalarView(ok && len(spec.Order) > 0, quantiles)
	case qbtypes.RequestTypeTimeSeries:
		return parity.TimeSeriesView(quantiles)
	}
	if ok && latestFirst(spec.Order) {
		return parity.SpanListView(spec.Limit)
	}
	return parity.SpanList
}

// latestFirst tells whether order is the span's timestamp descending, then its span_id ascending:
// those names as attributes or resources order otherwise.
func latestFirst(order []qbtypes.OrderBy) bool {
	spanField := func(o qbtypes.OrderBy, name string) bool {
		return o.Key.Name == name && o.Key.FieldContext == telemetrytypes.FieldContextSpan
	}
	return len(order) == 2 &&
		spanField(order[0], "timestamp") && order[0].Direction == qbtypes.OrderDirectionDesc &&
		spanField(order[1], "span_id") && order[1].Direction == qbtypes.OrderDirectionAsc
}

func onlyTraceQuery(req *qbtypes.QueryRangeRequest) (qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation], bool) {
	if req == nil || len(req.CompositeQuery.Queries) != 1 {
		return qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{}, false
	}
	spec, ok := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	return spec, ok
}

// queryRange is what a query range pair's context reads: its one query, the aggregation counting
// each group (WithGroupCount), and ClickHouse's answer normalized as the pair compares it.
type queryRange struct {
	e          Evidencer
	spec       qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]
	base       Group
	count      int
	normalized any
}

// QueryRangeContext is how a query range pair's quantile differences are classified: the group of
// a scalar row is every group by column at the row's values, the group of a time series point its
// labels over its bucket, and the group's count() in ClickHouse's answer must match the evidence.
// A request of more than one query, or without a group count, gives no evidence.
func (e Evidencer) QueryRangeContext(ctx context.Context, req *qbtypes.QueryRangeRequest, clickhouse any) parity.Context {
	spec, ok := onlyTraceQuery(req)
	r := queryRange{e: e, spec: spec, count: -1}
	if ok {
		r.base = Group{Start: req.Start, End: req.End, Variables: req.Variables}
		if spec.Filter != nil {
			r.base.Filter = spec.Filter.Expression
		}
		for i, a := range spec.Aggregations {
			if a.Expression == "count()" {
				r.count = i
			}
		}
		r.normalized, _ = QueryRangeView(req).Normalize(copyOf(clickhouse))
	}
	timeSeries := req.RequestType == qbtypes.RequestTypeTimeSeries
	return parity.Context{
		QuantileOf: func(path parity.Path) (float64, bool) {
			index, ok := r.aggregationOf(path, timeSeries)
			if !ok {
				return 0, false
			}
			_, q, ok := QuantileField(spec.Aggregations[index].Expression)
			return q, ok
		},
		QuantileEvidence: func(path parity.Path, q, v float64) (parity.QuantileEvidence, bool) {
			index, ok := r.aggregationOf(path, timeSeries)
			if !ok || r.count < 0 {
				return parity.QuantileEvidence{}, false
			}
			field, _, _ := QuantileField(spec.Aggregations[index].Expression)
			g, rows, ok := r.scalarGroup(path)
			if timeSeries {
				g, rows, ok = r.pointGroup(path)
			}
			if !ok {
				return parity.QuantileEvidence{}, false
			}
			g.Field = field
			return e.stable(ctx, g, q, v, rows)
		},
	}
}

// aggregationOf is the aggregation a quantile path is a value of.
func (r queryRange) aggregationOf(path parity.Path, timeSeries bool) (int, bool) {
	var index float64
	if timeSeries {
		if len(path) != 11 {
			return 0, false
		}
		aggregation, ok := at(r.normalized, path[:5])
		if !ok {
			return 0, false
		}
		m, _ := aggregation.(map[string]any)
		if index, ok = number(m["index"]); !ok {
			return 0, false
		}
	} else {
		column, ok := path[len(path)-1].(int)
		columns, found := at(r.normalized, append(path[:3:3], "columns", column))
		if !ok || !found {
			return 0, false
		}
		m, _ := columns.(map[string]any)
		if index, ok = number(m["aggregationIndex"]); !ok {
			return 0, false
		}
	}
	i := int(index)
	return i, i >= 0 && i < len(r.spec.Aggregations)
}

// scalarGroup is the group of the row a scalar path is in, and its count() there.
func (r queryRange) scalarGroup(path parity.Path) (Group, int64, bool) {
	result, ok := at(r.normalized, path[:3])
	row, found := at(r.normalized, path[:len(path)-1])
	if !ok || !found {
		return Group{}, 0, false
	}
	columns, _ := result.(map[string]any)["columns"].([]any)
	values, _ := row.([]any)
	g, rows, counted := r.base, int64(0), false
	for i, column := range columns {
		c, _ := column.(map[string]any)
		if i >= len(values) {
			return Group{}, 0, false
		}
		switch c["columnType"] {
		case "group":
			key, ok := fieldKey(c)
			if !ok {
				return Group{}, 0, false
			}
			g = g.Where(key, values[i])
		case "aggregation":
			if index, _ := number(c["aggregationIndex"]); int(index) == r.count {
				n, ok := number(values[i])
				rows, counted = int64(n), ok
			}
		}
	}
	return g, rows, counted
}

// pointGroup is the group of the series a time series path is in, over the point's bucket, and
// its count() at that point.
func (r queryRange) pointGroup(path parity.Path) (Group, int64, bool) {
	series, ok := at(r.normalized, path[:8])
	point, found := at(r.normalized, path[:10])
	if !ok || !found {
		return Group{}, 0, false
	}
	labels, _ := series.(map[string]any)["labels"].([]any)
	g := r.base
	for _, label := range labels {
		l, _ := label.(map[string]any)
		key, ok := fieldKey(l["key"])
		if !ok {
			return Group{}, 0, false
		}
		g = g.Where(key, l["value"])
	}
	ts, ok := number(point.(map[string]any)["timestamp"])
	if !ok {
		return Group{}, 0, false
	}
	g, ok = g.Bucket(uint64(ts), uint64(r.spec.StepInterval.Milliseconds()))
	if !ok {
		return Group{}, 0, false
	}
	rows, ok := r.countAt(path, ts)
	return g, rows, ok
}

// countAt is the group count of the same series at the timestamp ts.
func (r queryRange) countAt(path parity.Path, ts float64) (int64, bool) {
	aggregations, ok := at(r.normalized, path[:4])
	if !ok {
		return 0, false
	}
	list, _ := aggregations.([]any)
	for i, aggregation := range list {
		m, _ := aggregation.(map[string]any)
		if index, _ := number(m["index"]); int(index) != r.count {
			continue
		}
		values, ok := at(r.normalized, append(append(path[:4:4], i, "series"), path[6], 0, "values"))
		if !ok {
			return 0, false
		}
		points, _ := values.([]any)
		for _, p := range points {
			pm, _ := p.(map[string]any)
			if t, _ := number(pm["timestamp"]); t == ts {
				n, ok := number(pm["value"])
				return int64(n), ok
			}
		}
	}
	return 0, false
}
