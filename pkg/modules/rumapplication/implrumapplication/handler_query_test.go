package implrumapplication

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func serveQuery(t *testing.T, handle http.HandlerFunc, orgID valuer.UUID, target string, vars map[string]string) (int, json.RawMessage) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	req = req.WithContext(authtypes.NewContextWithClaims(req.Context(), authtypes.Claims{OrgID: orgID.StringValue(), Email: "viewer@example.com"}))
	req = mux.SetURLVars(req, vars)

	recorder := httptest.NewRecorder()
	handle(recorder, req)

	body := struct {
		Data  json.RawMessage `json:"data"`
		Error json.RawMessage `json:"error"`
	}{}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	if recorder.Code != http.StatusOK {
		return recorder.Code, body.Error
	}
	return recorder.Code, body.Data
}

// anyArgs matches any n bound arguments; the SQL text is what the tests check.
func anyArgs(n int) []any {
	return make([]any, n)
}

func TestHandlerQueryRejects(t *testing.T) {
	module, orgID, mock := newTestModuleWithMock(t, true)
	created, err := module.Create(context.Background(), orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	handler := NewHandler(module)
	application := created.ID.StringValue()

	testCases := []struct {
		name     string
		handle   http.HandlerFunc
		target   string
		vars     map[string]string
		expected int
	}{
		{name: "ListViews_UnknownApplication_NotFound", handle: handler.ListViews, target: "/views", vars: map[string]string{"id": valuer.GenerateUUID().StringValue()}, expected: http.StatusNotFound},
		{name: "ListViews_StartAfterEnd_BadRequest", handle: handler.ListViews, target: "/views?start=2000&end=1000", vars: map[string]string{"id": application}, expected: http.StatusBadRequest},
		{name: "ListViews_RangeTooLong_BadRequest", handle: handler.ListViews, target: "/views?start=1&end=2700000000000", vars: map[string]string{"id": application}, expected: http.StatusBadRequest},
		{name: "ListViews_LimitTooHigh_BadRequest", handle: handler.ListViews, target: "/views?limit=501", vars: map[string]string{"id": application}, expected: http.StatusBadRequest},
		{name: "ListViews_NotANumber_BadRequest", handle: handler.ListViews, target: "/views?start=yesterday", vars: map[string]string{"id": application}, expected: http.StatusBadRequest},
		{name: "GetView_BadEscape_BadRequest", handle: handler.GetView, target: "/views/x", vars: map[string]string{"id": application, "route": "%zz"}, expected: http.StatusBadRequest},
		{name: "GetErrorGroup_BadFingerprint_BadRequest", handle: handler.GetErrorGroup, target: "/errors/x", vars: map[string]string{"id": application, "fingerprint": "not-a-fingerprint"}, expected: http.StatusBadRequest},
		{name: "ListSessions_MinAboveMax_BadRequest", handle: handler.ListSessions, target: "/sessions?minDurationMs=10&maxDurationMs=5", vars: map[string]string{"id": application}, expected: http.StatusBadRequest},
		{name: "GetSession_OtherOrg_NotFound", handle: handler.GetSession, target: "/sessions/s1", vars: map[string]string{"id": valuer.GenerateUUID().StringValue(), "sessionId": "s1"}, expected: http.StatusNotFound},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			status, _ := serveQuery(t, testCase.handle, orgID, testCase.target, testCase.vars)
			assert.Equal(t, testCase.expected, status)
		})
	}
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestHandlerListViewsMergesRouteQueries(t *testing.T) {
	module, orgID, mock := newTestModuleWithMock(t, true)
	created, err := module.Create(context.Background(), orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	mock.ExpectQuery(`groupUniqArrayIf\(3\)\(path, path != ''\) AS paths FROM \(SELECT .* FROM .signoz_traces.\..distributed_signoz_index_v3. WHERE resource_fingerprint GLOBAL IN \(SELECT fingerprint FROM .signoz_traces.\..distributed_traces_v3_resource. WHERE labels LIKE \?`).WithArgs(anyArgs(10)...).WillReturnRows(cmock.NewRows(
		[]cmock.ColumnType{{Name: "route", Type: "String"}, {Name: "views", Type: "UInt64"}, {Name: "page_loads", Type: "UInt64"}, {Name: "route_changes", Type: "UInt64"}, {Name: "unknown_loads", Type: "UInt64"}, {Name: "median_ns", Type: "Float64"}, {Name: "paths", Type: "Array(String)"}},
		[][]any{{"/product/:id", uint64(10), uint64(4), uint64(5), uint64(1), float64(2e9), []string{}}, {"/cart", uint64(3), uint64(0), uint64(3), uint64(0), float64(5e8), []string{}}},
	))
	mock.ExpectQuery(`quantile\(0\.75\)\(value\) AS p75, .* FROM .signoz_logs.\..distributed_logs_v2.`).WithArgs(anyArgs(10)...).WillReturnRows(cmock.NewRows(
		[]cmock.ColumnType{{Name: "route", Type: "String"}, {Name: "event", Type: "String"}, {Name: "vital", Type: "String"}, {Name: "bucket", Type: "UInt64"}, {Name: "samples", Type: "UInt64"}, {Name: "p75", Type: "Float64"}, {Name: "good", Type: "UInt64"}, {Name: "needs_improvement", Type: "UInt64"}, {Name: "poor", Type: "UInt64"}},
		[][]any{
			{"/product/:id", rumtypes.EventNameWebVital, "lcp", uint64(0), uint64(4), float64(3420), uint64(2), uint64(1), uint64(1)},
			{"/product/:id", rumtypes.EventNameWebVital, "ttfb", uint64(0), uint64(4), float64(380), uint64(4), uint64(0), uint64(0)},
			{"/product/:id", rumtypes.EventNameException, "", uint64(0), uint64(7), float64(0), uint64(0), uint64(0), uint64(0)},
		},
	))
	mock.ExpectQuery(`argMax\(method, \(p75, calls, method, host, path\)\)`).WithArgs(anyArgs(10)...).WillReturnRows(cmock.NewRows(
		[]cmock.ColumnType{{Name: "route", Type: "String"}, {Name: "method", Type: "String"}, {Name: "host", Type: "String"}, {Name: "path", Type: "String"}, {Name: "p75", Type: "Float64"}, {Name: "calls", Type: "UInt64"}, {Name: "failed", Type: "UInt64"}, {Name: "trace", Type: "String"}},
		[][]any{{"/product/:id", "GET", "shop.example.com", "/api/products/:id", float64(1.24e9), uint64(9), uint64(1), "4bf92f3577b34da6a3ce929d0e0e4736"}},
	))

	status, data := serveQuery(t, NewHandler(module).ListViews, orgID, "/views", map[string]string{"id": created.ID.StringValue()})
	require.Equal(t, http.StatusOK, status, string(data))

	views := new(rumtypes.GettableViews)
	require.NoError(t, json.Unmarshal(data, views))
	require.Len(t, views.Routes, 2)

	product := views.Routes[0]
	assert.Equal(t, "/product/:id", product.Route)
	assert.Equal(t, rumtypes.ViewCounts{Views: 10, PageLoads: 4, RouteChanges: 5, UnknownLoads: 1}, product.ViewCounts)
	assert.Equal(t, float64(2000), product.MedianTimeOnViewMs)
	assert.Equal(t, int64(7), product.Errors)
	require.NotNil(t, product.LCP)
	assert.Equal(t, rumtypes.VitalSummary{Name: rumtypes.VitalNameLCP, Samples: 4, P75: 3420, Good: 2, NeedsImprovement: 1, Poor: 1}, *product.LCP)
	assert.Nil(t, product.INP)
	require.NotNil(t, product.SlowestRequest)
	assert.Equal(t, rumtypes.RequestTemplateLatency{RequestTemplate: rumtypes.RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/api/products/:id"}, P75Ms: 1240, Calls: 9}, *product.SlowestRequest)

	cart := views.Routes[1]
	assert.Nil(t, cart.LCP)
	assert.Nil(t, cart.SlowestRequest)
	assert.Zero(t, cart.Errors)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestHandlerListErrorGroupsMergesKeysByFingerprint(t *testing.T) {
	module, orgID, mock := newTestModuleWithMock(t, true)
	created, err := module.Create(context.Background(), orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	keyColumns := []cmock.ColumnType{{Name: "key", Type: "UInt64"}, {Name: "type", Type: "String"}, {Name: "normalized_message", Type: "String"}, {Name: "frame_line", Type: "String"}, {Name: "first_seen", Type: "UInt64"}, {Name: "first_fingerprint", Type: "String"}}
	mock.ExpectQuery(`SELECT cityHash64\(type, normalized_message, frame_line\) AS key`).WithArgs(anyArgs(10)...).WillReturnRows(cmock.NewRows(keyColumns, [][]any{
		{uint64(11), "TypeError", "x is undefined", "    at Ue (https://shop.example.com/assets/main.4f9c2a.js:1:100)", uint64(2_000_000_000), "fp-new"},
		{uint64(12), "TypeError", "x is undefined", "    at Ue (https://shop.example.com/assets/main.71be04.js:1:900)", uint64(1_000_000_000), "fp-old"},
		{uint64(13), "RangeError", "Invalid time value", "", uint64(3_000_000_000), "fp-new"},
	}))
	mock.ExpectQuery(`FROM .signoz_logs.\..distributed_logs_v2_resource. WHERE .* GROUP BY fingerprint LIMIT \?`).WithArgs(anyArgs(5)...).WillReturnRows(cmock.NewRows(
		[]cmock.ColumnType{{Name: "fingerprint", Type: "String"}, {Name: "release", Type: "String"}, {Name: "environment", Type: "String"}, {Name: "ua", Type: "String"}, {Name: "brands", Type: "String"}, {Name: "platform", Type: "String"}, {Name: "client_key", Type: "UInt64"}, {Name: "first_seen", Type: "Int64"}},
		[][]any{{"fp-old", "1.7.4", "production", "", "", "", uint64(1), int64(500)}, {"fp-new", "1.8.0", "production", "", "", "", uint64(2), int64(1500)}},
	))
	mock.ExpectQuery(`transform\(cityHash64\(type, normalized_message, frame_line\), \?, \?, toUInt16\(0\)\) AS group_index`).WithArgs(anyArgs(15)...).WillReturnRows(cmock.NewRows(
		[]cmock.ColumnType{{Name: "group_index", Type: "UInt16"}, {Name: "events", Type: "UInt64"}, {Name: "sessions", Type: "UInt64"}, {Name: "first", Type: "UInt64"}, {Name: "last", Type: "UInt64"}, {Name: "message", Type: "String"}, {Name: "route", Type: "String"}, {Name: "source", Type: "String"}, {Name: "frame_line", Type: "String"}, {Name: "last_release", Type: "String"}, {Name: "releases", Type: "Array(String)"}, {Name: "sparkline", Type: "Map(UInt64, UInt64)"}},
		[][]any{
			{uint16(1), uint64(5), uint64(3), uint64(4_000_000_000), uint64(9_000_000_000), "x is undefined", "/cart", "onerror", "    at Ue (https://shop.example.com/assets/main.4f9c2a.js:1:100)", "1.8.0", []string{"1.8.0", "1.7.4"}, map[uint64]uint64{}},
			{uint16(2), uint64(9), uint64(9), uint64(3_000_000_000), uint64(8_000_000_000), "Invalid time value", "/checkout", "error", "", "1.8.0", []string{"1.8.0"}, map[uint64]uint64{}},
		},
	))

	status, data := serveQuery(t, NewHandler(module).ListErrorGroups, orgID, "/errors", map[string]string{"id": created.ID.StringValue()})
	require.Equal(t, http.StatusOK, status, string(data))

	groups := new(rumtypes.GettableErrorGroups)
	require.NoError(t, json.Unmarshal(data, groups))
	assert.Equal(t, int64(2), groups.Total)
	assert.Equal(t, int64(14), groups.Events)
	require.Len(t, groups.Groups, 2)

	rangeError, typeError := groups.Groups[0], groups.Groups[1]
	assert.Equal(t, rumtypes.NewErrorFingerprint("RangeError", "Invalid time value", ""), rangeError.Fingerprint)
	assert.True(t, rangeError.NewInRelease)
	assert.Nil(t, rangeError.TopFrame)

	assert.Equal(t, rumtypes.NewErrorFingerprint("TypeError", "x is undefined", "    at Ue (https://shop.example.com/assets/main.71be04.js:1:900)"), typeError.Fingerprint)
	assert.Equal(t, int64(1), typeError.FirstSeenAt.Unix())
	assert.Equal(t, "1.7.4", typeError.FirstSeenRelease)
	assert.Equal(t, "1.8.0", typeError.LastSeenRelease)
	assert.Equal(t, []string{"1.7.4", "1.8.0"}, typeError.Releases)
	assert.False(t, typeError.NewInRelease)
	require.NotNil(t, typeError.TopFrame)
	assert.Equal(t, "Ue", typeError.TopFrame.Function)
	assert.NoError(t, mock.ExpectationsWereMet())
}
