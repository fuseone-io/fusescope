package implrumapplication

import (
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"
)

const testTraceJSON = `{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"shop-web"}}]},"scopeSpans":[{"spans":[{"traceId":"5b8efff798038103d269b633813fc60c","spanId":"eee19b7ec3c1b174","name":"GET /search?email=a@b.c","kind":3,"startTimeUnixNano":"1700000000000000000","endTimeUnixNano":"1700000001000000000","attributes":[{"key":"url.full","value":{"stringValue":"https://shop.example.com/search?email=a@b.c&page=2"}},{"key":"session.id","value":{"stringValue":"s1"}}]}]}]}]}`

const testLogJSON = `{"resourceLogs":[{"resource":{},"scopeLogs":[{"logRecords":[{"timeUnixNano":"1700000000000000000","eventName":"exception","body":{"stringValue":"boom"},"attributes":[{"key":"fusescope.rum.error.source","value":{"stringValue":"onerror"}}]}]}]}]}`

type fakeCollector struct {
	mu       sync.Mutex
	status   int
	requests map[string][][]byte
	server   *httptest.Server
}

func newFakeCollector(t *testing.T) *fakeCollector {
	collector := &fakeCollector{status: http.StatusOK, requests: map[string][][]byte{}}
	collector.server = httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
		body, _ := io.ReadAll(req.Body)
		collector.mu.Lock()
		defer collector.mu.Unlock()
		collector.requests[req.URL.Path] = append(collector.requests[req.URL.Path], body)
		rw.WriteHeader(collector.status)
	}))
	t.Cleanup(collector.server.Close)
	return collector
}

func (collector *fakeCollector) received(path string) [][]byte {
	collector.mu.Lock()
	defer collector.mu.Unlock()
	return collector.requests[path]
}

type gatewayFixture struct {
	module    *module
	gateway   rumapplication.Gateway
	collector *fakeCollector
	key       string
	appID     string
	orgID     valuer.UUID
	app       valuer.UUID
}

func newGatewayFixture(t *testing.T, configure func(*rumapplication.Config)) *gatewayFixture {
	t.Helper()
	module, orgID := newTestModule(t)
	collector := newFakeCollector(t)

	created, err := module.Create(context.Background(), orgID, "admin@example.com", newTestPostable(t, `{"name":"shop-web","platform":"web","environment":"production","allowedOrigins":["https://shop.example.com","https://*.cdn.example.com"],"piiPolicy":{"queryAllowlist":["page"]}}`))
	require.NoError(t, err)

	config := module.config
	config.CollectorEndpoint = collector.server.URL
	if configure != nil {
		configure(&config)
	}

	return &gatewayFixture{module: module, gateway: NewGateway(module, config, factorytest.NewSettings()), collector: collector, key: created.Key.Key, appID: created.ID.StringValue(), orgID: orgID, app: created.ID}
}

func (fixture *gatewayFixture) do(method string, target string, body io.Reader, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, body)
	req.RemoteAddr = "203.0.113.7:51234"
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	recorder := httptest.NewRecorder()
	if strings.HasSuffix(req.URL.Path, "/logs") {
		fixture.gateway.Logs(recorder, req)
	} else {
		fixture.gateway.Traces(recorder, req)
	}
	return recorder
}

func TestGatewayAuthAndCORS(t *testing.T) {
	fixture := newGatewayFixture(t, nil)

	testCases := []struct {
		name        string
		target      string
		headers     map[string]string
		status      int
		allowOrigin string
		forwarded   bool
	}{
		{name: "MissingKey_Unauthorized", target: "/rum/v1/traces", headers: map[string]string{"Content-Type": "application/json"}, status: http.StatusUnauthorized},
		{name: "UnknownKey_Unauthorized", target: "/rum/v1/traces", headers: map[string]string{"Content-Type": "application/json", KeyHeader: rumtypes.KeyPrefix + "nopenopenopenopenopenopenopenope"}, status: http.StatusUnauthorized},
		{name: "HeaderKeyNoOrigin_Accepted", target: "/rum/v1/traces", headers: map[string]string{"Content-Type": "application/json", KeyHeader: fixture.key}, status: http.StatusOK, forwarded: true},
		{name: "QueryKeyForBeacon_Accepted", target: "/rum/v1/traces?" + KeyQueryParam + "=" + fixture.key, headers: map[string]string{"Content-Type": "text/plain;charset=UTF-8", "Origin": "https://shop.example.com"}, status: http.StatusOK, allowOrigin: "https://shop.example.com", forwarded: true},
		{name: "AllowedOrigin_EchoedBack", target: "/rum/v1/traces", headers: map[string]string{"Content-Type": "application/json", KeyHeader: fixture.key, "Origin": "https://shop.example.com"}, status: http.StatusOK, allowOrigin: "https://shop.example.com", forwarded: true},
		{name: "WildcardOrigin_EchoedBack", target: "/rum/v1/traces", headers: map[string]string{"Content-Type": "application/json", KeyHeader: fixture.key, "Origin": "https://eu.cdn.example.com"}, status: http.StatusOK, allowOrigin: "https://eu.cdn.example.com", forwarded: true},
		{name: "OtherOrigin_Forbidden", target: "/rum/v1/traces", headers: map[string]string{"Content-Type": "application/json", KeyHeader: fixture.key, "Origin": "https://evil.example.org"}, status: http.StatusForbidden},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			before := len(fixture.collector.received("/v1/traces"))
			response := fixture.do(http.MethodPost, testCase.target, strings.NewReader(testTraceJSON), testCase.headers)

			assert.Equal(t, testCase.status, response.Code, response.Body.String())
			assert.Equal(t, testCase.allowOrigin, response.Header().Get("Access-Control-Allow-Origin"))
			assert.Contains(t, response.Header().Values("Vary"), "Origin")
			assert.Equal(t, testCase.forwarded, len(fixture.collector.received("/v1/traces")) > before)
		})
	}

	status, err := fixture.module.Status(context.Background(), fixture.orgID, fixture.app)
	require.NoError(t, err)
	require.Len(t, status.Rejections, 1)
	assert.Equal(t, rumtypes.RejectionReasonOriginNotAllowed, status.Rejections[0].Reason)
	assert.Equal(t, "https://evil.example.org", status.Rejections[0].LastOrigin)
	assert.Equal(t, int64(1), status.Counts.Sessions)
}

func TestGatewayPreflight(t *testing.T) {
	fixture := newGatewayFixture(t, nil)

	testCases := []struct {
		name    string
		target  string
		origin  string
		method  string
		status  int
		allowed bool
	}{
		{name: "KnownOrigin_Allowed", target: "/rum/v1/traces", origin: "https://shop.example.com", method: http.MethodPost, status: http.StatusNoContent, allowed: true},
		{name: "KnownOriginLogs_Allowed", target: "/rum/v1/logs", origin: "https://a.cdn.example.com", method: http.MethodPost, status: http.StatusNoContent, allowed: true},
		{name: "UnknownOrigin_Forbidden", target: "/rum/v1/traces", origin: "https://evil.example.org", method: http.MethodPost, status: http.StatusForbidden},
		{name: "WrongMethod_Forbidden", target: "/rum/v1/traces", origin: "https://shop.example.com", method: http.MethodPut, status: http.StatusForbidden},
		{name: "QueryKeyOtherOrigin_Forbidden", target: "/rum/v1/traces?" + KeyQueryParam + "=" + fixture.key, origin: "https://evil.example.org", method: http.MethodPost, status: http.StatusForbidden},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			response := fixture.do(http.MethodOptions, testCase.target, nil, map[string]string{"Origin": testCase.origin, "Access-Control-Request-Method": testCase.method, "Access-Control-Request-Headers": "content-type, fusescope-rum-key"})

			assert.Equal(t, testCase.status, response.Code)
			if !testCase.allowed {
				assert.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
				return
			}
			assert.Equal(t, testCase.origin, response.Header().Get("Access-Control-Allow-Origin"))
			assert.Equal(t, http.MethodPost, response.Header().Get("Access-Control-Allow-Methods"))
			assert.Contains(t, response.Header().Get("Access-Control-Allow-Headers"), "fusescope-rum-key")
			assert.Contains(t, response.Header().Get("Access-Control-Allow-Headers"), "content-type")
			assert.Equal(t, "86400", response.Header().Get("Access-Control-Max-Age"))
			assert.Contains(t, response.Header().Values("Vary"), "Origin")
		})
	}
}

func TestGatewayRateLimit(t *testing.T) {
	fixture := newGatewayFixture(t, func(config *rumapplication.Config) {
		config.RateLimit.Client = rumapplication.LimitConfig{Rate: 0.001, Burst: 2}
	})
	headers := map[string]string{"Content-Type": "application/json", KeyHeader: fixture.key}

	codes := []int{}
	for range 3 {
		codes = append(codes, fixture.do(http.MethodPost, "/rum/v1/traces", strings.NewReader(testTraceJSON), headers).Code)
	}
	assert.Equal(t, []int{http.StatusOK, http.StatusOK, http.StatusTooManyRequests}, codes)

	response := fixture.do(http.MethodPost, "/rum/v1/traces", strings.NewReader(testTraceJSON), headers)
	assert.Equal(t, "1", response.Header().Get("Retry-After"))
	assert.Len(t, fixture.collector.received("/v1/traces"), 2)
}

func TestGatewayDecoding(t *testing.T) {
	fixture := newGatewayFixture(t, func(config *rumapplication.Config) { config.MaxBodySize = 4096 })

	request := ptraceotlp.NewExportRequest()
	require.NoError(t, request.UnmarshalJSON([]byte(testTraceJSON)))
	protobuf, err := request.MarshalProto()
	require.NoError(t, err)

	var gzipped bytes.Buffer
	writer := gzip.NewWriter(&gzipped)
	_, _ = writer.Write([]byte(testTraceJSON))
	require.NoError(t, writer.Close())

	var bomb bytes.Buffer
	bombWriter := gzip.NewWriter(&bomb)
	_, _ = bombWriter.Write(bytes.Repeat([]byte("a"), 64*1024))
	require.NoError(t, bombWriter.Close())

	testCases := []struct {
		name        string
		body        []byte
		contentType string
		encoding    string
		status      int
		respType    string
	}{
		{name: "JSON_Accepted", body: []byte(testTraceJSON), contentType: "application/json", status: http.StatusOK, respType: "application/json"},
		{name: "Protobuf_Accepted", body: protobuf, contentType: "application/x-protobuf", status: http.StatusOK, respType: "application/x-protobuf"},
		{name: "GzipJSON_Accepted", body: gzipped.Bytes(), contentType: "application/json", encoding: "gzip", status: http.StatusOK, respType: "application/json"},
		{name: "InvalidJSON_BadRequest", body: []byte(`{"resourceSpans":`), contentType: "application/json", status: http.StatusBadRequest},
		{name: "InvalidProtobuf_BadRequest", body: []byte{0xff, 0xff, 0xff}, contentType: "application/x-protobuf", status: http.StatusBadRequest},
		{name: "UnsupportedType_BadRequest", body: []byte(testTraceJSON), contentType: "application/xml", status: http.StatusBadRequest},
		{name: "TooLarge_BadRequest", body: bytes.Repeat([]byte(" "), 5000), contentType: "application/json", status: http.StatusBadRequest},
		{name: "GzipBomb_BadRequest", body: bomb.Bytes(), contentType: "application/json", encoding: "gzip", status: http.StatusBadRequest},
		{name: "UnsupportedEncoding_BadRequest", body: []byte(testTraceJSON), contentType: "application/json", encoding: "br", status: http.StatusBadRequest},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			headers := map[string]string{"Content-Type": testCase.contentType, KeyHeader: fixture.key}
			if testCase.encoding != "" {
				headers["Content-Encoding"] = testCase.encoding
			}

			response := fixture.do(http.MethodPost, "/rum/v1/traces", bytes.NewReader(testCase.body), headers)
			assert.Equal(t, testCase.status, response.Code, response.Body.String())
			if testCase.respType != "" {
				assert.Equal(t, testCase.respType, response.Header().Get("Content-Type"))
			}
		})
	}

	forwarded := fixture.collector.received("/v1/traces")
	require.Len(t, forwarded, 3)
	received := ptraceotlp.NewExportRequest()
	require.NoError(t, received.UnmarshalProto(forwarded[0]))
	resourceSpans := received.Traces().ResourceSpans().At(0)
	span := resourceSpans.ScopeSpans().At(0).Spans().At(0)

	assert.Equal(t, "GET /search", span.Name())
	url, _ := span.Attributes().Get("url.full")
	assert.Equal(t, "https://shop.example.com/search?page=2", url.Str())
	applicationID, _ := resourceSpans.Resource().Attributes().Get(rumtypes.AttributeApplicationID)
	assert.Equal(t, fixture.appID, applicationID.Str())
	platform, _ := resourceSpans.Resource().Attributes().Get(rumtypes.AttributePlatform)
	assert.Equal(t, "web", platform.Str())
}

func TestGatewayLogsEventName(t *testing.T) {
	fixture := newGatewayFixture(t, nil)

	response := fixture.do(http.MethodPost, "/rum/v1/logs", strings.NewReader(testLogJSON), map[string]string{"Content-Type": "application/json", KeyHeader: fixture.key})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())

	forwarded := fixture.collector.received("/v1/logs")
	require.Len(t, forwarded, 1)
	received := plogotlp.NewExportRequest()
	require.NoError(t, received.UnmarshalProto(forwarded[0]))
	record := received.Logs().ResourceLogs().At(0).ScopeLogs().At(0).LogRecords().At(0)
	eventName, ok := record.Attributes().Get(rumtypes.AttributeEventName)
	require.True(t, ok)
	assert.Equal(t, "exception", eventName.Str())
}

func TestGatewayCollectorFailures(t *testing.T) {
	testCases := []struct {
		name            string
		collectorStatus int
		stopCollector   bool
		status          int
	}{
		{name: "CollectorBusy_ServiceUnavailable", collectorStatus: http.StatusServiceUnavailable, status: http.StatusServiceUnavailable},
		{name: "CollectorThrottles_TooManyRequests", collectorStatus: http.StatusTooManyRequests, status: http.StatusTooManyRequests},
		{name: "CollectorError_BadGateway", collectorStatus: http.StatusInternalServerError, status: http.StatusBadGateway},
		{name: "CollectorRefuses_BadRequest", collectorStatus: http.StatusBadRequest, status: http.StatusBadRequest},
		{name: "CollectorDown_ServiceUnavailable", stopCollector: true, status: http.StatusServiceUnavailable},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newGatewayFixture(t, nil)
			fixture.collector.status = testCase.collectorStatus
			if testCase.stopCollector {
				fixture.collector.server.Close()
			}

			response := fixture.do(http.MethodPost, "/rum/v1/traces", strings.NewReader(testTraceJSON), map[string]string{"Content-Type": "application/json", KeyHeader: fixture.key})
			assert.Equal(t, testCase.status, response.Code, response.Body.String())
		})
	}
}

func TestGatewayDisabled(t *testing.T) {
	fixture := newGatewayFixture(t, func(config *rumapplication.Config) { config.Enabled = false })

	response := fixture.do(http.MethodPost, "/rum/v1/traces", strings.NewReader(testTraceJSON), map[string]string{"Content-Type": "application/json", KeyHeader: fixture.key})
	assert.Equal(t, http.StatusNotFound, response.Code)
	assert.Empty(t, fixture.collector.received("/v1/traces"))
}
