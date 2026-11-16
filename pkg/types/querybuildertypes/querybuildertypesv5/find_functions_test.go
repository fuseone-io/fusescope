package querybuildertypesv5

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFindFunctions(t *testing.T) {
	anomaly := Function{Name: FunctionNameAnomaly}
	ewma := Function{Name: FunctionNameEWMA3}
	req := QueryRangeRequest{CompositeQuery: CompositeQuery{Queries: []QueryEnvelope{
		{Type: QueryTypeBuilder, Spec: QueryBuilderQuery[MetricAggregation]{Name: "A", Functions: []Function{ewma, anomaly}}},
		{Type: QueryTypeBuilder, Spec: QueryBuilderQuery[LogAggregation]{Name: "B", Functions: []Function{anomaly}}},
		{Type: QueryTypeBuilder, Spec: QueryBuilderQuery[TraceAggregation]{Name: "C", Functions: []Function{anomaly, anomaly}}},
		{Type: QueryTypeFormula, Spec: QueryBuilderFormula{Name: "F", Functions: []Function{anomaly}}},
		{Type: QueryTypeJoin, Spec: QueryBuilderJoin{Name: "J", Functions: []Function{anomaly}}},
		{Type: QueryTypeTraceOperator, Spec: QueryBuilderTraceOperator{Name: "T", Functions: []Function{anomaly}}},
		{Type: QueryTypePromQL, Spec: PromQuery{Name: "P", Query: "anomaly(up)"}},
	}}}

	assert.Equal(t, []FunctionOccurrence{
		{QueryIndex: 0, QueryName: "A", FunctionIndex: 1},
		{QueryIndex: 1, QueryName: "B", FunctionIndex: 0},
		{QueryIndex: 2, QueryName: "C", FunctionIndex: 0},
		{QueryIndex: 2, QueryName: "C", FunctionIndex: 1},
		{QueryIndex: 3, QueryName: "F", FunctionIndex: 0},
		{QueryIndex: 4, QueryName: "J", FunctionIndex: 0},
		{QueryIndex: 5, QueryName: "T", FunctionIndex: 0},
	}, req.FindFunctions(FunctionNameAnomaly))
	assert.Empty(t, req.FindFunctions(FunctionNameTimeShift))
}

func TestQueryEnvelopeCopy(t *testing.T) {
	envelopes := func() []QueryEnvelope {
		return []QueryEnvelope{
			{Type: QueryTypeBuilder, Spec: QueryBuilderQuery[MetricAggregation]{Name: "A", Aggregations: []MetricAggregation{{MetricName: "m"}}}},
			{Type: QueryTypeBuilder, Spec: QueryBuilderQuery[LogAggregation]{Name: "B", Aggregations: []LogAggregation{{Expression: "count()"}}}},
			{Type: QueryTypeBuilder, Spec: QueryBuilderQuery[TraceAggregation]{Name: "C", Aggregations: []TraceAggregation{{Expression: "count()"}}}},
			{Type: QueryTypeFormula, Spec: QueryBuilderFormula{Name: "F", Functions: []Function{{Name: FunctionNameEWMA3}}}},
			{Type: QueryTypeJoin, Spec: QueryBuilderJoin{Name: "J", Functions: []Function{{Name: FunctionNameEWMA3}}}},
			{Type: QueryTypeTraceOperator, Spec: QueryBuilderTraceOperator{Name: "T", Functions: []Function{{Name: FunctionNameEWMA3}}}},
			{Type: QueryTypePromQL, Spec: PromQuery{Name: "P", Query: "up"}},
			{Type: QueryTypeClickHouseSQL, Spec: ClickHouseQuery{Name: "S", Query: "SELECT 1"}},
		}
	}
	originals, want := envelopes(), envelopes()
	for i, envelope := range originals {
		copied := envelope.Copy()
		assert.Equal(t, want[i], copied)
		switch spec := copied.Spec.(type) {
		case QueryBuilderQuery[MetricAggregation]:
			spec.Aggregations[0].MetricName = "changed"
		case QueryBuilderQuery[LogAggregation]:
			spec.Aggregations[0].Expression = "changed"
		case QueryBuilderQuery[TraceAggregation]:
			spec.Aggregations[0].Expression = "changed"
		case QueryBuilderFormula:
			spec.Functions[0].Name = FunctionNameAnomaly
		case QueryBuilderJoin:
			spec.Functions[0].Name = FunctionNameAnomaly
		case QueryBuilderTraceOperator:
			spec.Functions[0].Name = FunctionNameAnomaly
		}
		assert.Equal(t, want[i], originals[i], "the copy of %s shares state with the original", envelope.Type.StringValue())
	}
}
