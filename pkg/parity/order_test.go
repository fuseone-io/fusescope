package parity

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// distributions are the exact p99 distributions of three operations: a's and b's overlap around
// 300, c's sits far below.
var distributions = map[string][]float64{
	"a": append(repeat(200, 98), 300, 320),
	"b": append(repeat(200, 98), 295, 310),
	"c": repeat(10, 100),
	"d": repeat(1000, 100),
	"e": append(repeat(200, 98), 295, 310),
}

func repeat(v float64, n int) []float64 {
	out := make([]float64, n)
	for i := range out {
		out[i] = v
	}
	return out
}

func exact(calls *[]string) func(string, float64) (QuantileEvidence, bool) {
	return func(operation string, v float64) (QuantileEvidence, bool) {
		if calls != nil {
			*calls = append(*calls, operation)
		}
		values, ok := distributions[operation]
		if !ok {
			return QuantileEvidence{}, false
		}
		return evidence(values, 0.99, v), true
	}
}

func operations(items string) any {
	var v any
	_ = json.Unmarshal([]byte(`{"data":[`+items+`]}`), &v)
	return v
}

func TestASwapBetweenOperationsWithinTheQuantileRuleIsAnApproximation(t *testing.T) {
	engine := operations(`{"name":"b","p99":309},{"name":"a","p99":301},{"name":"c","p99":10}`)
	clickhouse := operations(`{"name":"a","p99":319},{"name":"b","p99":300},{"name":"c","p99":10}`)
	var calls []string
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, JudgeOperationOrder(engine, clickhouse, exact(&calls)))
	assert.ElementsMatch(t, []string{"a", "b"}, calls, "only the operations that moved need evidence")
}

func TestASwapTheEvidenceRejectsBlocks(t *testing.T) {
	engine := operations(`{"name":"c","p99":400},{"name":"a","p99":301},{"name":"b","p99":300}`)
	clickhouse := operations(`{"name":"a","p99":319},{"name":"b","p99":300},{"name":"c","p99":10}`)
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, JudgeOperationOrder(engine, clickhouse, exact(nil)), "c's p99 is nowhere near 400")
}

func TestAnEngineOrderNotByItsOwnValuesBlocks(t *testing.T) {
	engine := operations(`{"name":"b","p99":301},{"name":"a","p99":309},{"name":"c","p99":10}`)
	clickhouse := operations(`{"name":"a","p99":319},{"name":"b","p99":300},{"name":"c","p99":10}`)
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, JudgeOperationOrder(engine, clickhouse, exact(nil)), "slowest first is the engine's own contract too")
}

func TestASwapWithoutEvidenceIsInconclusive(t *testing.T) {
	engine := operations(`{"name":"b","p99":309},{"name":"x","p99":301}`)
	clickhouse := operations(`{"name":"x","p99":319},{"name":"b","p99":300}`)
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Inconclusive}, JudgeOperationOrder(engine, clickhouse, exact(nil)))
}

func TestTheOrderOfDifferentOperationsIsJudgedOverTheCommonOnes(t *testing.T) {
	engine := operations(`{"name":"d","p99":1000},{"name":"a","p99":301}`)
	clickhouse := operations(`{"name":"d","p99":1000},{"name":"b","p99":300}`)
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, JudgeOperationOrder(engine, clickhouse, exact(nil)), "the rows that differ are judged as rows")

	swapped := operations(`{"name":"b","p99":309},{"name":"x","p99":305},{"name":"a","p99":301}`)
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, JudgeOperationOrder(swapped, operations(`{"name":"a","p99":319},{"name":"b","p99":300},{"name":"y","p99":1}`), exact(nil)), "a and b swapped within the rule")

	malformed := operations(`{"name":"b","p99":"slow"},{"name":"a","p99":301}`)
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, JudgeOperationOrder(malformed, operations(`{"name":"a","p99":319},{"name":"b","p99":300}`), exact(nil)))
}

func TestACutAtTheLimitBetweenIndistinguishableOperationsIsAnApproximation(t *testing.T) {
	clickhouse := operations(`{"name":"d","p99":1000},{"name":"b","p99":300}`)
	within := operations(`{"name":"d","p99":1000},{"name":"a","p99":301}`)
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, JudgeOperationCut(within, clickhouse, 2, exact(nil)), "301 is a's p99 and could be b's")

	tellsApart := operations(`{"name":"d","p99":1000},{"name":"a","p99":315}`)
	assert.Equal(t, Verdict{Category: CategoryRows, Disposition: Blocking}, JudgeOperationCut(tellsApart, clickhouse, 2, exact(nil)), "315 is a's, not b's")

	unknown := operations(`{"name":"d","p99":1000},{"name":"x","p99":301}`)
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Inconclusive}, JudgeOperationCut(unknown, clickhouse, 2, exact(nil)))
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Inconclusive}, JudgeOperationCut(within, clickhouse, 2, nil))
}

func TestACutIsJudgedOnlyBetweenFullListsOfUniqueOperations(t *testing.T) {
	clickhouse := operations(`{"name":"d","p99":1000},{"name":"b","p99":300}`)
	within := operations(`{"name":"d","p99":1000},{"name":"a","p99":301}`)
	rows := Verdict{Category: CategoryRows, Disposition: Blocking}
	assert.Equal(t, rows, JudgeOperationCut(within, clickhouse, 3, exact(nil)), "lists under the limit were not cut")
	assert.Equal(t, rows, JudgeOperationCut(within, clickhouse, 0, exact(nil)))
	assert.Equal(t, rows, JudgeOperationCut(operations(`{"name":"a","p99":301},{"name":"a","p99":301}`), operations(`{"name":"b","p99":300},{"name":"e","p99":300}`), 2, exact(nil)), "a repeated operation, which would otherwise pair")
	assert.Equal(t, rows, JudgeOperationCut(operations(`{"name":"a","p99":301},{"name":"d","p99":1000}`), clickhouse, 2, exact(nil)), "the engine out of its own order")
	assert.Equal(t, rows, JudgeOperationCut(clickhouse, clickhouse, 2, exact(nil)), "nothing was cut")
	rejected := operations(`{"name":"c","p99":400},{"name":"a","p99":301}`)
	assert.Equal(t, rows, JudgeOperationCut(rejected, operations(`{"name":"x","p99":1000},{"name":"b","p99":300}`), 2, exact(nil)), "a rejection blocks even beside missing evidence")
}

func TestClassifyJudgesACutThroughItsContext(t *testing.T) {
	d := Difference{Path: p("items", Dynamic("a")), Kind: KindRows}
	cut := Verdict{Category: CategoryApproximation, Disposition: Accepted}
	assert.Equal(t, cut, Classify(d, Context{OperationCut: func() Verdict { return cut }}))
	assert.Equal(t, Verdict{Category: CategoryRows, Disposition: Blocking}, Classify(d, Context{}))
	elsewhere := Difference{Path: p("data", Dynamic("a")), Kind: KindRows}
	assert.Equal(t, Verdict{Category: CategoryRows, Disposition: Blocking}, Classify(elsewhere, Context{OperationCut: func() Verdict { return cut }}))
}

func TestClassifyJudgesAnOperationOrderThroughItsContext(t *testing.T) {
	engine := operations(`{"name":"b","p99":309},{"name":"a","p99":301}`)
	clickhouse := operations(`{"name":"a","p99":319},{"name":"b","p99":300}`)
	ne, rule := Operations.Normalize(engine)
	nc, _ := Operations.Normalize(clickhouse)
	var order *Difference
	for _, d := range Compare(ne, nc, rule) {
		if d.Kind == KindOrder {
			order = &d
		}
	}
	require.NotNil(t, order)
	ctx := Context{OperationOrder: func() Verdict { return JudgeOperationOrder(engine, clickhouse, exact(nil)) }}
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, Classify(*order, ctx))
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, Classify(*order, Context{}), "without the judgement an order difference blocks")
	other := Difference{Path: p("data", "results", 0, "rows"), Kind: KindOrder}
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, Classify(other, ctx), "only the operations' order is judged by quantile")
}

func TestASwapWithNoEvidenceFunctionIsInconclusive(t *testing.T) {
	engine := operations(`{"name":"b","p99":309},{"name":"a","p99":301}`)
	clickhouse := operations(`{"name":"a","p99":319},{"name":"b","p99":300}`)
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Inconclusive}, JudgeOperationOrder(engine, clickhouse, nil))
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, JudgeOperationOrder(operations(`{"name":"b","p99":301},{"name":"a","p99":309}`), clickhouse, nil), "an engine out of its own order still blocks")
}

func TestKnownCausesComeBeforeTheCut(t *testing.T) {
	cut := func() Verdict { return Verdict{Category: CategoryApproximation, Disposition: Accepted} }
	onlyClickHouse := Difference{Path: p("items", Dynamic("x.handle")), Kind: KindRows, ClickHouse: []any{map[string]any{"name": "x.handle"}}}
	boundary := func(service, operation string) Boundary {
		if service == "back" && operation == "x.handle" {
			return BoundaryConfirmed
		}
		return BoundaryDenied
	}
	ctx := Context{Service: "back", ServiceBoundary: boundary, OperationCut: cut}
	assert.Equal(t, Verdict{Category: CategoryServiceBoundary, Disposition: Blocking}, Classify(onlyClickHouse, ctx), "a confirmed boundary is never a cut")
	assert.Equal(t, Verdict{Category: CategoryAbsentKey, Disposition: Blocking}, Classify(onlyClickHouse, Context{AbsentKeyCase: true, OperationCut: cut}))

	onlyEngine := Difference{Path: p("items", Dynamic("x.handle")), Kind: KindRows, Engine: []any{map[string]any{"name": "x.handle"}}}
	assert.Equal(t, Verdict{Category: CategoryServiceBoundary, Disposition: Accepted}, Classify(onlyEngine, ctx), "an engine row at a confirmed boundary, before the cut")
	engineOther := Difference{Path: p("items", Dynamic("other")), Kind: KindRows, Engine: []any{map[string]any{"name": "other"}}}
	assert.Equal(t, cut(), Classify(engineOther, ctx), "an engine row at no boundary: the cut judges it")
	unconfirmed := Difference{Path: p("items", Dynamic("other")), Kind: KindRows, ClickHouse: []any{}}
	assert.Equal(t, cut(), Classify(unconfirmed, ctx))
}
