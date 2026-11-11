package parityrun

import (
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type keySecret struct {
	name, uid  string
	expiresAt  *string
	uidChanged bool
	failDelete bool
}

// keyAPI serves the Secrets of the run keys' namespace, a page of pageSize at a time, and records
// every delete with its preconditions.
type keyAPI struct {
	mu       sync.Mutex
	secrets  []keySecret
	pageSize int
	lists    []string
	deletes  map[string]string
	failList bool
}

func (a *keyAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	switch r.Method {
	case http.MethodGet:
		a.lists = append(a.lists, r.URL.RawQuery)
		if a.failList {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		start := 0
		if c := r.URL.Query().Get("continue"); c != "" {
			start = len(c)
		}
		end := min(start+a.pageSize, len(a.secrets))
		var items []map[string]any
		for _, s := range a.secrets[start:end] {
			meta := map[string]any{"name": s.name, "uid": s.uid}
			if s.expiresAt != nil {
				meta["annotations"] = map[string]string{"fusescope.io/parity-expires-at": *s.expiresAt}
			}
			items = append(items, map[string]any{"metadata": meta})
		}
		next := ""
		if end < len(a.secrets) {
			next = strings.Repeat("x", end)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"items": items, "metadata": map[string]any{"continue": next}})
	case http.MethodDelete:
		name := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		raw, _ := io.ReadAll(r.Body)
		var opts struct {
			Preconditions struct {
				UID string `json:"uid"`
			} `json:"preconditions"`
		}
		_ = json.Unmarshal(raw, &opts)
		a.deletes[name] = opts.Preconditions.UID
		for _, s := range a.secrets {
			if s.name == name && s.uidChanged {
				w.WriteHeader(http.StatusConflict)
				return
			}
			if s.name == name && s.failDelete {
				w.WriteHeader(http.StatusForbidden)
				return
			}
		}
		w.WriteHeader(http.StatusOK)
	}
}

func str(s string) *string { return &s }

func cleaner(t *testing.T, api *keyAPI) SecretCleaner {
	t.Helper()
	server := httptest.NewTLSServer(api)
	t.Cleanup(server.Close)
	dir := t.TempDir()
	ca := filepath.Join(dir, "ca.crt")
	require.NoError(t, os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}), 0o600))
	token := filepath.Join(dir, "token")
	require.NoError(t, os.WriteFile(token, []byte("cleanup-token"), 0o600))
	c, err := NewSecretCleaner(SecretKeyStoreConfig{APIServer: server.URL, Namespace: "parity-run-keys", TokenFile: token, CAFile: ca, Expiry: time.Hour})
	require.NoError(t, err)
	c.now = func() time.Time { return time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC) }
	return c
}

func TestOnlyExpiredRunKeysAreDeletedWithTheirUID(t *testing.T) {
	api := &keyAPI{pageSize: 2, deletes: map[string]string{}, secrets: []keySecret{
		{name: "parity-run-old", uid: "u-1", expiresAt: str("2026-11-10T12:00:00Z")},
		{name: "parity-run-new", uid: "u-2", expiresAt: str("2027-02-09T12:00:00Z")},
		{name: "parity-run-older", uid: "u-3", expiresAt: str("2026-08-01T00:00:00Z")},
		{name: "parity-run-unlabelled", uid: "u-4"},
		{name: "parity-run-garbled", uid: "u-5", expiresAt: str("next tuesday")},
	}}
	report, err := cleaner(t, api).Clean(t.Context())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"parity-run-old", "parity-run-older"}, report.Deleted)
	assert.ElementsMatch(t, []string{"parity-run-unlabelled", "parity-run-garbled"}, report.Kept, "no readable expiry: kept and reported")
	assert.Equal(t, map[string]string{"parity-run-old": "u-1", "parity-run-older": "u-3"}, api.deletes, "each delete is conditioned on the UID listed")
	require.Len(t, api.lists, 3, "every page is read")
	assert.Contains(t, api.lists[0], "labelSelector=app.kubernetes.io%2Fname%3Dfusescope-parity")
}

func TestARunKeyReplacedSinceItWasListedIsNotDeleted(t *testing.T) {
	api := &keyAPI{pageSize: 10, deletes: map[string]string{}, secrets: []keySecret{
		{name: "parity-run-old", uid: "u-1", expiresAt: str("2026-11-10T12:00:00Z"), uidChanged: true},
	}}
	report, err := cleaner(t, api).Clean(t.Context())
	require.NoError(t, err)
	assert.Empty(t, report.Deleted)
	assert.Equal(t, []string{"parity-run-old"}, report.Conflicts)
}

func TestACleanupThatCannotListDeletesNothing(t *testing.T) {
	api := &keyAPI{pageSize: 10, deletes: map[string]string{}, failList: true, secrets: []keySecret{{name: "parity-run-old", uid: "u-1", expiresAt: str("2026-11-10T12:00:00Z")}}}
	_, err := cleaner(t, api).Clean(t.Context())
	assert.Error(t, err)
	assert.Empty(t, api.deletes)
}

func TestACleanupStopsAtADeleteThatFails(t *testing.T) {
	api := &keyAPI{pageSize: 10, deletes: map[string]string{}, secrets: []keySecret{
		{name: "parity-run-forbidden", uid: "u-1", expiresAt: str("2026-11-10T12:00:00Z"), failDelete: true},
		{name: "parity-run-old", uid: "u-2", expiresAt: str("2026-11-10T12:00:00Z")},
	}}
	report, err := cleaner(t, api).Clean(t.Context())
	require.Error(t, err)
	assert.Empty(t, report.Deleted)
	assert.NotContains(t, api.deletes, "parity-run-old")
}
