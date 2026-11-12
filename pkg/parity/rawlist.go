package parity

import (
	"cmp"
	"slices"
	"time"
)

// SpanListView is a query range raw answer whose rows were asked latest first (timestamp
// descending, then span_id ascending) up to limit. Each result's rows are keyed by their identity,
// trace_id and span_id, so fields are compared between the rows of one span; their sequence is
// kept apart as order, and nextCursor is reduced to whether there is one, since its value follows
// from the last row. A result with a row of no identity stays positional.
//
// Before comparing, a row on one side only is dropped when it is the limit's cut: the other side's
// list is full and the row sorts after that list's last row by the whole order key. The order is
// then compared over the identities both sides hold, rows of equal order keys taken in either
// sequence. When only one side's result has every row's identity, both are compared by position.
// A limit of 0 is the querier's own default, defaultRawLimit.
//
// Both stores answer timestamps in nanoseconds; a store that truncated them could put a row at
// exactly the cut's instant on the wrong side of it.
func SpanListView(limit int) View {
	if limit <= 0 {
		limit = defaultRawLimit
	}
	return View{Name: "span_list", normalize: func(answer any) (any, Rule) {
		forEachResult(answer, normalizeRawResult)
		return answer, Rule{Excluded: isMeta, Reconcile: func(engine, clickhouse any) {
			reconcileRawLists(engine, clickhouse, limit)
		}}
	}}
}

// rawOrder is the field a raw result's sequence of identities is kept under.
const rawOrder = "order"

// defaultRawLimit is the rows the querier reads for a raw list asked without a limit.
const defaultRawLimit = 10_000

func normalizeRawResult(result map[string]any) {
	cursor, _ := result["nextCursor"].(string)
	delete(result, "nextCursor")
	result["cursor"] = []any{}
	if cursor != "" {
		result["cursor"] = []any{"present"}
	}
	rows, _ := result["rows"].([]any)
	order := make([]any, 0, len(rows))
	for _, r := range rows {
		id, ok := rawIdentity(r)
		if !ok {
			return
		}
		order = append(order, id)
	}
	result["rows"] = keyedBy(rows, func(r any) string {
		id, _ := rawIdentity(r)
		return id
	})
	result[rawOrder] = order
}

func rawIdentity(r any) (string, bool) {
	row, _ := r.(map[string]any)
	data, _ := row["data"].(map[string]any)
	trace, _ := data["trace_id"].(string)
	span, _ := data["span_id"].(string)
	if trace == "" || span == "" {
		return "", false
	}
	return trace + "/" + span, true
}

// rawKey is a row's place in latestFirst.
type rawKey struct {
	timestamp time.Time
	span      string
}

// after tells whether a sorts after b in latestFirst.
func (a rawKey) after(b rawKey) bool {
	if !a.timestamp.Equal(b.timestamp) {
		return a.timestamp.Before(b.timestamp)
	}
	return a.span > b.span
}

func (a rawKey) equal(b rawKey) bool {
	return a.timestamp.Equal(b.timestamp) && a.span == b.span
}

func keyOfRow(rows Keyed, id string) (rawKey, bool) {
	occurrences, _ := rows[id].([]any)
	if len(occurrences) == 0 {
		return rawKey{}, false
	}
	row, _ := occurrences[0].(map[string]any)
	data, _ := row["data"].(map[string]any)
	raw, _ := row["timestamp"].(string)
	ts, err := time.Parse(time.RFC3339Nano, raw)
	span, _ := data["span_id"].(string)
	return rawKey{timestamp: ts, span: span}, err == nil && span != ""
}

func reconcileRawLists(engine, clickhouse any, limit int) {
	var e, c []map[string]any
	forEachResult(engine, func(r map[string]any) { e = append(e, r) })
	forEachResult(clickhouse, func(r map[string]any) { c = append(c, r) })
	for i := range min(len(e), len(c)) {
		reconcileRawResults(e[i], c[i], limit)
	}
}

func reconcileRawResults(engine, clickhouse map[string]any, limit int) {
	eRows, eok := engine["rows"].(Keyed)
	cRows, cok := clickhouse["rows"].(Keyed)
	eOrder, _ := engine[rawOrder].([]any)
	cOrder, _ := clickhouse[rawOrder].([]any)
	if eok != cok {
		// One side has a row of no identity: both are compared by position.
		if eok {
			positional(engine, eRows, eOrder)
		} else {
			positional(clickhouse, cRows, cOrder)
		}
		return
	}
	if !eok {
		return
	}
	// Each side's last row, read before either side drops anything.
	eLast, eOK := lastKey(eRows, eOrder, limit)
	cLast, cOK := lastKey(cRows, cOrder, limit)
	if cOK {
		eOrder = dropCut(eRows, eOrder, cRows, cLast)
	}
	if eOK {
		cOrder = dropCut(cRows, cOrder, eRows, eLast)
	}
	engine[rawOrder] = commonOrder(eRows, eOrder, cRows)
	clickhouse[rawOrder] = commonOrder(cRows, cOrder, eRows)
}

// positional puts a keyed result's rows back in their sequence, as a list.
func positional(result map[string]any, rows Keyed, order []any) {
	taken := map[string]int{}
	list := make([]any, 0, len(order))
	for _, v := range order {
		id, _ := v.(string)
		occurrences, _ := rows[id].([]any)
		if taken[id] < len(occurrences) {
			list = append(list, occurrences[taken[id]])
			taken[id]++
		}
	}
	result["rows"] = list
	delete(result, rawOrder)
}

// lastKey is the key of a full list's last row; false when the list is not full or the key does
// not read.
func lastKey(rows Keyed, order []any, limit int) (rawKey, bool) {
	if limit <= 0 || len(order) != limit {
		return rawKey{}, false
	}
	id, _ := order[len(order)-1].(string)
	return keyOfRow(rows, id)
}

// dropCut removes from rows and order the identities other lacks that sort after last, the last
// row of other's full list: other cut them at its limit.
func dropCut(rows Keyed, order []any, otherRows Keyed, last rawKey) []any {
	kept := order[:0:0]
	for _, v := range order {
		id, _ := v.(string)
		if _, shared := otherRows[id]; !shared {
			if key, ok := keyOfRow(rows, id); ok && key.after(last) {
				delete(rows, id)
				continue
			}
		}
		kept = append(kept, v)
	}
	return kept
}

// commonOrder is order over the identities other also holds, each once, with every run of equal
// order keys in identity order: latestFirst leaves those runs unordered.
func commonOrder(rows Keyed, order []any, other Keyed) []any {
	seen := map[string]bool{}
	common := []any{}
	for _, v := range order {
		id, _ := v.(string)
		if _, shared := other[id]; shared && !seen[id] {
			seen[id] = true
			common = append(common, id)
		}
	}
	for start := 0; start < len(common); {
		end := start + 1
		first, ok := keyOfRow(rows, common[start].(string))
		for ok && end < len(common) {
			next, nok := keyOfRow(rows, common[end].(string))
			if !nok || !next.equal(first) {
				break
			}
			end++
		}
		slices.SortFunc(common[start:end], func(a, b any) int { return cmp.Compare(a.(string), b.(string)) })
		start = end
	}
	return common
}
