package flighttelemetrystore

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
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
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/flight"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// authority is a test CA that issues leaf certificates.
type authority struct {
	cert *x509.Certificate
	key  *ecdsa.PrivateKey
	pem  []byte
}

func newAuthority(t *testing.T, name string) *authority {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(time.Now().UnixNano()),
		Subject:               pkix.Name{CommonName: name},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	return &authority{cert: cert, key: key, pem: pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})}
}

// issue returns a leaf of the authority as PEM certificate and key.
func (a *authority) issue(t *testing.T, name string, usage x509.ExtKeyUsage) ([]byte, []byte) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: name},
		DNSNames:     []string{name},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{usage},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, a.cert, &key.PublicKey, a.key)
	require.NoError(t, err)
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
}

func write(t *testing.T, dir, name string, contents []byte) string {
	path := filepath.Join(dir, name)
	require.NoError(t, os.WriteFile(path, contents, 0o600))
	return path
}

// fakeEngine answers Flight SQL like fusescope-engine: it verifies the bearer token of every
// call, serves one batch per statement or action and announces partial results in a header.
type fakeEngine struct {
	flight.BaseFlightServer
	public  ed25519.PublicKey
	partial []string
	refuse  error
	hold    bool
	calls   atomic.Int32
	mu      sync.Mutex
	tokens  []*jwt.Token
	actions []*flight.Action
	// traceparents are the W3C trace contexts the calls carried, one per authorised call.
	traceparents []string
}

func (e *fakeEngine) authorize(ctx context.Context) error {
	md, _ := metadata.FromIncomingContext(ctx)
	values := md.Get("authorization")
	if len(values) != 1 {
		return status.Error(codes.Unauthenticated, "missing bearer token")
	}
	token, err := jwt.Parse(strings.TrimPrefix(values[0], "Bearer "),
		func(*jwt.Token) (any, error) { return e.public, nil },
		jwt.WithValidMethods([]string{"EdDSA"}), jwt.WithIssuer("fusescope-backend"), jwt.WithAudience("fusescope-engine"))
	if err != nil {
		return status.Error(codes.Unauthenticated, err.Error())
	}
	e.mu.Lock()
	e.tokens = append(e.tokens, token)
	e.traceparents = append(e.traceparents, strings.Join(md.Get("traceparent"), ","))
	e.mu.Unlock()
	return nil
}

func (e *fakeEngine) GetFlightInfo(ctx context.Context, _ *flight.FlightDescriptor) (*flight.FlightInfo, error) {
	e.calls.Add(1)
	if err := e.authorize(ctx); err != nil {
		return nil, err
	}
	if e.refuse != nil {
		return nil, e.refuse
	}
	return &flight.FlightInfo{Endpoint: []*flight.FlightEndpoint{{Ticket: &flight.Ticket{Ticket: []byte("FST2")}}}}, nil
}

func (e *fakeEngine) DoGet(_ *flight.Ticket, stream flight.FlightService_DoGetServer) error {
	if err := e.authorize(stream.Context()); err != nil {
		return err
	}
	if err := e.announce(stream); err != nil {
		return err
	}
	if e.hold {
		<-stream.Context().Done()
		return status.FromContextError(stream.Context().Err()).Err()
	}
	batch := traceBatch()
	defer batch.Release()
	writer := flight.NewRecordWriter(stream, ipc.WithSchema(batch.Schema()))
	defer writer.Close()
	return writer.Write(batch)
}

func (e *fakeEngine) DoAction(action *flight.Action, stream flight.FlightService_DoActionServer) error {
	e.calls.Add(1)
	if err := e.authorize(stream.Context()); err != nil {
		return err
	}
	e.mu.Lock()
	e.actions = append(e.actions, action)
	e.mu.Unlock()
	if err := e.announce(stream); err != nil {
		return err
	}
	batch := traceBatch()
	defer batch.Release()
	var buf bytes.Buffer
	writer := ipc.NewWriter(&buf, ipc.WithSchema(batch.Schema()))
	if err := writer.Write(batch); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	encoded := buf.Bytes()
	for _, part := range [][]byte{encoded[:len(encoded)/2], encoded[len(encoded)/2:]} {
		if err := stream.Send(&flight.Result{Body: part}); err != nil {
			return err
		}
	}
	return nil
}

func (e *fakeEngine) announce(stream grpc.ServerStream) error {
	if len(e.partial) == 0 {
		return nil
	}
	md := metadata.MD{}
	md.Append(PartialHeader, e.partial...)
	return stream.SetHeader(md)
}

// traceBatch is two spans of one trace.
func traceBatch() arrow.RecordBatch {
	schema := arrow.NewSchema([]arrow.Field{
		{Name: "trace_id", Type: &arrow.FixedSizeBinaryType{ByteWidth: 2}},
		{Name: "name", Type: arrow.BinaryTypes.String},
	}, nil)
	b := array.NewRecordBuilder(memory.DefaultAllocator, schema)
	defer b.Release()
	b.Field(0).(*array.FixedSizeBinaryBuilder).AppendValues([][]byte{{0xab, 0x01}, {0xab, 0x01}}, nil)
	b.Field(1).(*array.StringBuilder).AppendValues([]string{"GET /api", "SELECT users"}, nil)
	return b.NewRecordBatch()
}

// testbed is a fake engine over mTLS and the flight configuration of a backend it admits.
type testbed struct {
	engine *fakeEngine
	config telemetrystore.FlightConfig
	dir    string
	other  *authority
}

func newTestbed(t *testing.T) *testbed {
	dir := t.TempDir()
	engineCA, backendCA := newAuthority(t, "engine ca"), newAuthority(t, "backend ca")
	serverCert, serverKey := engineCA.issue(t, "localhost", x509.ExtKeyUsageServerAuth)
	pair, err := tls.X509KeyPair(serverCert, serverKey)
	require.NoError(t, err)
	clients := x509.NewCertPool()
	clients.AddCert(backendCA.cert)
	public, private, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	privateDER, err := x509.MarshalPKCS8PrivateKey(private)
	require.NoError(t, err)

	engine := &fakeEngine{public: public}
	server := grpc.NewServer(grpc.Creds(credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{pair},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    clients,
		MinVersion:   tls.VersionTLS13,
	})))
	flight.RegisterFlightServiceServer(server, engine)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(server.Stop)

	backendCert, backendKey := backendCA.issue(t, "backend", x509.ExtKeyUsageClientAuth)
	return &testbed{
		engine: engine,
		dir:    dir,
		other:  newAuthority(t, "other ca"),
		config: telemetrystore.FlightConfig{
			Endpoint: "localhost:" + strings.Split(listener.Addr().String(), ":")[1],
			TLS: telemetrystore.FlightTLSConfig{
				CertFile: write(t, dir, "backend.crt", backendCert),
				KeyFile:  write(t, dir, "backend.key", backendKey),
				CAFile:   write(t, dir, "engine-ca.crt", engineCA.pem),
			},
			JWT: telemetrystore.FlightJWTConfig{
				KeyFile:  write(t, dir, "jwt.key", pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER})),
				Issuer:   "fusescope-backend",
				Audience: "fusescope-engine",
				TTL:      time.Minute,
			},
			MaxMessageBytes: 1 << 20,
		},
	}
}
