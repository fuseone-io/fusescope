package parity

import (
	"cmp"
	"maps"
	"slices"
)

// operationQuantile is the quantile top and entry point operations are ordered by.
const operationQuantile = 0.99

type operationRow struct {
	name string
	p99  float64
}

// JudgeOperationOrder judges a pair of top or entry point operations whose order differs, over the
// operations both hold: those on one side only are rows, judged apart. Both stores order by an
// estimated p99, so two operations whose estimates are close may change places legitimately. The
// swap is an accepted approximation when the engine orders by its own p99 and the evidence accepts
// the engine's p99 of every operation that moved; it is inconclusive when evidence is missing; any
// other difference in order blocks.
func JudgeOperationOrder(engine, clickhouse any, evidence func(operation string, p99 float64) (QuantileEvidence, bool)) Verdict {
	blocking := Verdict{Category: CategoryOrder, Disposition: Blocking}
	e, ok := operationRows(engine)
	c, cok := operationRows(clickhouse)
	if !ok || !cok || !byOwnP99(e) {
		return blocking
	}
	e, c = common(e, c), common(c, e)
	if !sameOperations(e, c) {
		return blocking
	}
	inconclusive := false
	for i, row := range e {
		if row.name == c[i].name {
			continue
		}
		if evidence == nil {
			inconclusive = true
			continue
		}
		ev, ok := evidence(row.name, row.p99)
		if !ok {
			inconclusive = true
			continue
		}
		switch JudgeQuantile(operationQuantile, row.p99, ev).Disposition {
		case Accepted:
		case Inconclusive:
			inconclusive = true
		default:
			return blocking
		}
	}
	if inconclusive {
		return Verdict{Category: CategoryApproximation, Disposition: Inconclusive}
	}
	return Verdict{Category: CategoryApproximation, Disposition: Accepted}
}

func operationRows(answer any) ([]operationRow, bool) {
	envelope, _ := answer.(map[string]any)
	items, ok := envelope["data"].([]any)
	if !ok {
		return nil, false
	}
	rows := make([]operationRow, 0, len(items))
	for _, item := range items {
		op, _ := item.(map[string]any)
		name, nameOK := op["name"].(string)
		p99, p99OK := op["p99"].(float64)
		if !nameOK || !p99OK {
			return nil, false
		}
		rows = append(rows, operationRow{name: name, p99: p99})
	}
	return rows, true
}

func sameOperations(e, c []operationRow) bool {
	count := func(rows []operationRow) map[string]int {
		out := map[string]int{}
		for _, r := range rows {
			out[r.name]++
		}
		return out
	}
	return len(e) == len(c) && maps.Equal(count(e), count(c))
}

// JudgeOperationCut judges the operations present on one side only of two lists cut at limit: with
// estimates that close, the operation at the cut may differ. Both lists must hold exactly limit
// unique operations and the engine's be in its own p99 order; the operations on one side only are
// paired in their order, and the cut is an accepted approximation when, for every pair (a, b), the
// evidence accepts the engine's p99 of a against both a's and b's distribution, so the engine
// cannot tell them apart. A rejection keeps the rows blocking; missing evidence is inconclusive.
func JudgeOperationCut(engine, clickhouse any, limit int, evidence func(operation string, p99 float64) (QuantileEvidence, bool)) Verdict {
	rows := Verdict{Category: CategoryRows, Disposition: Blocking}
	e, ok := operationRows(engine)
	c, cok := operationRows(clickhouse)
	if !ok || !cok || limit <= 0 || len(e) != limit || len(c) != limit || !unique(e) || !unique(c) || !byOwnP99(e) {
		return rows
	}
	onlyEngine, onlyClickHouse := exclusive(e, c), exclusive(c, e)
	if len(onlyEngine) == 0 || len(onlyEngine) != len(onlyClickHouse) {
		return rows
	}
	inconclusive := false
	for i, a := range onlyEngine {
		for _, name := range []string{a.name, onlyClickHouse[i].name} {
			if evidence == nil {
				inconclusive = true
				continue
			}
			ev, ok := evidence(name, a.p99)
			if !ok {
				inconclusive = true
				continue
			}
			switch JudgeQuantile(operationQuantile, a.p99, ev).Disposition {
			case Accepted:
			case Inconclusive:
				inconclusive = true
			default:
				return rows
			}
		}
	}
	if inconclusive {
		return Verdict{Category: CategoryApproximation, Disposition: Inconclusive}
	}
	return Verdict{Category: CategoryApproximation, Disposition: Accepted}
}

func byOwnP99(rows []operationRow) bool {
	return slices.IsSortedFunc(rows, func(a, b operationRow) int { return cmp.Compare(b.p99, a.p99) })
}

func operationNames(rows []operationRow) map[string]bool {
	out := make(map[string]bool, len(rows))
	for _, r := range rows {
		out[r.name] = true
	}
	return out
}

// common is rows whose operation other holds too, in rows' order.
func common(rows, other []operationRow) []operationRow {
	in := operationNames(other)
	return slices.DeleteFunc(slices.Clone(rows), func(r operationRow) bool { return !in[r.name] })
}

// exclusive is rows whose operation other does not hold, in rows' order.
func exclusive(rows, other []operationRow) []operationRow {
	in := operationNames(other)
	return slices.DeleteFunc(slices.Clone(rows), func(r operationRow) bool { return in[r.name] })
}

func unique(rows []operationRow) bool { return len(operationNames(rows)) == len(rows) }
