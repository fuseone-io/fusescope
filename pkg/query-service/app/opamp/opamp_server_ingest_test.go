package opamp

import (
	"log/slog"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/query-service/app/opamp/ingest"
)

func TestAuthenticateIngest(t *testing.T) {
	const token = "ingest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	path := filepath.Join(t.TempDir(), "tokens")
	require.NoError(t, os.WriteFile(path, []byte(token+"\n"), 0o600))
	tokens, err := ingest.LoadTokens(path)
	require.NoError(t, err)

	withHeader := func(authorization string) bool {
		srv := &Server{logger: slog.New(slog.DiscardHandler)}
		srv.WithIngest(ingest.NewHub(nil, slog.New(slog.DiscardHandler)), nil, tokens)
		req := httptest.NewRequest("GET", "/v1/opamp", nil)
		if authorization != "" {
			req.Header.Set("Authorization", authorization)
		}
		return srv.authenticateIngest(req)
	}
	assert.True(t, withHeader("Bearer "+token))
	assert.False(t, withHeader(""), "no token: remote configuration only")
	assert.False(t, withHeader("Bearer ingest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb"))

	disabled := &Server{logger: slog.New(slog.DiscardHandler)}
	req := httptest.NewRequest("GET", "/v1/opamp", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	assert.False(t, disabled.authenticateIngest(req), "nothing is published without tokens configured")
}

func TestReportPage(t *testing.T) {
	page := []byte(`{"schemaVersion":1}`)
	report := &protobufs.AgentToServer{CustomMessage: &protobufs.CustomMessage{Capability: ingestpolicy.Capability, Type: ingestpolicy.TypeReport, Data: page}}
	tests := []struct {
		name                  string
		msg                   *protobufs.AgentToServer
		authenticated, ownUID bool
		want                  bool
	}{
		{"report", report, true, true, true},
		{"unauthenticated", report, false, true, false},
		{"no UID of its own", report, true, false, false},
		{"no custom message", &protobufs.AgentToServer{}, true, true, false},
		{"another type", &protobufs.AgentToServer{CustomMessage: &protobufs.CustomMessage{Capability: ingestpolicy.Capability, Type: ingestpolicy.TypeReportAck, Data: page}}, true, true, false},
		{"another capability", &protobufs.AgentToServer{CustomMessage: &protobufs.CustomMessage{Capability: "io.example", Type: ingestpolicy.TypeReport, Data: page}}, true, true, false},
	}
	for _, test := range tests {
		got, ok := reportPage(test.msg, test.authenticated, test.ownUID)
		assert.Equal(t, test.want, ok, test.name)
		if test.want {
			assert.Equal(t, page, got, test.name)
		}
	}
}
