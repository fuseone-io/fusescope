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

// JudgeOperationOrder judges a pair of top or entry point operations whose order differs. Both
// stores order by an estimated p99, so two operations whose estimates are close may change places
// legitimately. The swap is an accepted approximation when the engine orders by its own p99 and the
// evidence accepts the engine's p99 of every operation that moved; it is inconclusive when evidence
// is missing; any other difference in order blocks.
func JudgeOperationOrder(engine, clickhouse any, evidence func(operation string, p99 float64) (QuantileEvidence, bool)) Verdict {
	blocking := Verdict{Category: CategoryOrder, Disposition: Blocking}
	e, ok := operationRows(engine)
	c, cok := operationRows(clickhouse)
	if !ok || !cok || !sameOperations(e, c) {
		return blocking
	}
	if !slices.IsSortedFunc(e, func(a, b operationRow) int { return cmp.Compare(b.p99, a.p99) }) {
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
