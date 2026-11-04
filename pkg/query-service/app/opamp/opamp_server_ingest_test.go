package opamp

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/gorilla/websocket"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/open-telemetry/opamp-go/server"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/query-service/app/opamp/ingest"
	model "github.com/fuseone-io/fusescope/pkg/query-service/app/opamp/model"
)

func TestAuthenticateIngest(t *testing.T) {
	const token = "ingest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	path := filepath.Join(t.TempDir(), "tokens")
	require.NoError(t, os.WriteFile(path, []byte(token+"\n"), 0o600))
	tokens, err := ingest.LoadTokens(path)
	require.NoError(t, err)

	withHeader := func(authorization string, overTLS bool) bool {
		srv := &Server{logger: slog.New(slog.DiscardHandler)}
		srv.WithIngest(ingest.NewHub(nil, slog.New(slog.DiscardHandler)), nil, tokens, "127.0.0.1:0", &tls.Config{})
		req := httptest.NewRequest("GET", "/v1/opamp", nil)
		if authorization != "" {
			req.Header.Set("Authorization", authorization)
		}
		if overTLS {
			req.TLS = &tls.ConnectionState{Version: tls.VersionTLS13}
		}
		return srv.authenticateIngest(req)
	}
	assert.True(t, withHeader("Bearer "+token, true))
	assert.False(t, withHeader("Bearer "+token, false), "a token sent without TLS is never accepted")
	assert.False(t, withHeader("", true), "no token: remote configuration only")
	assert.False(t, withHeader("Bearer ingest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb", true))

	disabled := &Server{logger: slog.New(slog.DiscardHandler)}
	req := httptest.NewRequest("GET", "/v1/opamp", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.TLS = &tls.ConnectionState{Version: tls.VersionTLS13}
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

// fakeProvider counts the subscriptions to configuration updates.
type fakeProvider struct {
	model.AgentConfigProvider
	subscribed atomic.Int32
}

func (p *fakeProvider) SubscribeToConfigUpdates(func()) func() {
	p.subscribed.Add(1)
	return func() { p.subscribed.Add(-1) }
}

// ingestFixture is a Server started with both listeners and tokenA.
type ingestFixture struct {
	srv      *Server
	provider *fakeProvider
	dialer   *websocket.Dialer
	ingest   string
}

func startIngestFixture(t *testing.T, limits ingestLimits) *ingestFixture {
	t.Helper()
	certFile, keyFile, pool := selfSigned(t)
	tlsConfig, err := ingest.ServerTLS(certFile, keyFile, "")
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "tokens")
	require.NoError(t, os.WriteFile(path, []byte(ingestToken+"\n"), 0o600))
	tokens, err := ingest.LoadTokens(path)
	require.NoError(t, err)
	f := &ingestFixture{provider: &fakeProvider{}}
	f.srv = &Server{logger: slog.New(slog.DiscardHandler), agents: &model.Agents{}, agentConfigProvider: f.provider, server: server.New(nil)}
	f.srv.WithIngest(ingest.NewHub(nil, slog.New(slog.DiscardHandler)), nil, tokens, freeAddr(t), tlsConfig)
	f.srv.ingestLimits = limits
	require.NoError(t, f.srv.Start(freeAddr(t)))
	t.Cleanup(f.srv.Stop)
	f.ingest = f.srv.ingestHTTP.Addr().String()
	f.dialer = &websocket.Dialer{TLSClientConfig: &tls.Config{RootCAs: pool, ServerName: "localhost", MinVersion: tls.VersionTLS12}, HandshakeTimeout: 5 * time.Second}
	return f
}

func (f *ingestFixture) dial(authorization string) (*websocket.Conn, *http.Response, error) {
	header := http.Header{}
	if authorization != "" {
		header.Set("Authorization", authorization)
	}
	return f.dialer.Dial("wss://"+f.ingest+"/v1/opamp", header)
}

const ingestToken = "ingest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"

// The ingest listener speaks only TLS 1.3 and admits only a WebSocket with
// an ingest token: anything else is refused at the handshake, before any
// OpAMP message is read.
func TestIngestListenerAdmission(t *testing.T) {
	f := startIngestFixture(t, defaultIngestLimits)

	_, _, err := websocket.DefaultDialer.Dial("ws://"+f.ingest+"/v1/opamp", http.Header{"Authorization": {"Bearer " + ingestToken}})
	assert.Error(t, err, "no plaintext on the ingest listener")

	for _, authorization := range []string{"", "Bearer ingest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb", ingestToken} {
		_, resp, err := f.dial(authorization)
		require.Error(t, err, "%q", authorization)
		require.NotNil(t, resp)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "%q", authorization)
	}

	conn, resp, err := f.dial("Bearer " + ingestToken)
	require.NoError(t, err)
	assert.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)
	assert.Equal(t, uint16(tls.VersionTLS13), conn.UnderlyingConn().(*tls.Conn).ConnectionState().Version)
	_ = conn.Close()

	client := &http.Client{Transport: &http.Transport{TLSClientConfig: f.dialer.TLSClientConfig}, Timeout: 5 * time.Second}
	req, err := http.NewRequest(http.MethodPost, "https://"+f.ingest+"/v1/opamp", strings.NewReader(""))
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+ingestToken)
	req.Header.Set("Content-Type", "application/x-protobuf")
	plain, err := client.Do(req)
	require.NoError(t, err)
	_ = plain.Body.Close()
	assert.Equal(t, http.StatusBadRequest, plain.StatusCode, "the plain HTTP transport, even with a token")
}

// A connection that never completes its handshake is closed at the
// handshake deadline, and an admitted one that goes quiet at the idle one.
func TestIngestListenerDeadlines(t *testing.T) {
	f := startIngestFixture(t, ingestLimits{handshake: 300 * time.Millisecond, idle: 500 * time.Millisecond, connections: 8})

	raw, err := net.Dial("tcp", f.ingest)
	require.NoError(t, err)
	defer raw.Close()
	start := time.Now()
	_ = raw.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, err = raw.Read(make([]byte, 1))
	assert.Error(t, err, "closed by the server")
	assert.Less(t, time.Since(start), 3*time.Second, "at the handshake deadline, not the client's")

	conn, _, err := f.dial("Bearer " + ingestToken)
	require.NoError(t, err)
	defer conn.Close()
	start = time.Now()
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, _, err = conn.ReadMessage()
	assert.Error(t, err, "a quiet WebSocket is closed")
	assert.Less(t, time.Since(start), 3*time.Second)
}

// Connections are bounded from their accept: past the bound, a new one
// waits until one closes.
func TestIngestListenerConnectionBound(t *testing.T) {
	f := startIngestFixture(t, ingestLimits{handshake: 5 * time.Second, idle: 5 * time.Second, connections: 1})

	held, err := net.Dial("tcp", f.ingest)
	require.NoError(t, err)
	time.Sleep(100 * time.Millisecond) // accepted, its handshake pending
	quick := *f.dialer
	quick.HandshakeTimeout = 300 * time.Millisecond
	_, _, err = quick.Dial("wss://"+f.ingest+"/v1/opamp", http.Header{"Authorization": {"Bearer " + ingestToken}})
	assert.Error(t, err, "no slot while the first connection holds it")

	require.NoError(t, held.Close())
	require.Eventually(t, func() bool {
		conn, _, err := f.dial("Bearer " + ingestToken)
		if err != nil {
			return false
		}
		_ = conn.Close()
		return true
	}, 5*time.Second, 50*time.Millisecond, "the slot is released on close")
}

// If the plaintext listener cannot start, the ingest listener and the
// subscription to configuration updates are undone.
func TestStartUndoesOnFailure(t *testing.T) {
	certFile, keyFile, _ := selfSigned(t)
	tlsConfig, err := ingest.ServerTLS(certFile, keyFile, "")
	require.NoError(t, err)
	busy, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer busy.Close()

	provider := &fakeProvider{}
	srv := &Server{logger: slog.New(slog.DiscardHandler), agents: &model.Agents{}, agentConfigProvider: provider, server: server.New(nil)}
	ingestAddr := freeAddr(t)
	srv.WithIngest(ingest.NewHub(nil, slog.New(slog.DiscardHandler)), nil, nil, ingestAddr, tlsConfig)
	require.Error(t, srv.Start(busy.Addr().String()))

	assert.Zero(t, provider.subscribed.Load(), "unsubscribed")
	assert.Nil(t, srv.ingestHTTP)
	require.Eventually(t, func() bool {
		conn, err := net.Dial("tcp", ingestAddr)
		if err == nil {
			_ = conn.Close()
		}
		return err != nil
	}, 5*time.Second, 50*time.Millisecond, "the ingest listener is closed")
}

func freeAddr(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	addr := listener.Addr().String()
	require.NoError(t, listener.Close())
	return addr
}

// selfSigned writes a self-signed certificate for localhost and returns its
// files and a pool trusting it.
func selfSigned(t *testing.T) (string, string, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "localhost"}, DNSNames: []string{"localhost"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IsCA: true, BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	require.NoError(t, err)
	keyDER, err := x509.MarshalECPrivateKey(key)
	require.NoError(t, err)
	dir := t.TempDir()
	certFile, keyFile := filepath.Join(dir, "tls.crt"), filepath.Join(dir, "tls.key")
	require.NoError(t, os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600))
	require.NoError(t, os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0o600))
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	pool := x509.NewCertPool()
	pool.AddCert(cert)
	return certFile, keyFile, pool
}
