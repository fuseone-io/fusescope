package parityinvestigate

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
)

// collector answers an OTLP logs export as answer says, and keeps the logs it was sent.
func collector(t *testing.T, answer func(w http.ResponseWriter)) (*httptest.Server, *[]plogotlp.ExportRequest, *[]string) {
	t.Helper()
	var got []plogotlp.ExportRequest
	var auth []string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/logs", r.URL.Path)
		assert.Equal(t, "application/x-protobuf", r.Header.Get("Content-Type"))
		auth = append(auth, r.Header.Get("Authorization"))
		raw, _ := io.ReadAll(r.Body)
		req := plogotlp.NewExportRequest()
		require.NoError(t, req.UnmarshalProto(raw))
		got = append(got, req)
		answer(w)
	}))
	t.Cleanup(server.Close)
	return server, &got, &auth
}

func respond(w http.ResponseWriter, rejected int64, message string) {
	resp := plogotlp.NewExportResponse()
	if rejected > 0 || message != "" {
		resp.PartialSuccess().SetRejectedLogRecords(rejected)
		resp.PartialSuccess().SetErrorMessage(message)
	}
	raw, _ := resp.MarshalProto()
	w.Header().Set("Content-Type", "application/x-protobuf")
	_, _ = w.Write(raw)
}

func sink(t *testing.T, server *httptest.Server) AuditSink {
	t.Helper()
	token := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(token, []byte("audit-token\n"), 0o600))
	s, err := NewAuditSink(server.URL, token, server.Client())
	require.NoError(t, err)
	return s
}

var session = Session{
	ID:       "0123456789abcdef0123456789abcdef",
	Operator: Operator{Issuer: issuer, Subject: "u-123", Email: "ana@example.com"},
	RunID:    "20261111t120000z-7", Tenant: "0190f3a1-7b2c-7d4e-9f00-112233445566", Class: "settled",
	Start: time.Unix(1_700_000_000, 0), End: time.Unix(1_700_003_600, 0),
}

func TestAnAuditEventIsConfirmedByTheCollectorsAnswer(t *testing.T) {
	server, got, auth := collector(t, func(w http.ResponseWriter) { respond(w, 0, "") })
	require.NoError(t, sink(t, server).Emit(t.Context(), session, PhaseStarted, 0))
	require.Len(t, *got, 1)
	assert.Equal(t, []string{"Bearer audit-token"}, *auth)
	logs := (*got)[0].Logs()
	require.Equal(t, 1, logs.LogRecordCount())
	record := logs.ResourceLogs().At(0).ScopeLogs().At(0).LogRecords().At(0)
	assert.Equal(t, "parity.investigation.started", record.EventName())
	attrs := record.Attributes().AsRaw()
	assert.Equal(t, issuer, attrs["fusescope.audit.principal.issuer"])
	assert.Equal(t, "u-123", attrs["fusescope.audit.principal.subject"], "issuer and subject apart")
	assert.Equal(t, session.ID, attrs["fusescope.audit.session_id"])
	assert.Equal(t, session.RunID, attrs["fusescope.parity.run_id"])
	assert.Equal(t, session.Tenant, attrs["fusescope.parity.tenant"])
	assert.Equal(t, "parity.investigate", attrs["fusescope.audit.action"])
}

func TestAnAuditEventTheCollectorDoesNotTakeWholeIsRefused(t *testing.T) {
	for name, answer := range map[string]func(http.ResponseWriter){
		"a rejected record":  func(w http.ResponseWriter) { respond(w, 1, "") },
		"an error message":   func(w http.ResponseWriter) { respond(w, 0, "audit pipeline degraded") },
		"a server error":     func(w http.ResponseWriter) { w.WriteHeader(http.StatusServiceUnavailable) },
		"no protobuf answer": func(w http.ResponseWriter) { _, _ = w.Write([]byte("ok")) },
	} {
		server, _, _ := collector(t, answer)
		assert.Error(t, sink(t, server).Emit(t.Context(), session, PhaseStarted, 0), name)
	}
}

func TestAnAuditSinkIsReachedOverTLSWithAToken(t *testing.T) {
	_, err := NewAuditSink("http://collector:4318", "/token", nil)
	assert.Error(t, err)
	_, err = NewAuditSink("https://collector:4318", "", nil)
	assert.Error(t, err)

	server, _, _ := collector(t, func(w http.ResponseWriter) { respond(w, 0, "") })
	token := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(token, []byte("  \n"), 0o600))
	s, err := NewAuditSink(server.URL, token, server.Client())
	require.NoError(t, err)
	assert.Error(t, s.Emit(t.Context(), session, PhaseStarted, 0), "never sent unauthenticated")
}

func TestTheClosingEventCarriesWhatWasShown(t *testing.T) {
	server, got, _ := collector(t, func(w http.ResponseWriter) { respond(w, 0, "") })
	require.NoError(t, sink(t, server).Emit(t.Context(), session, PhaseCompleted, 3))
	record := (*got)[0].Logs().ResourceLogs().At(0).ScopeLogs().At(0).LogRecords().At(0)
	assert.Equal(t, "parity.investigation.completed", record.EventName())
	assert.EqualValues(t, 3, record.Attributes().AsRaw()["fusescope.parity.differences_shown"])
}
