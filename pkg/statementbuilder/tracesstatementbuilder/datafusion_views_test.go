package tracesstatementbuilder

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes/telemetrytypestest"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/require"
)

// TestEngineViewStatements builds the queries of the trace views the
// engine serves first (D4) in both dialects, in the shape their modules
// send them.
func TestEngineViewStatements(t *testing.T) {
	serviceName := telemetrytypes.TelemetryFieldKey{Name: "service.name", FieldContext: telemetrytypes.FieldContextResource, FieldDataType: telemetrytypes.FieldDataTypeString, Materialized: true}
	spanName := telemetrytypes.TelemetryFieldKey{Name: "name", FieldContext: telemetrytypes.FieldContextSpan, FieldDataType: telemetrytypes.FieldDataTypeString}
	cases := []struct {
		name        string
		requestType qbtypes.RequestType
		query       qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]
	}{
		{
			name:        "services",
			requestType: qbtypes.RequestTypeScalar,
			query: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
				Signal:  telemetrytypes.SignalTraces,
				Filter:  &qbtypes.Filter{Expression: "(deployment.environment = 'prod') AND (isRoot = true OR isEntryPoint = true)"},
				GroupBy: []qbtypes.GroupByKey{{TelemetryFieldKey: serviceName}},
				Aggregations: []qbtypes.TraceAggregation{
					{Expression: "p99(duration_nano)", Alias: "p99"},
					{Expression: "avg(duration_nano)", Alias: "avgDuration"},
					{Expression: "count()", Alias: "numCalls"},
					{Expression: "countIf(status_code = 2)", Alias: "numErrors"},
					{Expression: "countIf(response_status_code >= 400 AND response_status_code < 500)", Alias: "num4XX"},
				},
			},
		},
		{
			name:        "top operations",
			requestType: qbtypes.RequestTypeScalar,
			query: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
				Signal:  telemetrytypes.SignalTraces,
				Filter:  &qbtypes.Filter{Expression: "service.name IN ['frontend']"},
				GroupBy: []qbtypes.GroupByKey{{TelemetryFieldKey: spanName}},
				Aggregations: []qbtypes.TraceAggregation{
					{Expression: "p50(duration_nano)", Alias: "p50"},
					{Expression: "p95(duration_nano)", Alias: "p95"},
					{Expression: "p99(duration_nano)", Alias: "p99"},
					{Expression: "count()", Alias: "numCalls"},
					{Expression: "countIf(status_code = 2)", Alias: "errorCount"},
				},
				Order: []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "p99"}}, Direction: qbtypes.OrderDirectionDesc}},
				Limit: 50,
			},
		},
		{
			name:        "entry point operations",
			requestType: qbtypes.RequestTypeScalar,
			query: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
				Signal:       telemetrytypes.SignalTraces,
				Filter:       &qbtypes.Filter{Expression: "service.name IN ['frontend'] AND isEntryPoint = true"},
				GroupBy:      []qbtypes.GroupByKey{{TelemetryFieldKey: spanName}},
				Aggregations: []qbtypes.TraceAggregation{{Expression: "p99(duration_nano)", Alias: "p99"}, {Expression: "rate()", Alias: "rate"}},
				Limit:        50,
			},
		},
		{
			name:        "latency per service",
			requestType: qbtypes.RequestTypeTimeSeries,
			query: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
				Signal:       telemetrytypes.SignalTraces,
				StepInterval: qbtypes.Step{Duration: 60 * time.Second},
				Filter:       &qbtypes.Filter{Expression: "isRoot = true"},
				GroupBy:      []qbtypes.GroupByKey{{TelemetryFieldKey: serviceName}},
				Aggregations: []qbtypes.TraceAggregation{{Expression: "p99(duration_nano)"}, {Expression: "p50(duration_nano)"}},
				Limit:        10,
			},
		},
		{
			name:        "span list",
			requestType: qbtypes.RequestTypeRaw,
			query: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
				Signal: telemetrytypes.SignalTraces,
				Filter: &qbtypes.Filter{Expression: "service.name = 'frontend' AND http.route = '/cart' AND has_error = true AND trace_id = '5b8efff798038103d269b633813fc60c'"},
				Order:  []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "timestamp", FieldContext: telemetrytypes.FieldContextSpan}}, Direction: qbtypes.OrderDirectionDesc}},
				Limit:  20,
			},
		},
	}

	fl := flaggertest.New(t)
	mockMetadataStore := telemetrytypestest.NewMockMetadataStore()
	mockMetadataStore.KeysMap = tracestelemetryschema.BuildCompleteFieldKeyMap(time.Date(2025, 5, 22, 22, 0, 0, 0, time.UTC))
	storage := tracestelemetryschema.NewStorage()
	clickhouse := NewTraceQueryStatementBuilder(
		instrumentationtest.New().ToProviderSettings(), mockMetadataStore, storage,
		querybuilder.NewAggExprRewriter(instrumentationtest.New().ToProviderSettings(), nil, storage, fl, telemetrytypes.SignalTraces),
		nil, fl, false, 100000,
	)
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := clickhouse.Build(context.Background(), valuer.UUID{}, 1747947419000, 1747983448000, c.requestType, c.query, nil)
			require.NoError(t, err)
			checkDataFusion(t, mockMetadataStore, fl, 1747947419000, 1747983448000, c.requestType, c.query, nil)
		})
	}
}

// TestEngineRefusesWhatItDoesNotServe: the dialect refuses rather than
// approximates.
func TestEngineRefusesWhatItDoesNotServe(t *testing.T) {
	fl := flaggertest.New(t)
	mockMetadataStore := telemetrytypestest.NewMockMetadataStore()
	builder := NewEngineTraceQueryStatementBuilder(instrumentationtest.New().ToProviderSettings(), mockMetadataStore, fl)
	query := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{Signal: telemetrytypes.SignalTraces, Limit: 10}
	_, err := builder.Build(context.Background(), valuer.UUID{}, 1747947419000, 1747983448000, qbtypes.RequestTypeTrace, query, nil)
	require.Error(t, err)
	_, err = builder.BuildTraceScoped(context.Background(), valuer.UUID{}, 1747947419000, 1747983448000, qbtypes.RequestTypeRaw, query, nil, &qbtypes.Statement{Query: "SELECT 1"}, nil)
	require.Error(t, err)
	query.Aggregations = []qbtypes.TraceAggregation{{Expression: "median(duration_nano)"}}
	_, err = builder.Build(context.Background(), valuer.UUID{}, 1747947419000, 1747983448000, qbtypes.RequestTypeScalar, query, nil)
	require.Error(t, err)
}

// TestEngineFilterMatrix renders every filter operator over every kind of
// read the engine storage has: a promoted column, string and numeric maps,
// intrinsic strings, numbers and bools, an id and the nullable parent, the
// scope, and a derived column.
func TestEngineFilterMatrix(t *testing.T) {
	text := []string{
		"%s = 'a'", "%s != 'a'", "%s < 'm'", "%s <= 'm'", "%s > 'm'", "%s >= 'm'",
		"%s LIKE 'a%%'", "%s NOT LIKE 'a%%'", "%s ILIKE 'A%%'", "%s NOT ILIKE 'A%%'",
		"%s CONTAINS 'a'", "%s NOT CONTAINS 'a'", "%s REGEXP '^a'", "%s NOT REGEXP '^a'",
		"%s IN ['a', 'b']", "%s NOT IN ['a', 'b']", "%s EXISTS", "%s NOT EXISTS",
		"%s BETWEEN 'a' AND 'm'", "%s NOT BETWEEN 'a' AND 'm'",
	}
	number := []string{
		"%s = 200", "%s != 200", "%s < 200", "%s <= 200", "%s > 200", "%s >= 200",
		"%s BETWEEN 100 AND 300", "%s NOT BETWEEN 100 AND 300",
		"%s IN [200, 404]", "%s NOT IN [200, 404]", "%s EXISTS", "%s NOT EXISTS",
	}
	boolean := []string{"%s = true", "%s != true", "%s EXISTS", "%s NOT EXISTS"}
	id := []string{
		"%s = '00f067aa0ba902b7'", "%s != '00f067aa0ba902b7'",
		"%s < '00f067aa0ba902b7'", "%s <= '00f067aa0ba902b7'", "%s > '00f067aa0ba902b7'", "%s >= '00f067aa0ba902b7'",
		"%s LIKE '00f0%%'", "%s NOT LIKE '00f0%%'", "%s ILIKE '00F0%%'", "%s NOT ILIKE '00F0%%'",
		"%s CONTAINS 'aa0b'", "%s NOT CONTAINS 'aa0b'", "%s REGEXP '^00f0'", "%s NOT REGEXP '^00f0'",
		"%s IN ['00f067aa0ba902b7', '00f067aa0ba902b8']", "%s NOT IN ['00f067aa0ba902b7', '00f067aa0ba902b8']",
		"%s EXISTS", "%s NOT EXISTS",
		"%s BETWEEN '00f067aa0ba902b7' AND '00f067aa0ba902b8'", "%s NOT BETWEEN '00f067aa0ba902b7' AND '00f067aa0ba902b8'",
	}
	fields := []struct {
		field     string
		operators []string
	}{
		{"service.name", text},
		{"user.id", text},
		{"scope.name", text},
		{"name", text},
		{"cart.items_count", number},
		{"http.status_code", number},
		{"duration_nano", number},
		{"response_status_code", number},
		{"has_error", boolean},
		{"span_id", id},
		{"parent_span_id", id},
		{"isRoot", []string{"%s = true"}},
		{"isEntryPoint", []string{"%s = true"}},
	}
	fl := flaggertest.New(t)
	mockMetadataStore := telemetrytypestest.NewMockMetadataStore()
	mockMetadataStore.KeysMap = tracestelemetryschema.BuildCompleteFieldKeyMap(time.Date(2025, 5, 22, 22, 0, 0, 0, time.UTC))
	clickhouse := clickHouseBuilder(mockMetadataStore, fl)
	for _, f := range fields {
		for _, operator := range f.operators {
			expression := fmt.Sprintf(operator, f.field)
			t.Run(expression, func(t *testing.T) {
				query := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
					Signal:       telemetrytypes.SignalTraces,
					Filter:       &qbtypes.Filter{Expression: expression},
					Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}},
				}
				_, err := clickhouse.Build(context.Background(), valuer.UUID{}, 1747947419000, 1747983448000, qbtypes.RequestTypeScalar, query, nil)
				require.NoError(t, err)
				checkDataFusion(t, mockMetadataStore, fl, 1747947419000, 1747983448000, qbtypes.RequestTypeScalar, query, nil)
			})
		}
	}
}

// TestEngineAggregationMatrix renders every aggregation function, with and
// without its condition.
func TestEngineAggregationMatrix(t *testing.T) {
	expressions := []string{
		"count()", "count(name)", "count_distinct(name)", "count_distinct_if(name, has_error = true)", "countIf(has_error = true)",
		"sum(duration_nano)", "sumIf(duration_nano, has_error = true)", "avg(duration_nano)", "avgIf(duration_nano, has_error = true)",
		"min(duration_nano)", "minIf(duration_nano, has_error = true)", "max(duration_nano)", "maxIf(duration_nano, has_error = true)",
		"p05(duration_nano)", "p10(duration_nano)", "p20(duration_nano)", "p25(duration_nano)", "p50(duration_nano)",
		"p75(duration_nano)", "p90(duration_nano)", "p95(duration_nano)", "p99(duration_nano)", "p999(duration_nano)",
		"p05if(duration_nano, has_error = true)", "p10if(duration_nano, has_error = true)", "p20if(duration_nano, has_error = true)",
		"p25if(duration_nano, has_error = true)", "p50if(duration_nano, has_error = true)", "p75if(duration_nano, has_error = true)",
		"p90if(duration_nano, has_error = true)", "p95if(duration_nano, has_error = true)", "p99if(duration_nano, has_error = true)",
		"p999if(duration_nano, has_error = true)",
		"rate()", "rate_if(has_error = true)", "rate_sum(duration_nano)", "rate_avg(duration_nano)", "rate_min(duration_nano)", "rate_max(duration_nano)",
		"sum(duration_nano) / count()",
		"count_distinct(name, kind_string)",
	}
	fl := flaggertest.New(t)
	mockMetadataStore := telemetrytypestest.NewMockMetadataStore()
	mockMetadataStore.KeysMap = tracestelemetryschema.BuildCompleteFieldKeyMap(time.Date(2025, 5, 22, 22, 0, 0, 0, time.UTC))
	clickhouse := clickHouseBuilder(mockMetadataStore, fl)
	serviceName := telemetrytypes.TelemetryFieldKey{Name: "service.name", FieldContext: telemetrytypes.FieldContextResource, FieldDataType: telemetrytypes.FieldDataTypeString}
	for _, expression := range expressions {
		t.Run(expression, func(t *testing.T) {
			query := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
				Signal:       telemetrytypes.SignalTraces,
				GroupBy:      []qbtypes.GroupByKey{{TelemetryFieldKey: serviceName}},
				Aggregations: []qbtypes.TraceAggregation{{Expression: expression}},
			}
			_, err := clickhouse.Build(context.Background(), valuer.UUID{}, 1747947419000, 1747983448000, qbtypes.RequestTypeScalar, query, nil)
			require.NoError(t, err)
			checkDataFusion(t, mockMetadataStore, fl, 1747947419000, 1747983448000, qbtypes.RequestTypeScalar, query, nil)
		})
	}
}

func clickHouseBuilder(metadataStore telemetrytypes.MetadataStore, fl flagger.Flagger) *traceQueryStatementBuilder {
	storage := tracestelemetryschema.NewStorage()
	return NewTraceQueryStatementBuilder(
		instrumentationtest.New().ToProviderSettings(), metadataStore, storage,
		querybuilder.NewAggExprRewriter(instrumentationtest.New().ToProviderSettings(), nil, storage, fl, telemetrytypes.SignalTraces),
		nil, fl, false, 100000,
	)
}

// TestEngineTopLevelOperationsStatement is the services view's own engine SQL.
func TestEngineTopLevelOperationsStatement(t *testing.T) {
	start := time.Unix(0, 1_747_947_419_000_000_000)
	for name, services := range map[string][]string{"some services": {"frontend", "cart"}, "every service": nil} {
		t.Run(name, func(t *testing.T) {
			sql, err := tracestelemetryschema.DataFusionTopLevelOperations(start, services)
			require.NoError(t, err)
			checkDataFusionStatement(t, sql)
		})
	}
}
