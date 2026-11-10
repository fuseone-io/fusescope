package querier

import (
	"context"
	"encoding/hex"
	"fmt"
	"maps"
	"slices"
	"sync"
	"testing"
	"time"

	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/clickhousetelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/flighttelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes/telemetrytypestest"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	engineOrg = valuer.MustNewUUID("0190f3a1-0000-7000-8000-000000000001")
	otherOrg  = valuer.MustNewUUID("0190f3a1-0000-7000-8000-000000000002")
)

// fakeBuilder renders query, or refuses with err.
type fakeBuilder struct {
	query string
	err   error
	calls int
}

func (b *fakeBuilder) Build(context.Context, valuer.UUID, uint64, uint64, qbtypes.RequestType, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation], map[string]qbtypes.VariableItem) (*qbtypes.Statement, error) {
	b.calls++
	if b.err != nil {
		return nil, b.err
	}
	return &qbtypes.Statement{Query: b.query, Warnings: []string{"from " + b.query}}, nil
}

// engineStore answers Query as the engine; its ClickHouse expects nothing, so any statement sent
// there fails the test.
type engineStore struct {
	*telemetrystoretest.Provider
	statements []string
	routes     []telemetrystore.Route
	tenants    []string
	partial    []string
	err        error
}

func (s *engineStore) Query(ctx context.Context, stmt string, _ ...any) (telemetrystore.Rows, error) {
	s.statements = append(s.statements, stmt)
	s.routes = append(s.routes, telemetrystore.RouteFromContext(ctx))
	if identity, err := telemetrystore.IdentityFromContext(ctx); err == nil {
		s.tenants = append(s.tenants, identity.Tenant.StringValue())
	}
	if s.err != nil {
		return nil, s.err
	}
	rows := cmock.NewRows([]cmock.ColumnType{{Name: "__result_0", Type: "UInt64"}}, [][]any{{uint64(7)}})
	return partialRows{Rows: clickhousetelemetrystore.NewRows(rows), partial: s.partial}, nil
}

type partialRows struct {
	telemetrystore.Rows
	partial []string
}

func (r partialRows) Warnings() []string { return r.partial }

type engineBed struct {
	store      *engineStore
	clickhouse *fakeBuilder
	engine     *fakeBuilder
	querier    *querier
}

func newEngineBed(t *testing.T, routes ...telemetrystore.Route) *engineBed {
	bed := &engineBed{
		store:      &engineStore{Provider: telemetrystoretest.New(telemetrystore.Config{}, &queryMatcherAny{})},
		clickhouse: &fakeBuilder{query: "clickhouse sql"},
		engine:     &fakeBuilder{query: "engine sql"},
	}
	bed.querier = New(instrumentationtest.New().ToProviderSettings(), bed.store, telemetrytypestest.NewMockMetadataStore(), nil,
		bed.clickhouse, nil, nil, nil, nil, nil, nil, nil, flaggertest.New(t), 0, 0)
	served := map[telemetrystore.Route]bool{}
	for _, route := range routes {
		served[route] = true
	}
	require.NoError(t, bed.querier.RouteToEngine(EngineRouting{
		Serves:           func(route telemetrystore.Route, org valuer.UUID) bool { return served[route] && org == engineOrg },
		TraceStmtBuilder: bed.engine,
	}))
	t.Cleanup(func() { assert.NoError(t, bed.store.Mock().ExpectationsWereMet(), "nothing reached ClickHouse") })
	return bed
}

func traceRequest(kind qbtypes.RequestType, extra ...qbtypes.QueryEnvelope) *qbtypes.QueryRangeRequest {
	now := time.Now()
	return &qbtypes.QueryRangeRequest{
		Start:       uint64(now.Add(-5 * time.Minute).UnixMilli()),
		End:         uint64(now.UnixMilli()),
		RequestType: kind,
		CompositeQuery: qbtypes.CompositeQuery{Queries: append([]qbtypes.QueryEnvelope{{
			Type: qbtypes.QueryTypeBuilder,
			Spec: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
				Name:         "A",
				Signal:       telemetrytypes.SignalTraces,
				Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}},
			},
		}}, extra...)},
	}
}

func TestARoutedTraceQueryRunsOnTheEngine(t *testing.T) {
	for _, testCase := range []struct {
		kind  qbtypes.RequestType
		route telemetrystore.Route
	}{
		{qbtypes.RequestTypeScalar, telemetrystore.RouteTracesAggregate},
		{qbtypes.RequestTypeTimeSeries, telemetrystore.RouteTracesAggregate},
		{qbtypes.RequestTypeRaw, telemetrystore.RouteTracesRaw},
	} {
		t.Run(testCase.kind.StringValue(), func(t *testing.T) {
			bed := newEngineBed(t, testCase.route)
			_, err := bed.querier.QueryRange(telemetrystore.WithService(context.Background(), "querier-test"), engineOrg, traceRequest(testCase.kind))
			require.NoError(t, err)
			assert.Equal(t, []string{"engine sql"}, bed.store.statements)
			assert.Equal(t, []telemetrystore.Route{testCase.route}, bed.store.routes)
			assert.Equal(t, []string{engineOrg.StringValue()}, bed.store.tenants, "the org is the engine tenant")
			assert.Zero(t, bed.clickhouse.calls)
		})
	}
}

func TestWhatIsNotRoutedStaysOnClickhouse(t *testing.T) {
	cases := map[string]struct {
		routes []telemetrystore.Route
		org    valuer.UUID
		req    *qbtypes.QueryRangeRequest
	}{
		"an org not listed":  {routes: []telemetrystore.Route{telemetrystore.RouteTracesAggregate}, org: otherOrg, req: traceRequest(qbtypes.RequestTypeScalar)},
		"a route not listed": {routes: []telemetrystore.Route{telemetrystore.RouteTracesRaw}, org: engineOrg, req: traceRequest(qbtypes.RequestTypeScalar)},
		"a trace list":       {routes: []telemetrystore.Route{telemetrystore.RouteTracesRaw, telemetrystore.RouteTracesAggregate}, org: engineOrg, req: traceRequest(qbtypes.RequestTypeTrace)},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			bed := newEngineBed(t, testCase.routes...)
			bed.store.Mock().ExpectQuery("clickhouse sql").WillReturnRows(cmock.NewRows([]cmock.ColumnType{{Name: "__result_0", Type: "UInt64"}}, [][]any{{uint64(1)}}))
			_, _ = bed.querier.QueryRange(context.Background(), testCase.org, testCase.req)
			assert.Empty(t, bed.store.statements, "nothing reached the engine")
			assert.Zero(t, bed.engine.calls)
		})
	}
}

func TestATraceOperatorKeepsItsRequestOnClickhouse(t *testing.T) {
	bed := newEngineBed(t, telemetrystore.RouteTracesAggregate)
	plain := traceRequest(qbtypes.RequestTypeScalar)
	assert.NotNil(t, bed.querier.engineFor(engineOrg, plain.RequestType, plain))
	operated := traceRequest(qbtypes.RequestTypeScalar, qbtypes.QueryEnvelope{Type: qbtypes.QueryTypeTraceOperator, Spec: qbtypes.QueryBuilderTraceOperator{Name: "B", Expression: "A"}})
	assert.Nil(t, bed.querier.engineFor(engineOrg, operated.RequestType, operated))
}

func TestAnUnsupportedDialectIsBuiltForClickhouseBeforeTheEngineIsCalled(t *testing.T) {
	bed := newEngineBed(t, telemetrystore.RouteTracesAggregate)
	bed.engine.err = errors.NewInvalidInputf(querybuilder.ErrCodeUnsupportedDialect, "no DataFusion form")
	bed.store.Mock().ExpectQuery("clickhouse sql").WillReturnRows(cmock.NewRows([]cmock.ColumnType{{Name: "__result_0", Type: "UInt64"}}, [][]any{{uint64(1)}}))
	_, err := bed.querier.QueryRange(telemetrystore.WithService(context.Background(), "querier-test"), engineOrg, traceRequest(qbtypes.RequestTypeScalar))
	require.NoError(t, err)
	assert.Empty(t, bed.store.statements)
	assert.Equal(t, 1, bed.clickhouse.calls)
}

func TestAStrictRoutingReturnsAnUnsupportedDialectToTheCaller(t *testing.T) {
	bed := newEngineBed(t, telemetrystore.RouteTracesAggregate)
	bed.querier.engine.routing.RequireEngine = true
	bed.engine.err = errors.NewInvalidInputf(querybuilder.ErrCodeUnsupportedDialect, "no DataFusion form")
	_, err := bed.querier.QueryRange(telemetrystore.WithService(context.Background(), "querier-test"), engineOrg, traceRequest(qbtypes.RequestTypeScalar))
	require.Error(t, err)
	assert.True(t, errors.Asc(err, querybuilder.ErrCodeUnsupportedDialect), "the caller sees why: a coverage gap, not a ClickHouse answer")
	assert.Empty(t, bed.store.statements)
	assert.Zero(t, bed.clickhouse.calls, "nothing is built for ClickHouse")
}

func TestAnyOtherBuildErrorReachesTheCaller(t *testing.T) {
	bed := newEngineBed(t, telemetrystore.RouteTracesAggregate)
	bed.engine.err = errors.NewInvalidInputf(errors.CodeInvalidInput, "bad filter")
	_, err := bed.querier.QueryRange(telemetrystore.WithService(context.Background(), "querier-test"), engineOrg, traceRequest(qbtypes.RequestTypeScalar))
	require.Error(t, err)
	assert.Empty(t, bed.store.statements)
	assert.Zero(t, bed.clickhouse.calls)
}

func TestAnEngineFailureIsNeverRetriedOnClickhouse(t *testing.T) {
	for name, failure := range map[string]error{
		"a refusal":   errors.Newf(errors.TypePayloadTooLarge, errors.CodeInvalidInput, "rows"),
		"a deadline":  context.DeadlineExceeded,
		"unreachable": errors.NewInternalf(errors.CodeInternal, "down"),
	} {
		t.Run(name, func(t *testing.T) {
			bed := newEngineBed(t, telemetrystore.RouteTracesAggregate)
			bed.store.err = failure
			_, err := bed.querier.QueryRange(telemetrystore.WithService(context.Background(), "querier-test"), engineOrg, traceRequest(qbtypes.RequestTypeScalar))
			require.Error(t, err)
			assert.Zero(t, bed.clickhouse.calls)
		})
	}
}

func TestAPartialAnswerAddsItsWarningToTheStatements(t *testing.T) {
	bed := newEngineBed(t, telemetrystore.RouteTracesAggregate)
	bed.store.partial = []string{telemetrystore.PartialIngesterUnavailable}
	resp, err := bed.querier.QueryRange(telemetrystore.WithService(context.Background(), "querier-test"), engineOrg, traceRequest(qbtypes.RequestTypeScalar))
	require.NoError(t, err)
	require.NotNil(t, resp.Warning)
	var messages []string
	for _, warning := range resp.Warning.Warnings {
		messages = append(messages, warning.Message)
	}
	assert.Contains(t, messages, "from engine sql")
	assert.Contains(t, messages, telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable))
}

func TestTheCacheKeyNamesTheStore(t *testing.T) {
	spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{Name: "A", Signal: telemetrytypes.SignalTraces, Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}}}
	clickhouse := newBuilderQuery[qbtypes.TraceAggregation](nil, nil, engineOrg, &fakeBuilder{}, qbtypes.QueryTypeBuilder, spec, qbtypes.TimeRange{From: 1, To: 2}, qbtypes.RequestTypeTimeSeries, nil, builderConfig{})
	engine := newBuilderQuery[qbtypes.TraceAggregation](nil, nil, engineOrg, &fakeBuilder{}, qbtypes.QueryTypeBuilder, spec, qbtypes.TimeRange{From: 1, To: 2}, qbtypes.RequestTypeTimeSeries, nil, builderConfig{})
	engine.engine = &engineCall[qbtypes.TraceAggregation]{route: telemetrystore.RouteTracesAggregate, builder: &fakeBuilder{}}
	assert.NotEmpty(t, clickhouse.Fingerprint())
	assert.NotEqual(t, clickhouse.Fingerprint(), engine.Fingerprint())
}

const knownTrace = "5b8efff798038103d269b633813fc60c"

func traceIDRequest(kind qbtypes.RequestType) *qbtypes.QueryRangeRequest {
	req := traceRequest(kind)
	spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	spec.Filter = &qbtypes.Filter{Expression: "trace_id = '" + knownTrace + "'"}
	if kind == qbtypes.RequestTypeRaw {
		spec.Aggregations = nil
		spec.Order = []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "timestamp"}}, Direction: qbtypes.OrderDirectionDesc}}
		spec.Limit = 10
	}
	req.CompositeQuery.Queries[0].Spec = spec
	return req
}

// A fallback runs ClickHouse's own preprocessing: the trace-id window lookup, here answering that
// the trace is unknown, which ends the query empty with that lookup as ClickHouse's only call.
func TestAFallbackNarrowsItsWindowAsClickhouseDoes(t *testing.T) {
	for _, kind := range []qbtypes.RequestType{qbtypes.RequestTypeScalar, qbtypes.RequestTypeRaw} {
		t.Run(kind.StringValue(), func(t *testing.T) {
			route, _ := traceRoute(kind)
			bed := newEngineBed(t, route)
			bed.engine.err = errors.NewInvalidInputf(querybuilder.ErrCodeUnsupportedDialect, "no DataFusion form")
			bed.store.Mock().ExpectQueryRow("trace_summary").WillReturnRow(cmock.NewRow(
				[]cmock.ColumnType{{Name: "count()", Type: "UInt64"}, {Name: "start", Type: "Int64"}, {Name: "end", Type: "Int64"}},
				[]any{uint64(0), int64(0), int64(0)},
			))
			_, err := bed.querier.QueryRange(telemetrystore.WithService(context.Background(), "querier-test"), engineOrg, traceIDRequest(kind))
			require.NoError(t, err)
			assert.Empty(t, bed.store.statements)
			assert.Zero(t, bed.clickhouse.calls, "the unknown trace ends the query before its statement")
		})
	}
}

func TestARoutedQueryLeavesClickhousePreprocessingOut(t *testing.T) {
	for _, kind := range []qbtypes.RequestType{qbtypes.RequestTypeScalar, qbtypes.RequestTypeRaw} {
		t.Run(kind.StringValue(), func(t *testing.T) {
			route, _ := traceRoute(kind)
			bed := newEngineBed(t, route)
			_, err := bed.querier.QueryRange(telemetrystore.WithService(context.Background(), "querier-test"), engineOrg, traceIDRequest(kind))
			require.NoError(t, err)
			assert.NotEmpty(t, bed.store.statements, "the engine served it")
		})
	}
}

func TestThePreviewShowsTheStatementThatRuns(t *testing.T) {
	spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{Name: "A", Signal: telemetrytypes.SignalTraces, Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}}}
	preview := func(engine *fakeBuilder) string {
		q := newBuilderQuery[qbtypes.TraceAggregation](nil, nil, engineOrg, &fakeBuilder{query: "clickhouse sql"}, qbtypes.QueryTypeBuilder, spec, qbtypes.TimeRange{From: 1, To: 2}, qbtypes.RequestTypeScalar, nil, builderConfig{})
		q.engine = &engineCall[qbtypes.TraceAggregation]{route: telemetrystore.RouteTracesAggregate, builder: engine}
		stmt, err := q.Statement(context.Background())
		require.NoError(t, err)
		return stmt.Query
	}
	assert.Equal(t, "engine sql", preview(&fakeBuilder{query: "engine sql"}))
	assert.Equal(t, "clickhouse sql", preview(&fakeBuilder{err: errors.NewInvalidInputf(querybuilder.ErrCodeUnsupportedDialect, "no form")}))
}

// windowBuilder renders the window it is asked for, safely from many goroutines.
type windowBuilder struct {
	mu      sync.Mutex
	windows [][2]uint64
}

func (b *windowBuilder) Build(_ context.Context, _ valuer.UUID, from, to uint64, _ qbtypes.RequestType, _ qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation], _ map[string]qbtypes.VariableItem) (*qbtypes.Statement, error) {
	b.mu.Lock()
	b.windows = append(b.windows, [2]uint64{from, to})
	b.mu.Unlock()
	return &qbtypes.Statement{Query: fmt.Sprintf("engine sql %d-%d", from, to)}, nil
}

// Ranged queries of one cached query run in parallel; each decides for its own window.
func TestRangedQueriesDecideEachForItsOwnWindow(t *testing.T) {
	bed := newEngineBed(t, telemetrystore.RouteTracesAggregate)
	engine := &windowBuilder{}
	spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{Name: "A", Signal: telemetrytypes.SignalTraces, Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}}}
	original := newBuilderQuery[qbtypes.TraceAggregation](nil, bed.store, engineOrg, bed.clickhouse, qbtypes.QueryTypeBuilder, spec, qbtypes.TimeRange{From: 1_000, To: 9_000}, qbtypes.RequestTypeTimeSeries, nil, builderConfig{})
	original.engine = &engineCall[qbtypes.TraceAggregation]{route: telemetrystore.RouteTracesAggregate, builder: engine}
	_, _, err := original.onEngine(context.Background())
	require.NoError(t, err)

	ranges := []qbtypes.TimeRange{{From: 1_000, To: 2_000}, {From: 5_000, To: 6_000}, {From: 8_000, To: 9_000}}
	statements := make([]string, len(ranges))
	var wg sync.WaitGroup
	for i, window := range ranges {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ranged := bed.querier.createRangedQuery(engineOrg, original, window).(*builderQuery[qbtypes.TraceAggregation])
			stmt, onEngine, err := ranged.onEngine(context.Background())
			assert.NoError(t, err)
			assert.True(t, onEngine)
			statements[i] = stmt.Query
		}()
	}
	wg.Wait()
	for i, window := range ranges {
		assert.Equal(t, fmt.Sprintf("engine sql %d-%d", window.From, window.To), statements[i])
	}
}

// childTrace and childParent are the trace and parent of nativeSpanBatch's second row.
const (
	childTrace  = "4bf92f3577b34da6a3ce929d0e0e4736"
	childParent = "53995c3f42cd8ad8"
)

// nativeSpanBatch is two span rows of name, events and links as the engine sends them: links read
// with the span's trace and parent ids, the selection asks for no ids. The first row is a root
// without links, the second a child with one link.
func nativeSpanBatch(t *testing.T) arrow.RecordBatch {
	attributes := arrow.MapOf(arrow.BinaryTypes.String, arrow.BinaryTypes.String)
	attributes.SetItemNullable(false)
	event := arrow.StructOf(
		arrow.Field{Name: "timestamp", Type: &arrow.TimestampType{Unit: arrow.Nanosecond, TimeZone: "UTC"}},
		arrow.Field{Name: "name", Type: arrow.BinaryTypes.String},
		arrow.Field{Name: "attributes", Type: attributes},
	)
	link := arrow.StructOf(
		arrow.Field{Name: "trace_id", Type: &arrow.FixedSizeBinaryType{ByteWidth: 16}},
		arrow.Field{Name: "span_id", Type: &arrow.FixedSizeBinaryType{ByteWidth: 8}},
		arrow.Field{Name: "trace_state", Type: arrow.BinaryTypes.String},
		arrow.Field{Name: "attributes", Type: attributes},
	)
	linksWithIDs := arrow.StructOf(
		arrow.Field{Name: "trace_id", Type: arrow.BinaryTypes.String},
		arrow.Field{Name: "parent_span_id", Type: arrow.BinaryTypes.String},
		arrow.Field{Name: "links", Type: arrow.ListOfNonNullable(link)},
	)
	schema := arrow.NewSchema([]arrow.Field{
		{Name: "__SELECT_KEY_0_name", Type: arrow.BinaryTypes.String},
		{Name: "__SELECT_KEY_1_events", Type: arrow.ListOfNonNullable(event)},
		// A struct DataFusion builds is nullable: the reader scans it behind a pointer.
		{Name: "__SELECT_KEY_2_links", Type: linksWithIDs, Nullable: true},
	}, nil)
	b := array.NewRecordBuilder(memory.DefaultAllocator, schema)
	defer b.Release()
	b.Field(0).(*array.StringBuilder).AppendValues([]string{"GET /cart", "cart.get"}, nil)

	events := b.Field(1).(*array.ListBuilder)
	events.Append(true)
	e := events.ValueBuilder().(*array.StructBuilder)
	e.Append(true)
	e.FieldBuilder(0).(*array.TimestampBuilder).Append(5)
	e.FieldBuilder(1).(*array.StringBuilder).Append("retry")
	e.FieldBuilder(2).(*array.MapBuilder).Append(true)
	events.Append(true)

	withIDs := b.Field(2).(*array.StructBuilder)
	withIDs.Append(true)
	withIDs.FieldBuilder(0).(*array.StringBuilder).Append(childTrace)
	withIDs.FieldBuilder(1).(*array.StringBuilder).Append("")
	withIDs.FieldBuilder(2).(*array.ListBuilder).Append(true)

	withIDs.Append(true)
	withIDs.FieldBuilder(0).(*array.StringBuilder).Append(childTrace)
	withIDs.FieldBuilder(1).(*array.StringBuilder).Append(childParent)
	links := withIDs.FieldBuilder(2).(*array.ListBuilder)
	links.Append(true)
	l := links.ValueBuilder().(*array.StructBuilder)
	l.Append(true)
	traceID, err := hex.DecodeString(knownTrace)
	require.NoError(t, err)
	l.FieldBuilder(0).(*array.FixedSizeBinaryBuilder).Append(traceID)
	l.FieldBuilder(1).(*array.FixedSizeBinaryBuilder).Append([]byte{0x00, 0xf0, 0x67, 0xaa, 0x0b, 0xa9, 0x02, 0xb7})
	l.FieldBuilder(2).(*array.StringBuilder).Append("")
	l.FieldBuilder(3).(*array.MapBuilder).Append(true)
	return b.NewRecordBatch()
}

type nativeStore struct {
	engineStore
	batch arrow.RecordBatch
}

func (s *nativeStore) Query(context.Context, string, ...any) (telemetrystore.Rows, error) {
	return flighttelemetrystore.NewRows(nil, s.batch)
}

func TestASpanListFromTheEngineCarriesEventsAndLinksAsStored(t *testing.T) {
	store := &nativeStore{engineStore: engineStore{Provider: telemetrystoretest.New(telemetrystore.Config{}, &queryMatcherAny{})}, batch: nativeSpanBatch(t)}
	spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{Name: "A", Signal: telemetrytypes.SignalTraces}
	q := newBuilderQuery[qbtypes.TraceAggregation](nil, store, engineOrg, &fakeBuilder{}, qbtypes.QueryTypeBuilder, spec, qbtypes.TimeRange{From: 1, To: 2}, qbtypes.RequestTypeRaw, nil, builderConfig{})
	q.engine = &engineCall[qbtypes.TraceAggregation]{route: telemetrystore.RouteTracesRaw, builder: &fakeBuilder{query: "engine sql"}}
	result, err := q.executeOnEngine(telemetrystore.WithService(context.Background(), "querier-test"), &qbtypes.Statement{Query: "engine sql"})
	require.NoError(t, err)
	rows := result.Value.(*qbtypes.RawData).Rows
	require.Len(t, rows, 2)
	root, child := rows[0].Data, rows[1].Data
	assert.Equal(t, []spantypes.EventV2{{Name: "retry", TimeUnixNano: 5}}, root["events"], "the reader decodes them as it does ClickHouse's")
	assert.Equal(t, []spantypes.Link{{TraceID: childTrace}}, root["links"], "a root's own reference names its trace only")
	assert.Equal(t, []spantypes.Link{{TraceID: childTrace, SpanID: childParent}, {TraceID: knownTrace, SpanID: "00f067aa0ba902b7"}}, child["links"], "the parent first, then the links, as ClickHouse stores them")
	for _, row := range []map[string]any{root, child} {
		assert.ElementsMatch(t, []string{"name", "events", "links"}, slices.Collect(maps.Keys(row)), "the ids links read with are not in the answer")
	}
}
