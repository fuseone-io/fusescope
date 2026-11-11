package parityrun

import (
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type apiServer struct {
	server *httptest.Server
	status int
	calls  []*http.Request
	bodies []map[string]any
}

func newAPIServer(t *testing.T) (*apiServer, SecretKeyStore) {
	t.Helper()
	a := &apiServer{status: http.StatusCreated}
	a.server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		a.calls, a.bodies = append(a.calls, r), append(a.bodies, body)
		w.WriteHeader(a.status)
	}))
	t.Cleanup(a.server.Close)
	dir := t.TempDir()
	ca := filepath.Join(dir, "ca.crt")
	require.NoError(t, os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: a.server.Certificate().Raw}), 0o600))
	token := filepath.Join(dir, "token")
	require.NoError(t, os.WriteFile(token, []byte("sa-token\n"), 0o600))
	store, err := NewSecretKeyStore(SecretKeyStoreConfig{APIServer: a.server.URL, Namespace: "parity", TokenFile: token, CAFile: ca, Expiry: 90 * 24 * time.Hour})
	require.NoError(t, err)
	store.now = func() time.Time { return time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC) }
	return a, store
}

func TestTheRunKeyIsWrittenOnceAsAnImmutableSecret(t *testing.T) {
	a, store := newAPIServer(t)
	key := []byte("0123456789abcdef0123456789abcdef")
	require.NoError(t, store.Store(t.Context(), "parity-run-20261111t120000z-7", key))
	require.Len(t, a.calls, 1)
	call, body := a.calls[0], a.bodies[0]
	assert.Equal(t, http.MethodPost, call.Method)
	assert.Equal(t, "/api/v1/namespaces/parity/secrets", call.URL.Path)
	assert.Equal(t, "Bearer sa-token", call.Header.Get("Authorization"))
	assert.Equal(t, true, body["immutable"])
	meta := body["metadata"].(map[string]any)
	assert.Equal(t, "parity-run-20261111t120000z-7", meta["name"])
	assert.Equal(t, "20270209", meta["labels"].(map[string]any)["fusescope.io/parity-expires-on"], "90 days on, for the cleanup job")
	assert.Equal(t, base64.StdEncoding.EncodeToString(key), body["data"].(map[string]any)["key"])
}

func TestTheServiceAccountTokenIsReadAgainEveryTime(t *testing.T) {
	a, store := newAPIServer(t)
	require.NoError(t, store.Store(t.Context(), "parity-run-a", make([]byte, 32)))
	require.NoError(t, os.WriteFile(store.cfg.TokenFile, []byte("rotated"), 0o600))
	require.NoError(t, store.Store(t.Context(), "parity-run-b", make([]byte, 32)))
	assert.Equal(t, "Bearer rotated", a.calls[1].Header.Get("Authorization"))
}

func TestAnythingButCreatedFailsClosed(t *testing.T) {
	for _, status := range []int{http.StatusConflict, http.StatusOK, http.StatusForbidden, http.StatusInternalServerError} {
		a, store := newAPIServer(t)
		a.status = status
		assert.Error(t, store.Store(t.Context(), "parity-run-a", make([]byte, 32)), status)
		assert.Len(t, a.calls, 1, "%d: never retried", status)
	}
	a, store := newAPIServer(t)
	a.server.Close()
	assert.Error(t, store.Store(t.Context(), "parity-run-a", make([]byte, 32)), "an unreachable API server")
}

func TestASecretKeyStoreIsConfiguredWhole(t *testing.T) {
	good := SecretKeyStoreConfig{APIServer: "https://10.0.0.1:443", Namespace: "parity", TokenFile: "/t", CAFile: "/c", Expiry: time.Hour}
	for name, change := range map[string]func(*SecretKeyStoreConfig){
		"plain http":   func(c *SecretKeyStoreConfig) { c.APIServer = "http://10.0.0.1" },
		"no namespace": func(c *SecretKeyStoreConfig) { c.Namespace = "" },
		"no token":     func(c *SecretKeyStoreConfig) { c.TokenFile = "" },
		"no CA":        func(c *SecretKeyStoreConfig) { c.CAFile = "" },
		"no expiry":    func(c *SecretKeyStoreConfig) { c.Expiry = 0 },
	} {
		c := good
		change(&c)
		_, err := NewSecretKeyStore(c)
		assert.Error(t, err, name)
	}
}
