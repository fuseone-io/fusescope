package opamp

import (
	"context"
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
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/gorilla/websocket"
	"github.com/open-telemetry/opamp-go/protobufs"
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

// The ingest listener speaks only TLS: a plaintext WebSocket is refused,
// one over TLS 1.3 with the server's CA is accepted.
func TestIngestListenerTLS(t *testing.T) {
	certFile, keyFile, pool := selfSigned(t)
	tlsConfig, err := ingest.ServerTLS(certFile, keyFile, "")
	require.NoError(t, err)
	srv := &Server{logger: slog.New(slog.DiscardHandler), agents: &model.Agents{}}
	srv.WithIngest(ingest.NewHub(nil, slog.New(slog.DiscardHandler)), nil, nil, freeAddr(t), tlsConfig)
	require.NoError(t, srv.ingestServer.Start(srv.settings(srv.ingestListen, srv.ingestTLS)))
	t.Cleanup(func() { _ = srv.ingestServer.Stop(context.Background()) })

	_, _, err = websocket.DefaultDialer.Dial("ws://"+srv.ingestListen+"/v1/opamp", nil)
	assert.Error(t, err, "no plaintext on the ingest listener")
	dialer := &websocket.Dialer{TLSClientConfig: &tls.Config{RootCAs: pool, ServerName: "localhost", MinVersion: tls.VersionTLS12}, HandshakeTimeout: 5 * time.Second}
	conn, _, err := dialer.Dial("wss://"+srv.ingestListen+"/v1/opamp", nil)
	require.NoError(t, err)
	assert.Equal(t, uint16(tls.VersionTLS13), conn.UnderlyingConn().(*tls.Conn).ConnectionState().Version)
	_ = conn.Close()
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
