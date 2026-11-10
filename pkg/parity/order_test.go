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

func TestAnOrderOverDifferentOperationsIsNotJudgedHere(t *testing.T) {
	engine := operations(`{"name":"b","p99":309},{"name":"a","p99":301}`)
	clickhouse := operations(`{"name":"a","p99":319},{"name":"c","p99":300}`)
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, JudgeOperationOrder(engine, clickhouse, exact(nil)), "different rows are reported as rows; their order proves nothing")

	malformed := operations(`{"name":"b","p99":"slow"},{"name":"a","p99":301}`)
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, JudgeOperationOrder(malformed, operations(`{"name":"a","p99":319},{"name":"b","p99":300}`), exact(nil)))
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
