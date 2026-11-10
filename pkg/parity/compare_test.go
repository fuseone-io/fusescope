package parity

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func p(segments ...any) Path { return Path(segments) }

func kinds(diffs []Difference) map[string]Kind {
	out := map[string]Kind{}
	for _, d := range diffs {
		out[d.Path.String()] = d.Kind
	}
	return out
}

func TestEqualAnswersHaveNoDifference(t *testing.T) {
	answer := map[string]any{"spans": []any{map[string]any{"name": "a", "n": float64(1)}}, "meta": map[string]any{"rowsScanned": float64(9)}}
	assert.Empty(t, Compare(answer, answer, Rule{}))
}

func TestAFieldDifferenceNamesItsPath(t *testing.T) {
	engine := map[string]any{"summary": map[string]any{"rootServiceName": "front", "totalSpansCount": float64(3)}}
	clickhouse := map[string]any{"summary": map[string]any{"rootServiceName": "front", "totalSpansCount": float64(4)}}
	diffs := Compare(engine, clickhouse, Rule{})
	assert.Equal(t, map[string]Kind{"summary.totalSpansCount": KindField}, kinds(diffs))
	assert.Equal(t, float64(3), diffs[0].Engine)
	assert.Equal(t, float64(4), diffs[0].ClickHouse)
}

func TestNullAndTheEmptyStringDiffer(t *testing.T) {
	diffs := Compare(map[string]any{"http_route": nil}, map[string]any{"http_route": ""}, Rule{})
	assert.Equal(t, map[string]Kind{"http_route": KindField}, kinds(diffs), "an absent promoted key is not normalized")
}

func TestAKeyOnOneSideIsARowDifference(t *testing.T) {
	diffs := Compare(map[string]any{"a": float64(1)}, map[string]any{"a": float64(1), "b": float64(2)}, Rule{})
	assert.Equal(t, map[string]Kind{"b": KindRows}, kinds(diffs))
}

func TestListsOfDifferentLengthsAreARowDifference(t *testing.T) {
	diffs := Compare(map[string]any{"rows": []any{"a"}}, map[string]any{"rows": []any{"a", "b"}}, Rule{})
	assert.Equal(t, map[string]Kind{"rows": KindRows}, kinds(diffs))
}

func TestTheSameItemsInAnotherOrderAreAnOrderDifference(t *testing.T) {
	diffs := Compare(map[string]any{"rows": []any{"b", "a"}}, map[string]any{"rows": []any{"a", "b"}}, Rule{})
	assert.Equal(t, map[string]Kind{"rows": KindOrder}, kinds(diffs), "every list left after a view's normalization has a contractual order")
}

func TestDifferentItemsInAListAreFieldDifferences(t *testing.T) {
	engine := []any{map[string]any{"name": "a", "p": float64(1)}, map[string]any{"name": "b", "p": float64(2)}}
	clickhouse := []any{map[string]any{"name": "a", "p": float64(1)}, map[string]any{"name": "b", "p": float64(3)}}
	assert.Equal(t, map[string]Kind{"[1].p": KindField}, kinds(Compare(engine, clickhouse, Rule{})))
}

func TestAQuantilePathIsLeftForTheQuantileJudgement(t *testing.T) {
	rule := Rule{Quantile: func(path Path) bool { return path.Last() == "p99" }}
	diffs := Compare(map[string]any{"p99": float64(800), "avg": float64(1)}, map[string]any{"p99": float64(664), "avg": float64(1)}, rule)
	assert.Equal(t, map[string]Kind{"p99": KindQuantile}, kinds(diffs))
}

func TestAnExcludedPathIsNotCompared(t *testing.T) {
	rule := Rule{Excluded: func(path Path) bool { return path.String() == "meta" }}
	assert.Empty(t, Compare(map[string]any{"meta": float64(0)}, map[string]any{"meta": float64(9)}, rule))
}

func TestNumbersOfTheSameValueAreEqualWhateverTheirType(t *testing.T) {
	assert.Empty(t, Compare(map[string]any{"n": int64(5)}, map[string]any{"n": uint64(5)}, Rule{}), "the stores' integer types differ; the value is the contract")
	assert.Equal(t, map[string]Kind{"n": KindField}, kinds(Compare(map[string]any{"n": int64(5)}, map[string]any{"n": "5"}, Rule{})))
}

func TestADynamicSegmentKeepsItsValueForTheFingerprint(t *testing.T) {
	path := p("services", Dynamic("eng-cart"), "numCalls")
	assert.Equal(t, "services[eng-cart].numCalls", path.String(), "in memory only; a report writes it through the fingerprinter")
	assert.Equal(t, "numCalls", path.Last())
}

func TestAnExcludedPathOnOneSideOnlyIsNotARowDifference(t *testing.T) {
	rule := Rule{Excluded: func(path Path) bool { return path.String() == "meta" }}
	assert.Empty(t, Compare(map[string]any{"meta": float64(0)}, map[string]any{}, rule), "an engine answer may carry fields outside the contract")
}
