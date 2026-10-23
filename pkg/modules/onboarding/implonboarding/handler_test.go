package implonboarding

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func serve(t *testing.T, handle http.HandlerFunc, method string, target string, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Host = "fusescope.local:8080"
	req = req.WithContext(authtypes.NewContextWithClaims(req.Context(), authtypes.Claims{OrgID: valuer.GenerateUUID().StringValue(), Email: "admin@example.com"}))

	recorder := httptest.NewRecorder()
	handle(recorder, req)

	response := map[string]any{}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	return recorder.Code, response
}

func TestHandler_GetStatus(t *testing.T) {
	module, mock := newTestModule(t, global.Config{}, "")
	mock.ExpectQuery(`distributed_logs_v2`).WithArgs(make([]any, 4)...).WillReturnRows(cmock.NewRows(logColumns, [][]any{{uint64(2), int64(1761220000000), int64(1761220001000)}}))

	code, response := serve(t, NewHandler(module).GetStatus, http.MethodGet, "/api/v1/onboarding/status?signals=logs", "")
	require.Equal(t, http.StatusOK, code, response)

	data := response["data"].(map[string]any)
	assert.Nil(t, data["traces"])
	assert.Nil(t, data["metrics"])
	assert.Equal(t, map[string]any{"received": true, "count": float64(2), "firstSeen": float64(1761220000000), "lastSeen": float64(1761220001000)}, data["logs"])
}

func TestHandler_GetStatus_InvalidQuery(t *testing.T) {
	module, _ := newTestModule(t, global.Config{}, "")

	testCases := []struct {
		name   string
		target string
	}{
		{name: "UnknownSignal", target: "/api/v1/onboarding/status?signals=profiles"},
		{name: "SinceNotANumber", target: "/api/v1/onboarding/status?since=yesterday"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			code, _ := serve(t, NewHandler(module).GetStatus, http.MethodGet, testCase.target, "")
			assert.Equal(t, http.StatusBadRequest, code)
		})
	}
}

func TestHandler_Ingestion(t *testing.T) {
	module, _ := newTestModule(t, global.Config{}, "")
	handler := NewHandler(module)

	code, response := serve(t, handler.GetIngestion, http.MethodGet, "/api/v1/onboarding/ingestion", "")
	require.Equal(t, http.StatusOK, code, response)
	data := response["data"].(map[string]any)
	assert.Equal(t, "derived", data["source"])
	assert.Equal(t, true, data["derived"])
	assert.Equal(t, "fusescope.local:4317", data["otlpGrpcEndpoint"])
	assert.Equal(t, "http://fusescope.local:4318", data["otlpHttpEndpoint"])
	assert.Equal(t, false, data["authRequired"])
	assert.Contains(t, data, "collector")
	assert.Nil(t, data["collector"])

	code, response = serve(t, handler.UpdateIngestion, http.MethodPut, "/api/v1/onboarding/ingestion", `{"ingestionUrl":"https://otlp.acme.io"}`)
	require.Equal(t, http.StatusOK, code, response)
	data = response["data"].(map[string]any)
	assert.Equal(t, "organization", data["source"])
	assert.Equal(t, "https://otlp.acme.io", data["organizationUrl"])

	code, _ = serve(t, handler.UpdateIngestion, http.MethodPut, "/api/v1/onboarding/ingestion", `{"ingestionUrl":"otlp.acme.io:4317"}`)
	assert.Equal(t, http.StatusBadRequest, code)
}
