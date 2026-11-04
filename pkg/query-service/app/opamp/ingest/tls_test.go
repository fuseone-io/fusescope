package ingest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testCA issues certificates for tests.
type testCA struct {
	cert *x509.Certificate
	key  *ecdsa.PrivateKey
	pem  []byte
}

func newTestCA(t *testing.T) *testCA {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "test CA"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	return &testCA{cert: cert, key: key, pem: pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})}
}

// issue writes a certificate for name, server or client, and its key into
// dir, returning their paths.
func (ca *testCA) issue(t *testing.T, dir, name string, serial int64, usage x509.ExtKeyUsage) (string, string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	template := &x509.Certificate{
		SerialNumber: big.NewInt(serial), Subject: pkix.Name{CommonName: name}, DNSNames: []string{name},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{usage},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, ca.cert, &key.PublicKey, ca.key)
	require.NoError(t, err)
	keyDER, err := x509.MarshalECPrivateKey(key)
	require.NoError(t, err)
	certFile, keyFile := filepath.Join(dir, name+".crt"), filepath.Join(dir, name+".key")
	require.NoError(t, os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600))
	require.NoError(t, os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0o600))
	return certFile, keyFile
}

func (ca *testCA) pool() *x509.CertPool {
	pool := x509.NewCertPool()
	pool.AddCert(ca.cert)
	return pool
}

// serveTLS accepts TLS connections with config and completes their
// handshakes.
func serveTLS(t *testing.T, config *tls.Config) string {
	t.Helper()
	listener, err := tls.Listen("tcp", "127.0.0.1:0", config)
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				_ = conn.(*tls.Conn).Handshake()
				_ = conn.Close()
			}()
		}
	}()
	return listener.Addr().String()
}

func dialTLS(addr string, config *tls.Config) (*tls.ConnectionState, error) {
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", addr, config)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	state := conn.ConnectionState()
	return &state, nil
}

// The listener speaks TLS 1.3 only, and serves a certificate replaced on
// disk, as cert-manager renews it, without a restart.
func TestServerTLSReloadsAndRequires13(t *testing.T) {
	ca, dir := newTestCA(t), t.TempDir()
	certFile, keyFile := ca.issue(t, dir, "backend", 2, x509.ExtKeyUsageServerAuth)
	config, err := ServerTLS(certFile, keyFile, "")
	require.NoError(t, err)
	addr := serveTLS(t, config)
	client := &tls.Config{ServerName: "backend", RootCAs: ca.pool(), MinVersion: tls.VersionTLS12}

	state, err := dialTLS(addr, client)
	require.NoError(t, err)
	assert.Equal(t, uint16(tls.VersionTLS13), state.Version)
	assert.Equal(t, int64(2), state.PeerCertificates[0].SerialNumber.Int64())

	_, err = dialTLS(addr, &tls.Config{ServerName: "backend", RootCAs: ca.pool(), MaxVersion: tls.VersionTLS12})
	assert.Error(t, err, "TLS 1.2 is refused")

	renewed, renewedKey := ca.issue(t, t.TempDir(), "backend", 3, x509.ExtKeyUsageServerAuth)
	for _, f := range [][2]string{{renewed, certFile}, {renewedKey, keyFile}} {
		data, err := os.ReadFile(f[0])
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(f[1], data, 0o600))
		later := time.Now().Add(time.Minute)
		require.NoError(t, os.Chtimes(f[1], later, later))
	}
	state, err = dialTLS(addr, client)
	require.NoError(t, err)
	assert.Equal(t, int64(3), state.PeerCertificates[0].SerialNumber.Int64(), "the renewed certificate is served")

	require.NoError(t, os.WriteFile(certFile, []byte("not a certificate"), 0o600))
	broken := time.Now().Add(2 * time.Minute)
	require.NoError(t, os.Chtimes(certFile, broken, broken))
	state, err = dialTLS(addr, client)
	require.NoError(t, err, "a file being replaced keeps the last good certificate")
	assert.Equal(t, int64(3), state.PeerCertificates[0].SerialNumber.Int64())
}

// With a client CA, a collector must present a certificate it issued.
func TestServerTLSClientCertificates(t *testing.T) {
	ca, other, dir := newTestCA(t), newTestCA(t), t.TempDir()
	certFile, keyFile := ca.issue(t, dir, "backend", 2, x509.ExtKeyUsageServerAuth)
	caFile := filepath.Join(dir, "ca.crt")
	require.NoError(t, os.WriteFile(caFile, ca.pem, 0o600))
	config, err := ServerTLS(certFile, keyFile, caFile)
	require.NoError(t, err)
	addr := serveTLS(t, config)

	clientCert, clientKey := ca.issue(t, dir, "collector", 4, x509.ExtKeyUsageClientAuth)
	good, err := tls.LoadX509KeyPair(clientCert, clientKey)
	require.NoError(t, err)
	strangerCert, strangerKey := other.issue(t, t.TempDir(), "collector", 5, x509.ExtKeyUsageClientAuth)
	stranger, err := tls.LoadX509KeyPair(strangerCert, strangerKey)
	require.NoError(t, err)

	for _, test := range []struct {
		name  string
		certs []tls.Certificate
		ok    bool
	}{
		{"issued by the CA", []tls.Certificate{good}, true},
		{"no certificate", nil, false},
		{"another CA", []tls.Certificate{stranger}, false},
	} {
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: "backend", RootCAs: ca.pool(), Certificates: test.certs, MinVersion: tls.VersionTLS13})
		if err == nil {
			// TLS 1.3 reports a refused client certificate on the first read.
			_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
			_, err = conn.Read(make([]byte, 1))
			_ = conn.Close()
		}
		if test.ok {
			assert.ErrorContains(t, err, "EOF", test.name)
		} else {
			assert.ErrorContains(t, err, "certificate", test.name)
		}
	}
}

func TestServerTLSRefusesBadFiles(t *testing.T) {
	ca, dir := newTestCA(t), t.TempDir()
	certFile, keyFile := ca.issue(t, dir, "backend", 2, x509.ExtKeyUsageServerAuth)
	_, err := ServerTLS(filepath.Join(dir, "missing.crt"), keyFile, "")
	assert.Error(t, err)
	_, err = ServerTLS(certFile, keyFile, filepath.Join(dir, "missing-ca.crt"))
	assert.Error(t, err)
	empty := filepath.Join(dir, "empty.crt")
	require.NoError(t, os.WriteFile(empty, []byte("no certificate here"), 0o600))
	_, err = ServerTLS(certFile, keyFile, empty)
	assert.Error(t, err, "a CA file with no certificate")
}
