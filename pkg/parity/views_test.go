package parity

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func decode(t *testing.T, raw string) any {
	var v any
	require.NoError(t, json.Unmarshal([]byte(raw), &v))
	return v
}

func diffOf(t *testing.T, view View, engine, clickhouse string) map[string]Kind {
	e, c := decode(t, engine), decode(t, clickhouse)
	ne, rule := view.Normalize(e)
	nc, _ := view.Normalize(c)
	return kinds(Compare(ne, nc, rule))
}

func TestTheMetaOfAQueryRangeAnswerIsOutsideTheContract(t *testing.T) {
	engine := `{"type":"raw","meta":{"rowsScanned":0},"data":{"results":[{"queryName":"A","rows":[{"data":{"name":"a"}}]}]}}`
	clickhouse := `{"type":"raw","meta":{"rowsScanned":9},"data":{"results":[{"queryName":"A","rows":[{"data":{"name":"a"}}]}]}}`
	assert.Empty(t, diffOf(t, SpanList, engine, clickhouse))
}

func TestASpanListKeepsItsOrder(t *testing.T) {
	engine := `{"type":"raw","data":{"results":[{"rows":[{"data":{"span_id":"2"}},{"data":{"span_id":"1"}}]}]}}`
	clickhouse := `{"type":"raw","data":{"results":[{"rows":[{"data":{"span_id":"1"}},{"data":{"span_id":"2"}}]}]}}`
	assert.Equal(t, map[string]Kind{"data.results[0].rows": KindOrder}, diffOf(t, SpanList, engine, clickhouse))
}

func TestTheSeriesOfATimeSeriesHaveNoOrderButTheirPointsDo(t *testing.T) {
	series := func(service string, points string) string {
		return `{"labels":[{"key":{"name":"service.name"},"value":"` + service + `"}],"values":[` + points + `]}`
	}
	engine := `{"type":"time_series","data":{"results":[{"aggregations":[{"index":0,"series":[` + series("b", `{"timestamp":1,"value":2}`) + `,` + series("a", `{"timestamp":1,"value":1}`) + `]}]}]}}`
	clickhouse := `{"type":"time_series","data":{"results":[{"aggregations":[{"index":0,"series":[` + series("a", `{"timestamp":1,"value":1}`) + `,` + series("b", `{"timestamp":1,"value":2}`) + `]}]}]}}`
	assert.Empty(t, diffOf(t, TimeSeries, engine, clickhouse), "series in another order are the same answer")

	reordered := `{"type":"time_series","data":{"results":[{"aggregations":[{"index":0,"series":[` + series("a", `{"timestamp":2,"value":1},{"timestamp":1,"value":1}`) + `]}]}]}}`
	ordered := `{"type":"time_series","data":{"results":[{"aggregations":[{"index":0,"series":[` + series("a", `{"timestamp":1,"value":1},{"timestamp":2,"value":1}`) + `]}]}]}}`
	got := diffOf(t, TimeSeries, reordered, ordered)
	require.Len(t, got, 1)
	for path, kind := range got {
		assert.Equal(t, KindOrder, kind, path)
	}
}

func TestTheRowsOfAScalarWithoutAnOrderAreKeyedByTheirGroup(t *testing.T) {
	columns := `"columns":[{"name":"service.name","columnType":"group"},{"name":"__result_0","columnType":"aggregation","aggregationIndex":0}]`
	engine := `{"type":"scalar","data":{"results":[{` + columns + `,"data":[["b",2],["a",1]]}]}}`
	clickhouse := `{"type":"scalar","data":{"results":[{` + columns + `,"data":[["a",1],["b",3]]}]}}`
	got := diffOf(t, ScalarView(false, nil), engine, clickhouse)
	assert.Len(t, got, 1, "only b's value differs, whatever the row order")
	for path, kind := range got {
		assert.Equal(t, KindField, kind)
		assert.Contains(t, path, "[b]")
	}
	ordered := diffOf(t, ScalarView(true, nil), engine, clickhouse)
	assert.Contains(t, ordered, "data.results[0].data[0][0]", "with an orderBy the rows keep their order and compare by position")
}

func TestAScalarQuantileColumnIsLeftForTheJudgement(t *testing.T) {
	columns := `"columns":[{"name":"service.name","columnType":"group"},{"name":"__result_0","columnType":"aggregation","aggregationIndex":0}]`
	engine := `{"type":"scalar","data":{"results":[{` + columns + `,"data":[["a",800]]}]}}`
	clickhouse := `{"type":"scalar","data":{"results":[{` + columns + `,"data":[["a",664]]}]}}`
	got := diffOf(t, ScalarView(false, map[int]float64{0: 0.99}), engine, clickhouse)
	require.Len(t, got, 1)
	for _, kind := range got {
		assert.Equal(t, KindQuantile, kind)
	}
}

func TestServicesAreKeyedByNameAndTheirTopLevelOperationsByMultiset(t *testing.T) {
	engine := `{"data":[{"serviceName":"b","p99":10,"numCalls":5,"dataWarning":{"topLevelOps":["overflow_operation","y","x"]}},{"serviceName":"a","p99":1,"numCalls":1,"dataWarning":{"topLevelOps":["overflow_operation"]}}]}`
	clickhouse := `{"data":[{"serviceName":"a","p99":1,"numCalls":1,"dataWarning":{"topLevelOps":["overflow_operation"]}},{"serviceName":"b","p99":10,"numCalls":5,"dataWarning":{"topLevelOps":["overflow_operation","x","y"]}}]}`
	assert.Empty(t, diffOf(t, Services, engine, clickhouse), "ties in latest first are not ordered")

	extra := `{"data":[{"serviceName":"b","p99":10,"numCalls":5,"dataWarning":{"topLevelOps":["overflow_operation","x","y","z"]}}]}`
	fewer := `{"data":[{"serviceName":"b","p99":10,"numCalls":5,"dataWarning":{"topLevelOps":["overflow_operation","x","y"]}}]}`
	assert.Equal(t, map[string]Kind{"data[b][0].dataWarning.topLevelOps.operations[z]": KindRows}, diffOf(t, Services, fewer, extra))

	repeated := `{"data":[{"serviceName":"b","p99":10,"numCalls":5,"dataWarning":{"topLevelOps":["overflow_operation","x","x"]}}]}`
	once := `{"data":[{"serviceName":"b","p99":10,"numCalls":5,"dataWarning":{"topLevelOps":["overflow_operation","x"]}}]}`
	assert.Equal(t, map[string]Kind{"data[b][0].dataWarning.topLevelOps.operations[x]": KindField}, diffOf(t, Services, repeated, once), "a multiset, not a set")

	noSentinel := `{"data":[{"serviceName":"b","p99":10,"numCalls":5,"dataWarning":{"topLevelOps":["x","overflow_operation"]}}]}`
	assert.Contains(t, diffOf(t, Services, noSentinel, once), "data[b][0].dataWarning.topLevelOps.sentinel", "the sentinel first is the contract")
}

func TestTopOperationsKeepTheirOrderExceptBetweenTies(t *testing.T) {
	ops := func(items string) string { return `{"data":[` + items + `]}` }
	a, b, c := `{"name":"a","p99":3}`, `{"name":"b","p99":2}`, `{"name":"c","p99":2}`
	assert.Empty(t, diffOf(t, Operations, ops(a+","+c+","+b), ops(a+","+b+","+c)), "b and c tie on p99")
	got := diffOf(t, Operations, ops(b+","+a+","+c), ops(a+","+b+","+c))
	assert.Equal(t, map[string]Kind{"order": KindOrder}, got, "a, the slowest, must come first")
}

func TestASummaryAndAWaterfallCompareFieldByField(t *testing.T) {
	engine := `{"data":{"spans":[{"span_id":"1","name":"a"},{"span_id":"2","name":"b"}],"rootServiceName":"x"}}`
	clickhouse := `{"data":{"spans":[{"span_id":"2","name":"b"},{"span_id":"1","name":"a"}],"rootServiceName":"x"}}`
	assert.Equal(t, map[string]Kind{"data.spans": KindOrder}, diffOf(t, Waterfall, engine, clickhouse), "the pre-order of the tree is the contract")
}

func onlyKinds(t *testing.T, got map[string]Kind) []Kind {
	t.Helper()
	var out []Kind
	for _, kind := range got {
		out = append(out, kind)
	}
	return out
}

func TestADuplicateSeriesIsARowDifference(t *testing.T) {
	series := `{"labels":[{"key":{"name":"service.name"},"value":"a"}],"values":[{"timestamp":1,"value":1}]}`
	twice := `{"type":"time_series","data":{"results":[{"aggregations":[{"index":0,"series":[` + series + `,` + series + `]}]}]}}`
	once := `{"type":"time_series","data":{"results":[{"aggregations":[{"index":0,"series":[` + series + `]}]}]}}`
	assert.Equal(t, []Kind{KindRows}, onlyKinds(t, diffOf(t, TimeSeries, twice, once)))
}

func TestADuplicateScalarRowIsARowDifference(t *testing.T) {
	columns := `"columns":[{"name":"service.name","columnType":"group"},{"name":"__result_0","columnType":"aggregation","aggregationIndex":0}]`
	twice := `{"type":"scalar","data":{"results":[{` + columns + `,"data":[["a",1],["a",1]]}]}}`
	once := `{"type":"scalar","data":{"results":[{` + columns + `,"data":[["a",1]]}]}}`
	assert.Equal(t, []Kind{KindRows}, onlyKinds(t, diffOf(t, ScalarView(false, nil), twice, once)))
}

func TestScalarGroupsWithCommasNeverCollide(t *testing.T) {
	columns := `"columns":[{"name":"x","columnType":"group"},{"name":"y","columnType":"group"},{"name":"__result_0","columnType":"aggregation","aggregationIndex":0}]`
	engine := `{"type":"scalar","data":{"results":[{` + columns + `,"data":[["a,b","c",1]]}]}}`
	clickhouse := `{"type":"scalar","data":{"results":[{` + columns + `,"data":[["a","b,c",1]]}]}}`
	got := diffOf(t, ScalarView(false, nil), engine, clickhouse)
	assert.Len(t, got, 2, "a group on each side")
	for path, kind := range got {
		assert.Equal(t, KindRows, kind, path)
	}
}

func TestADuplicateServiceIsARowDifference(t *testing.T) {
	service := `{"serviceName":"a","p99":1,"numCalls":1,"dataWarning":{"topLevelOps":["overflow_operation"]}}`
	assert.Equal(t, []Kind{KindRows}, onlyKinds(t, diffOf(t, Services, `{"data":[`+service+`,`+service+`]}`, `{"data":[`+service+`]}`)))
}

func TestADuplicateOperationIsARowDifference(t *testing.T) {
	op := `{"name":"a","p99":3}`
	got := diffOf(t, Operations, `{"data":[`+op+`,`+op+`]}`, `{"data":[`+op+`]}`)
	assert.Equal(t, KindRows, got["order"], "the order lists the duplicate")
	assert.Equal(t, KindRows, got["items[a]"], "and so do the items")
}
