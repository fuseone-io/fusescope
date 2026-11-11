package parityrun

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTheRoundsMetricsArePushedWholeWithAToken(t *testing.T) {
	var method, path, auth, body string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method, path, auth = r.Method, r.URL.Path, r.Header.Get("Authorization")
		raw, _ := io.ReadAll(r.Body)
		body = string(raw)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	token := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(token, []byte("s3cret\n"), 0o600))
	p, err := NewPushgateway(server.URL, token, server.Client())
	require.NoError(t, err)
	m := NewMetrics()
	m.Pair("services", "match", "", "")
	require.NoError(t, p.Push(context.Background(), m.Registry()))
	assert.Equal(t, http.MethodPut, method, "Push replaces the group; Add would merge stale series")
	assert.Equal(t, "/metrics/job/fusescope_parity", path, "one fixed group: no tenant, run or parameter")
	assert.Equal(t, "Bearer s3cret", auth, "the token is read from its file")
	assert.Contains(t, body, "fusescope_parity_pairs_total")

	require.NoError(t, os.WriteFile(token, []byte("rotated"), 0o600))
	require.NoError(t, p.Push(context.Background(), m.Registry()))
	assert.Equal(t, "Bearer rotated", auth, "and read again on every push")
}

func TestAPushgatewayIsReachedOverTLSOnly(t *testing.T) {
	_, err := NewPushgateway("http://pushgateway:9091", "/token", nil)
	assert.Error(t, err)
	_, err = NewPushgateway("https://pushgateway:9091", "", nil)
	assert.Error(t, err, "an authenticated transport")
}

func TestAPushThePushgatewayRefusesIsAnError(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	defer server.Close()
	token := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(token, []byte("x"), 0o600))
	p, err := NewPushgateway(server.URL, token, server.Client())
	require.NoError(t, err)
	assert.Error(t, p.Push(context.Background(), NewMetrics().Registry()))
}
