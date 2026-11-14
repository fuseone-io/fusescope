package parityexec

import (
	"context"
	"sync"
	"testing"
	"time"

	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/clickhousetelemetrystore"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeEngine is the Flight store of the engine graph: its statements and actions are recorded,
// and its ClickHouse surface is the refuser, as NewWithFallback builds it.
type fakeEngine struct {
	*Refuser
	mu         sync.Mutex
	statements []string
	actions    []string
}

func (e *fakeEngine) Query(_ context.Context, stmt string, _ ...any) (telemetrystore.Rows, error) {
	e.mu.Lock()
	e.statements = append(e.statements, stmt)
	e.mu.Unlock()
	rows := cmock.NewRows([]cmock.ColumnType{{Name: "__result_0", Type: "UInt64"}}, [][]any{{uint64(7)}})
	return clickhousetelemetrystore.NewRows(rows), nil
}

func (e *fakeEngine) Do(_ context.Context, action string, _ []byte) (telemetrystore.Rows, error) {
	e.mu.Lock()
	e.actions = append(e.actions, action)
	e.mu.Unlock()
	columns := []cmock.ColumnType{{Name: "key", Type: "String"}, {Name: "source", Type: "String"}, {Name: "type", Type: "String"}}
	if action == "trace.lookup" {
		columns = []cmock.ColumnType{{Name: "span_id", Type: "String"}}
	}
	return clickhousetelemetrystore.NewRows(cmock.NewRows(columns, nil)), nil
}

func engineGraph(t *testing.T) (*Graph, *fakeEngine) {
	t.Helper()
	store := &fakeEngine{Refuser: NewRefuser()}
	cfg := Config{Orgs: []valuer.UUID{org}, Querier: querier.Config{MaxConcurrentQueries: 2}, TraceDetail: tracedetail.NewConfigFactory().New().(tracedetail.Config)}
	g, err := newEngineGraph(instrumentationtest.New().ToProviderSettings(), flaggertest.New(t), store, store.Refuser, cfg)
	require.NoError(t, err)
	return g, store
}

func request(kind qbtypes.RequestType, aggregation string) *qbtypes.QueryRangeRequest {
	now := time.Now()
	return &qbtypes.QueryRangeRequest{
		Start: uint64(now.Add(-time.Hour).UnixMilli()), End: uint64(now.UnixMilli()), RequestType: kind, NoCache: true,
		CompositeQuery: qbtypes.CompositeQuery{Queries: []qbtypes.QueryEnvelope{{Type: qbtypes.QueryTypeBuilder, Spec: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
			Name: "A", Signal: telemetrytypes.SignalTraces, Aggregations: []qbtypes.TraceAggregation{{Expression: aggregation}},
			Filter: &qbtypes.Filter{Expression: "http.route = '/cart'"},
		}}}},
	}
}

func pairContext() context.Context {
	return telemetrystore.WithService(WithPair(context.Background(), 1), subject)
}

func TestTheEngineGraphAnswersFromTheEngineWithItsOwnKeys(t *testing.T) {
	g, store := engineGraph(t)
	_, err := g.Querier.QueryRange(pairContext(), org, request(qbtypes.RequestTypeScalar, "count()"))
	require.NoError(t, err)
	assert.Len(t, store.statements, 1)
	assert.Contains(t, store.actions, "metadata.keys", "keys come from the engine")
	assert.Zero(t, store.Touches(1))
	assert.Zero(t, store.Unattributed())
}

func TestTheEngineGraphReturnsAnUnsupportedDialect(t *testing.T) {
	g, store := engineGraph(t)
	_, err := g.Querier.QueryRange(pairContext(), org, request(qbtypes.RequestTypeScalar, "count_distinct(name, service.name)"))
	require.Error(t, err)
	assert.True(t, errors.Asc(err, querybuilder.ErrCodeUnsupportedDialect), "%v", err)
	assert.Empty(t, store.statements)
	assert.Zero(t, store.Touches(1), "a coverage gap, not a fallback")
}

func TestWhatTheEngineDoesNotServeTouchesTheRefuser(t *testing.T) {
	g, store := engineGraph(t)
	_, _ = g.Querier.QueryRange(pairContext(), org, request(qbtypes.RequestTypeTrace, "count()"))
	assert.Positive(t, store.Touches(1), "a trace list is built for ClickHouse, and refused")
	assert.Empty(t, store.statements)
}

func TestTheEngineGraphReadsATraceThroughTheEngine(t *testing.T) {
	g, store := engineGraph(t)
	_, _, err := g.TraceDetail.GetTraceSummary(pairContext(), org, "0123456789abcdef0123456789abcdef")
	assert.ErrorIs(t, err, spantypes.ErrTraceNotFound)
	assert.Equal(t, []string{"trace.lookup"}, store.actions)
	assert.Zero(t, store.Touches(1))
}

func TestATraceOperatorOnTheEngineGraphIsRefusedNotAPanic(t *testing.T) {
	g, store := engineGraph(t)
	req := request(qbtypes.RequestTypeScalar, "count()")
	req.CompositeQuery.Queries = append(req.CompositeQuery.Queries, qbtypes.QueryEnvelope{Type: qbtypes.QueryTypeTraceOperator, Spec: qbtypes.QueryBuilderTraceOperator{Name: "B", Expression: "A", Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}}}})
	assert.NotPanics(t, func() { _, _ = g.Querier.QueryRange(pairContext(), org, req) })
	assert.Positive(t, store.Touches(1))
	assert.Empty(t, store.statements)
}

func TestATraceDetailViewTheEngineDoesNotServeIsRefusedNotAPanic(t *testing.T) {
	g, store := engineGraph(t)
	var err error
	assert.NotPanics(t, func() {
		_, err = g.TraceDetail.GetFlamegraph(pairContext(), "0123456789abcdef0123456789abcdef", "", nil)
	})
	assert.Error(t, err)
	assert.NotPanics(t, func() {
		_, err = g.TraceDetail.GetThread(pairContext(), org, "0123456789abcdef0123456789abcdef", &spantypes.ThreadQuery{})
	})
	assert.Error(t, err)
	assert.Positive(t, store.Touches(1), "they reach ClickHouse, which refuses")
}

func TestTheEngineGraphResolvesKeysFromTheEngine(t *testing.T) {
	g, store := engineGraph(t)
	require.NotNil(t, g.Keys)
	_, _, err := g.Keys.GetKeysMulti(pairContext(), org, []*telemetrytypes.FieldKeySelector{{Name: "http.route", Signal: telemetrytypes.SignalTraces, SelectorMatchType: telemetrytypes.FieldSelectorMatchTypeExact}})
	require.NoError(t, err)
	assert.Equal(t, []string{"metadata.keys"}, store.actions)
}

func TestTheEngineGraphRoutesOnlyTheOrgsCompared(t *testing.T) {
	g, store := engineGraph(t)
	_, _ = g.Querier.QueryRange(pairContext(), valuer.GenerateUUID(), request(qbtypes.RequestTypeScalar, "count()"))
	assert.Empty(t, store.statements, "another org never reaches the engine")
	assert.Positive(t, store.Touches(1), "it is built for ClickHouse, and refused")
}

func spanList(hours int) *qbtypes.QueryRangeRequest {
	end := time.Now().Truncate(time.Minute)
	return &qbtypes.QueryRangeRequest{
		Start: uint64(end.Add(-time.Duration(hours) * time.Hour).UnixMilli()), End: uint64(end.UnixMilli()), RequestType: qbtypes.RequestTypeRaw, NoCache: true,
		CompositeQuery: qbtypes.CompositeQuery{Queries: []qbtypes.QueryEnvelope{{Type: qbtypes.QueryTypeBuilder, Spec: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
			Name: "A", Signal: telemetrytypes.SignalTraces, Limit: 100,
			Filter: &qbtypes.Filter{Expression: Group{}.Where(serviceKey, "frontend").Where(operationKey, "HTTP GET /dispatch").Filter},
			Order: []qbtypes.OrderBy{
				{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "timestamp", FieldContext: telemetrytypes.FieldContextSpan}}, Direction: qbtypes.OrderDirectionDesc},
				{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "span_id", FieldContext: telemetrytypes.FieldContextSpan}}, Direction: qbtypes.OrderDirectionAsc},
			},
		}}}},
	}
}

// A span_list resolves its keys from one engine listing, however many statements it runs.
func TestASpanListResolvesItsKeysOnce(t *testing.T) {
	for _, testCase := range []struct{ hours, statements int }{{1, 1}, {7, 3}} {
		g, store := engineGraph(t)
		_, err := g.Querier.QueryRange(pairContext(), org, spanList(testCase.hours))
		require.NoError(t, err)
		assert.Equal(t, []string{"metadata.keys"}, store.actions, "%d h", testCase.hours)
		assert.Len(t, store.statements, testCase.statements, "%d h", testCase.hours)
	}
}
