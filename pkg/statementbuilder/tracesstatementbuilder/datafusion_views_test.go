package tracesstatementbuilder

import (
	"context"
	"testing"
	"time"

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
