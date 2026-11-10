package impltracedetail

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/flighttelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/aiobservabilitytypes"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	engineOrg = valuer.MustNewUUID("0190f3a1-0000-7000-8000-000000000001")
	// t0 is 2025-05-22T21:40:00Z.
	t0 = time.Unix(1_747_950_000, 0).UTC()
)

// richSpan has a value in every column the mapper reads.
func richSpan() engineSpan {
	return engineSpan{
		spanID: "00f067aa0ba902b7", parentSpanID: "53995c3f42cd8ad8", at: t0.Add(123), duration: 4_500,
		name: "GET /cart", kind: 2, kindString: "Server", statusCode: 2, statusCodeString: "Error",
		statusMessage: "boom", hasError: true, isRemote: "true", traceState: "rojo=00f067aa0ba902b7", flags: 1,
		service: "cart", resources: map[string]string{"service.name": "cart", "host.name": "h1"},
		attrs:   map[string]string{"http.request.method": "GET"},
		numbers: map[string]float64{"http.response.status_code": 500}, bools: map[string]bool{"retry": true},
		events:     []engineEvent{{at: t0.Add(200), name: "exception", attributes: map[string]string{"exception.type": "IOError"}}},
		links:      []engineLink{{traceID: "5b8efff798038103d269b633813fc60c", spanID: "eee19b7ec3c1b174", traceState: "x=1"}},
		httpMethod: ptr("GET"), responseCode: ptr("500"), dbName: ptr("carts"), dbOperation: ptr("SELECT"),
	}
}

func TestTheMapperReadsEveryColumnOfAnEngineSpan(t *testing.T) {
	rows, err := rowsOf(t, nil, batchOf(t, fullSchema(), richSpan()))()
	require.NoError(t, err)
	spans, err := readSpans(rows)
	require.NoError(t, err)
	require.Len(t, spans, 1)
	assert.Equal(t, spantypes.StorableSpan{
		StartTime: t0.Add(123), DurationNano: 4_500, SpanID: "00f067aa0ba902b7", HasError: true, Kind: 2,
		ServiceName: "cart", Name: "GET /cart",
		AttributesString: map[string]string{"http.request.method": "GET"},
		AttributesNumber: map[string]float64{"http.response.status_code": 500},
		AttributesBool:   map[string]bool{"retry": true},
		ResourcesString:  map[string]string{"service.name": "cart", "host.name": "h1"},
		Events:           []string{`{"name":"exception","timeUnixNano":1747950000000000200,"attributeMap":{"exception.type":"IOError"}}`},
		StatusMessage:    "boom", StatusCodeString: "Error", SpanKind: "Server", ParentSpanID: "53995c3f42cd8ad8",
		Flags: 1, IsRemote: "true", TraceState: "rojo=00f067aa0ba902b7", StatusCode: 2,
		DBName: "carts", DBOperation: "SELECT", HTTPMethod: "GET", ResponseStatusCode: "500",
		References: `[{"traceId":"5b8efff798038103d269b633813fc60c","spanId":"eee19b7ec3c1b174"}]`,
	}, spans[0], "the columns the engine does not store, http_url, http_host and the external_http pair, read empty")
}

func TestARootAndUnsetPromotedColumnsReadEmpty(t *testing.T) {
	root := engineSpan{spanID: "53995c3f42cd8ad8", at: t0, name: "root", isRemote: "false"}
	rows, err := rowsOf(t, nil, batchOf(t, fullSchema(), root))()
	require.NoError(t, err)
	spans, err := readSpans(rows)
	require.NoError(t, err)
	require.Len(t, spans, 1)
	assert.Empty(t, spans[0].ParentSpanID)
	assert.Empty(t, spans[0].ServiceName)
	assert.Empty(t, spans[0].HTTPMethod)
	assert.Equal(t, []string{}, spans[0].Events)
	assert.Equal(t, "[]", spans[0].References)
}

func newEngineModule(t *testing.T, cfg tracedetail.Config, serves bool, answers ...func() (telemetrystore.Rows, error)) (*module, *fakeEngine) {
	engine := newFakeEngine(t, answers...)
	reader := NewEngineReader(engine, flaggertest.WithBooleanFlags(t, nil), func(route telemetrystore.Route, org valuer.UUID) bool {
		return serves && route == telemetrystore.RouteTraceDetail && org == engineOrg
	})
	return NewModule(NewTraceStore(engine, nil, nil), reader, instrumentationtest.New().ToProviderSettings(), cfg), engine
}

func defaultConfig() tracedetail.Config {
	return tracedetail.NewConfigFactory().New().(tracedetail.Config)
}

func bodyFor(method string) io.Reader {
	if method == http.MethodPost {
		return strings.NewReader(`{}`)
	}
	return http.NoBody
}

func detailContext() context.Context {
	return telemetrystore.WithService(context.Background(), "tracedetail-test")
}

func TestTheSummaryOfAnEngineOrgStreamsOneFullLookup(t *testing.T) {
	llm := engineSpan{
		spanID: "0000000000000003", parentSpanID: "0000000000000001", at: t0.Add(30), duration: 10, name: "chat", service: "agent",
		attrs:   map[string]string{aiobservabilitytypes.GenAIRequestModel: "m", aiobservabilitytypes.GenAIUsageOutputTokens: "7"},
		numbers: map[string]float64{aiobservabilitytypes.GenAIUsageInputTokens: 11, aiobservabilitytypes.SignozGenAITotalCost: 0.25},
	}
	first := batchOf(t, fullSchema(),
		engineSpan{spanID: "0000000000000001", at: t0.Add(10), duration: 100, name: "GET /", service: "front", responseCode: ptr("200")},
		engineSpan{spanID: "0000000000000002", parentSpanID: "0000000000000001", at: t0.Add(20), duration: 500, name: "db", service: "front", hasError: true},
	)
	second := batchOf(t, fullSchema(),
		engineSpan{spanID: "0000000000000002", parentSpanID: "0000000000000001", at: t0.Add(20), duration: 500, name: "db", service: "front", hasError: true},
		llm,
		engineSpan{spanID: "0000000000000004", parentSpanID: "00000000000000ff", at: t0.Add(5), duration: 1, name: "orphan", service: "late"},
	)
	m, engine := newEngineModule(t, defaultConfig(), true, rowsOf(t, []string{telemetrystore.PartialIngesterUnavailable}, first, second))

	stats, warnings, err := m.GetTraceSummary(detailContext(), engineOrg, testTraceID)
	require.NoError(t, err)
	cost := 0.25
	assert.Equal(t, &spantypes.TraceStats{
		StartNs: uint64(t0.Add(5).UnixNano()), EndNs: uint64(t0.Add(520).UnixNano()),
		RootServiceName: "", RootEntryPoint: "Missing Span", RootSpanStatusCode: "",
		TotalSpans: 4, TotalErrorSpans: 1, HasMissingSpans: true, GenAISpanCount: 1,
		Tokens:    spantypes.TraceAITokens{Input: 11, Output: 7},
		TotalCost: &cost,
	}, stats, "the duplicate counts once and the earliest root, here a missing parent, names the trace")
	assert.Equal(t, []string{telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable)}, warnings)
	assert.Equal(t, []lookupCall{{Body: lookupBody{TraceID: testTraceID, Projection: "full"}, Route: telemetrystore.RouteTraceDetail, Tenant: engineOrg.StringValue()}}, engine.calls)
}

func TestTheSummaryRootIsTheEarliestSpanWithoutParent(t *testing.T) {
	batch := batchOf(t, fullSchema(),
		engineSpan{spanID: "0000000000000001", at: t0.Add(10), duration: 100, name: "GET /", service: "front", responseCode: ptr("200")},
		engineSpan{spanID: "0000000000000002", parentSpanID: "0000000000000001", at: t0.Add(20), duration: 5, name: "db", service: "front"},
	)
	m, _ := newEngineModule(t, defaultConfig(), true, rowsOf(t, nil, batch))
	stats, warnings, err := m.GetTraceSummary(detailContext(), engineOrg, testTraceID)
	require.NoError(t, err)
	assert.Empty(t, warnings)
	assert.Equal(t, "front", stats.RootServiceName)
	assert.Equal(t, "GET /", stats.RootEntryPoint)
	assert.Equal(t, "200", stats.RootSpanStatusCode)
	assert.False(t, stats.HasMissingSpans)
	assert.Zero(t, stats.GenAISpanCount)
	assert.Nil(t, stats.TotalCost, "no span carries a cost")
}

func TestAnEngineTraceWithoutSpansIsNotFound(t *testing.T) {
	m, _ := newEngineModule(t, defaultConfig(), true, rowsOf(t, nil, batchOf(t, fullSchema())), rowsOf(t, nil, batchOf(t, minimalSchema())))
	_, _, err := m.GetTraceSummary(detailContext(), engineOrg, testTraceID)
	assert.ErrorIs(t, err, spantypes.ErrTraceNotFound)
	_, _, err = m.GetWaterfallV4(detailContext(), engineOrg, testTraceID, "", nil)
	assert.ErrorIs(t, err, spantypes.ErrTraceNotFound)
}

func TestATraceIDTheEngineCannotHoldIsNotFoundWithoutALookup(t *testing.T) {
	m, _ := newEngineModule(t, defaultConfig(), true)
	for _, id := range []string{"", "abc", "4BF92F3577B34DA6A3CE929D0E0E4736", testTraceID + "00"} {
		_, _, err := m.GetTraceSummary(detailContext(), engineOrg, id)
		assert.ErrorIs(t, err, spantypes.ErrTraceNotFound, id)
		_, _, err = m.GetWaterfallV4(detailContext(), engineOrg, id, "", nil)
		assert.ErrorIs(t, err, spantypes.ErrTraceNotFound, id)
	}
}

func TestAnEngineTraceOverTheRowCapIsTooLarge(t *testing.T) {
	tooMany := errors.Newf(errors.TypePayloadTooLarge, flighttelemetrystore.ErrCodeTooManyRows, "the answer passes the engine's row cap")
	m, _ := newEngineModule(t, defaultConfig(), true, failWith(tooMany), failWith(tooMany))

	_, _, err := m.GetTraceSummary(detailContext(), engineOrg, testTraceID)
	assert.True(t, errors.Asc(err, spantypes.ErrCodeTraceTooLarge), err)
	assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge), err)

	_, _, err = m.GetWaterfallV4(detailContext(), engineOrg, testTraceID, "", nil)
	assert.True(t, errors.Asc(err, spantypes.ErrCodeTraceTooLarge), err)
}

func TestAnotherEngineErrorReachesTheCaller(t *testing.T) {
	refused := errors.Newf(errors.TypeTooManyRequests, flighttelemetrystore.ErrCodeEngine, "fusescope-engine refused the call: ResourceExhausted")
	m, _ := newEngineModule(t, defaultConfig(), true, failWith(refused))
	_, _, err := m.GetTraceSummary(detailContext(), engineOrg, testTraceID)
	assert.Equal(t, refused, err)
}

// waterfallSpans is a root with two children, the second child first in time.
func waterfallSpans() []engineSpan {
	return []engineSpan{
		{spanID: "0000000000000001", at: t0, duration: 100, name: "root", service: "front"},
		{spanID: "0000000000000003", parentSpanID: "0000000000000001", at: t0.Add(5), duration: 10, name: "b", service: "back"},
		{spanID: "0000000000000002", parentSpanID: "0000000000000001", at: t0.Add(5), duration: 10, name: "a", service: "back", hasError: true},
	}
}

func TestASmallEngineWaterfallReadsTheTreeThenEverySpan(t *testing.T) {
	spans := waterfallSpans()
	m, engine := newEngineModule(t, defaultConfig(), true,
		rowsOf(t, []string{telemetrystore.PartialUnknown}, batchOf(t, minimalSchema(), spans...)),
		rowsOf(t, []string{telemetrystore.PartialUnknown}, batchOf(t, fullSchema(), append(spans, spans[2])...)),
	)
	trace, warnings, err := m.GetWaterfallV4(detailContext(), engineOrg, testTraceID, "", nil)
	require.NoError(t, err)
	assert.Equal(t, []string{telemetrystore.PartialWarning(telemetrystore.PartialUnknown)}, warnings, "one warning per category")
	assert.Equal(t, []string{"0000000000000001", "0000000000000002", "0000000000000003"}, spanIDs(trace.Spans), "the tree orders ties in time by name")
	assert.Equal(t, uint64(3), trace.TotalSpansCount)
	assert.Equal(t, uint64(1), trace.TotalErrorSpansCount)
	assert.False(t, trace.HasMore)
	assert.Equal(t, []lookupCall{
		{Body: lookupBody{TraceID: testTraceID, Projection: "minimal"}, Route: telemetrystore.RouteTraceDetail, Tenant: engineOrg.StringValue()},
		{Body: lookupBody{TraceID: testTraceID, Projection: "full"}, Route: telemetrystore.RouteTraceDetail, Tenant: engineOrg.StringValue()},
	}, engine.calls)
}

func TestALargeEngineWaterfallReadsOnlyTheWindowInFull(t *testing.T) {
	cfg := defaultConfig()
	cfg.Waterfall.MaxLimitToSelectAllSpans = 2
	cfg.Waterfall.SpanPageSize = 2
	spans := waterfallSpans()
	m, engine := newEngineModule(t, cfg, true,
		rowsOf(t, nil, batchOf(t, minimalSchema(), spans...)),
		rowsOf(t, nil, batchOf(t, fullSchema(), spans[0], spans[2])),
	)
	trace, _, err := m.GetWaterfallV4(detailContext(), engineOrg, testTraceID, "0000000000000001", nil)
	require.NoError(t, err)
	require.Len(t, engine.calls, 2)
	assert.Equal(t, lookupBody{TraceID: testTraceID, Projection: "minimal"}, engine.calls[0].Body)
	assert.Equal(t, "full", engine.calls[1].Body.Projection)
	assert.Equal(t, spanIDs(trace.Spans), engine.calls[1].Body.SpanIDs, "the full lookup names the window")
	assert.True(t, trace.HasMore)
	assert.Equal(t, uint64(3), trace.TotalSpansCount)
	assert.Equal(t, "root", trace.Spans[0].Name, "the window is enriched from the full lookup")
}

func TestTheTraceDetailOfAnotherOrgReadsClickhouse(t *testing.T) {
	m, engine := newEngineModule(t, defaultConfig(), false)
	engine.Mock().ExpectQueryRow("distributed_trace_summary").WillReturnRow(cmock.NewRow(nil, nil))
	_, warnings, err := m.GetTraceSummary(detailContext(), engineOrg, testTraceID)
	assert.Error(t, err)
	assert.Empty(t, warnings)
	assert.Empty(t, engine.calls)
}

func TestTheSummaryAndWaterfallCarryTheWarningsBesideTheData(t *testing.T) {
	spans := waterfallSpans()
	partial := []string{telemetrystore.PartialIngesterUnavailable}
	m, _ := newEngineModule(t, defaultConfig(), true,
		rowsOf(t, partial, batchOf(t, fullSchema(), spans...)),
		rowsOf(t, partial, batchOf(t, minimalSchema(), spans...)),
		rowsOf(t, partial, batchOf(t, fullSchema(), spans...)),
	)
	h := NewHandler(m)
	want := `"warnings":["` + telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable) + `"]`
	for _, call := range []struct {
		name    string
		method  string
		handler http.HandlerFunc
	}{
		{"summary", http.MethodGet, h.GetTraceSummary},
		{"waterfall", http.MethodPost, h.GetWaterfallV4},
	} {
		req := httptest.NewRequest(call.method, "/", bodyFor(call.method))
		ctx := authtypes.NewContextWithClaims(detailContext(), authtypes.Claims{OrgID: engineOrg.StringValue()})
		req = mux.SetURLVars(req.WithContext(ctx), map[string]string{"traceID": testTraceID})
		rec := httptest.NewRecorder()
		call.handler(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code, call.name)
		assert.Contains(t, rec.Body.String(), want, call.name)
	}
}
