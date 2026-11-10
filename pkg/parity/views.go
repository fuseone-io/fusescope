package parity

import (
	"slices"
	"strings"
)

// View normalizes one view's answer for Compare: it turns the collections without a contractual
// order into Keyed ones and says which paths hold quantiles and which are outside the contract.
type View struct {
	Name      string
	normalize func(any) (any, Rule)
}

// Normalize returns the answer as Compare reads it, and the rule for this view.
func (v View) Normalize(answer any) (any, Rule) {
	return v.normalize(answer)
}

var (
	// SpanList is a query range raw answer: its rows keep the order the query asked for.
	SpanList = View{Name: "span_list", normalize: func(answer any) (any, Rule) {
		return answer, Rule{Excluded: isMeta}
	}}
	// TimeSeries is a query range time series without quantiles.
	TimeSeries = TimeSeriesView(nil)
	// Services is the services list: no order between services, each top-level operation list
	// the sentinel first, then a multiset.
	Services = View{Name: "services", normalize: normalizeServices}
	// Operations is a service's top or entry point operations: slowest first, ties without order.
	Operations = View{Name: "operations", normalize: normalizeOperations}
	// Summary is a trace's summary, field by field.
	Summary = View{Name: "summary", normalize: identity}
	// Waterfall is a trace's waterfall: its spans in the tree's pre-order.
	Waterfall = View{Name: "waterfall", normalize: identity}
)

// TimeSeriesView is a query range time series whose aggregations at the given positions are the
// given quantiles. Its series have no order; their points are in time order.
func TimeSeriesView(quantiles map[int]float64) View {
	return View{Name: "time_series", normalize: func(answer any) (any, Rule) {
		forEachResult(answer, func(result map[string]any) {
			aggregations, _ := result["aggregations"].([]any)
			for _, aggregation := range aggregations {
				agg, ok := aggregation.(map[string]any)
				if !ok {
					continue
				}
				series, _ := agg["series"].([]any)
				keyed := Keyed{}
				for _, s := range series {
					if m, ok := s.(map[string]any); ok {
						keyed[canonical(m["labels"])] = s
					}
				}
				agg["series"] = keyed
			}
		})
		return answer, Rule{Excluded: isMeta, Quantile: func(path Path) bool {
			position, ok := afterSegment(path, "aggregations")
			_, quantile := quantiles[position]
			return ok && quantile && path.Last() == "value"
		}}
	}}
}

// ScalarView is a query range scalar, its rows in the order asked for when ordered and keyed by
// their group columns otherwise, its aggregations at the given positions the given quantiles.
func ScalarView(ordered bool, quantiles map[int]float64) View {
	return View{Name: "scalar", normalize: func(answer any) (any, Rule) {
		quantileColumns := map[int]bool{}
		forEachResult(answer, func(result map[string]any) {
			columns, _ := result["columns"].([]any)
			var groups []int
			for i, column := range columns {
				c, _ := column.(map[string]any)
				switch c["columnType"] {
				case "group":
					groups = append(groups, i)
				case "aggregation":
					if index, ok := c["aggregationIndex"].(float64); ok {
						if _, quantile := quantiles[int(index)]; quantile {
							quantileColumns[i] = true
						}
					}
				}
			}
			if ordered {
				return
			}
			rows, _ := result["data"].([]any)
			keyed := Keyed{}
			for _, row := range rows {
				r, _ := row.([]any)
				var key []string
				for _, i := range groups {
					if i < len(r) {
						key = append(key, keyOf(r[i]))
					}
				}
				keyed[strings.Join(key, ",")] = row
			}
			result["data"] = keyed
		})
		return answer, Rule{Excluded: isMeta, Quantile: func(path Path) bool {
			column, ok := path[len(path)-1].(int)
			return ok && quantileColumns[column]
		}}
	}}
}

func normalizeServices(answer any) (any, Rule) {
	envelope, _ := answer.(map[string]any)
	items, _ := envelope["data"].([]any)
	keyed := Keyed{}
	for _, item := range items {
		service, _ := item.(map[string]any)
		name, _ := service["serviceName"].(string)
		if warning, ok := service["dataWarning"].(map[string]any); ok {
			ops, _ := warning["topLevelOps"].([]any)
			warning["topLevelOps"] = topLevelOps(ops)
		}
		keyed[name] = service
	}
	envelope["data"] = keyed
	return envelope, Rule{Quantile: func(path Path) bool { return path.Last() == "p99" }}
}

// topLevelOps is the contract of a service's top-level operations: the sentinel first, then the
// operations latest first by clocks the stores do not share, so a multiset.
func topLevelOps(ops []any) map[string]any {
	first := any(nil)
	if len(ops) > 0 {
		first = ops[0]
	}
	operations := Keyed{}
	for _, op := range ops[min(1, len(ops)):] {
		name, _ := op.(string)
		count, _ := operations[name].(float64)
		operations[name] = count + 1
	}
	return map[string]any{"sentinel": first, "operations": operations}
}

// normalizeOperations keeps the operations' order, slowest p99 first, except between items whose
// p99 tie, which are a block in no order.
func normalizeOperations(answer any) (any, Rule) {
	envelope, _ := answer.(map[string]any)
	items, _ := envelope["data"].([]any)
	keyed := Keyed{}
	var order []any
	var block []string
	var blockP99 any
	flush := func() {
		slices.Sort(block)
		for _, name := range block {
			order = append(order, name)
		}
		block = nil
	}
	for _, item := range items {
		op, _ := item.(map[string]any)
		name, _ := op["name"].(string)
		keyed[name] = op
		if len(block) > 0 && !equalValues(op["p99"], blockP99) {
			flush()
		}
		block, blockP99 = append(block, name), op["p99"]
	}
	flush()
	if order == nil {
		order = []any{}
	}
	return map[string]any{"order": order, "items": keyed}, Rule{Quantile: func(path Path) bool {
		switch path.Last() {
		case "p50", "p95", "p99":
			return true
		}
		return false
	}}
}

func identity(answer any) (any, Rule) { return answer, Rule{} }

// keyOf is a value as a Keyed key: a string as it is, anything else in its canonical form.
func keyOf(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return canonical(v)
}

func isMeta(path Path) bool { return len(path) == 1 && path[0] == "meta" }

// forEachResult calls f on every result of a query range answer.
func forEachResult(answer any, f func(map[string]any)) {
	envelope, _ := answer.(map[string]any)
	data, _ := envelope["data"].(map[string]any)
	results, _ := data["results"].([]any)
	for _, result := range results {
		if r, ok := result.(map[string]any); ok {
			f(r)
		}
	}
}

// afterSegment is the list position that follows the field name in path.
func afterSegment(path Path, name string) (int, bool) {
	for i := 0; i+1 < len(path); i++ {
		if path[i] == name {
			position, ok := path[i+1].(int)
			return position, ok
		}
	}
	return 0, false
}
