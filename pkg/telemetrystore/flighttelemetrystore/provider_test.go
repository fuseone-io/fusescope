package flighttelemetrystore

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var testOrg = valuer.MustNewUUID("0190f3a1-7b2c-7d4e-9f00-112233445566")

func userContext() context.Context {
	claims := authtypes.Claims{UserID: "0190f3a1-0000-7000-8000-00000000000a", OrgID: testOrg.StringValue()}
	return telemetrystore.WithTenant(authtypes.NewContextWithClaims(context.Background(), claims), testOrg)
}

// expectOneCall wants the hooks to run once around one call, however it ends, and the after-hooks
// to run before the provider cancels the call.
func expectOneCall(t *testing.T) *telemetrystoretest.MockTelemetryStoreHook {
	hook := telemetrystoretest.NewMockTelemetryStoreHook(t)
	hook.EXPECT().BeforeQuery(mock.Anything, mock.Anything).RunAndReturn(
		func(ctx context.Context, _ *telemetrystore.QueryEvent) context.Context { return ctx }).Once()
	hook.EXPECT().AfterQuery(mock.Anything, mock.Anything).Run(func(ctx context.Context, _ *telemetrystore.QueryEvent) {
		assert.NotErrorIs(t, ctx.Err(), context.Canceled, "after-hooks run before the provider cancels the call")
	}).Once()
	return hook
}

// thumbprintOf is the RFC 7638 thumbprint of an Ed25519 public key, computed apart from the code
// under test.
func thumbprintOf(t *testing.T, public ed25519.PublicKey) string {
	jwk, err := json.Marshal(map[string]string{"crv": "Ed25519", "kty": "OKP", "x": base64.RawURLEncoding.EncodeToString(public)})
	require.NoError(t, err)
	sum := sha256.Sum256(jwk)
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func open(t *testing.T, bed *testbed, mem memory.Allocator, hooks ...telemetrystore.TelemetryStoreHook) *provider {
	fallback := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherEqual)
	p, err := newProvider(factorytest.NewSettings(), bed.config, 5*time.Second, fallback, hooks, mem)
	require.NoError(t, err)
	t.Cleanup(func() { _ = p.client.Close() })
	return p
}

func readAll(t *testing.T, rows telemetrystore.Rows) [][2]string {
	var out [][2]string
	for rows.Next() {
		var traceID, name string
		require.NoError(t, rows.Scan(&traceID, &name))
		out = append(out, [2]string{traceID, name})
	}
	require.NoError(t, rows.Err())
	return out
}

func TestQueryReadsTheEngineUnderATenantToken(t *testing.T) {
	bed := newTestbed(t)
	bed.engine.partial = []string{"ingester-1 did not answer", "the hot window of a; b timed out"}
	mem := memory.NewCheckedAllocator(memory.NewGoAllocator())
	p := open(t, bed, mem, expectOneCall(t))

	rows, err := p.Query(userContext(), "select trace_id, name from spans")
	require.NoError(t, err)
	assert.Equal(t, []string{"trace_id", "name"}, rows.Columns())
	assert.Equal(t, [][2]string{{"ab01", "GET /api"}, {"ab01", "SELECT users"}}, readAll(t, rows))
	assert.Equal(t, []string{telemetrystore.PartialIngesterUnavailable, telemetrystore.PartialUnknown}, rows.Warnings(), "each header value is a category, never the engine's text")
	require.NoError(t, rows.Close())
	require.NoError(t, rows.Close())
	mem.AssertSize(t, 0)

	require.Len(t, bed.engine.tokens, 2, "GetFlightInfo and DoGet each carry the token")
	token := bed.engine.tokens[0]
	assert.Equal(t, thumbprintOf(t, bed.engine.public), token.Header["kid"])
	claims := token.Claims.(jwt.MapClaims)
	assert.Equal(t, "user:0190f3a1-0000-7000-8000-00000000000a", claims["sub"])
	assert.Equal(t, testOrg.StringValue(), claims["fusescope_tenant"])
	assert.InDelta(t, 60, claims["exp"].(float64)-claims["iat"].(float64), 0)
}

func TestDoRunsAnActionAndReadsItsStream(t *testing.T) {
	bed := newTestbed(t)
	bed.engine.partial = []string{"ingester-1 did not answer"}
	mem := memory.NewCheckedAllocator(memory.NewGoAllocator())
	p := open(t, bed, mem, expectOneCall(t))

	body := []byte(`{"trace_id":"ab01"}`)
	rows, err := p.Do(telemetrystore.WithService(telemetrystore.WithTenant(context.Background(), testOrg), "tracedetail"), "trace.lookup", body)
	require.NoError(t, err)
	assert.Equal(t, [][2]string{{"ab01", "GET /api"}, {"ab01", "SELECT users"}}, readAll(t, rows))
	assert.Equal(t, []string{telemetrystore.PartialIngesterUnavailable}, rows.Warnings())
	require.NoError(t, rows.Close())
	mem.AssertSize(t, 0)

	require.Len(t, bed.engine.actions, 1)
	assert.Equal(t, "trace.lookup", bed.engine.actions[0].Type)
	assert.Equal(t, body, bed.engine.actions[0].Body)
	assert.Equal(t, "service:tracedetail", bed.engine.tokens[0].Claims.(jwt.MapClaims)["sub"])
}

func TestCallsRefusedBeforeTheNetwork(t *testing.T) {
	testCases := []struct {
		name string
		call func(*provider) error
		code errors.Code
	}{
		{name: "Query_NoTenant", code: telemetrystore.ErrCodeTenantMissing, call: func(p *provider) error {
			_, err := p.Query(authtypes.NewContextWithClaims(context.Background(), authtypes.Claims{UserID: "u"}), "select 1")
			return err
		}},
		{name: "Query_NoSubject", code: telemetrystore.ErrCodeSubjectMissing, call: func(p *provider) error {
			_, err := p.Query(telemetrystore.WithTenant(context.Background(), testOrg), "select 1")
			return err
		}},
		{name: "Query_WithArgs", code: telemetrystore.ErrCodeArgsUnsupported, call: func(p *provider) error {
			_, err := p.Query(userContext(), "select * from spans where name = ?", "GET /api")
			return err
		}},
		{name: "Do_NoTenant", code: telemetrystore.ErrCodeTenantMissing, call: func(p *provider) error {
			_, err := p.Do(telemetrystore.WithService(context.Background(), "tracedetail"), "trace.lookup", nil)
			return err
		}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			bed := newTestbed(t)
			p := open(t, bed, memory.DefaultAllocator, telemetrystoretest.NewMockTelemetryStoreHook(t))
			err := testCase.call(p)
			assert.True(t, errors.Asc(err, testCase.code), "%v", err)
			assert.Zero(t, bed.engine.calls.Load(), "nothing reached the engine")
		})
	}
}

func TestTransportRefusals(t *testing.T) {
	testCases := []struct {
		name string
		edit func(*testing.T, *testbed)
	}{
		{name: "ClientCertificateOfAnotherCA", edit: func(t *testing.T, bed *testbed) {
			cert, key := bed.other.issue(t, "backend", x509.ExtKeyUsageClientAuth)
			bed.config.TLS.CertFile = write(t, bed.dir, "other.crt", cert)
			bed.config.TLS.KeyFile = write(t, bed.dir, "other.key", key)
		}},
		{name: "EngineNotTrusted", edit: func(t *testing.T, bed *testbed) {
			bed.config.TLS.CAFile = write(t, bed.dir, "other-ca.crt", bed.other.pem)
		}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			bed := newTestbed(t)
			testCase.edit(t, bed)
			p := open(t, bed, memory.DefaultAllocator, expectOneCall(t))
			_, err := p.Query(userContext(), "select 1")
			assert.Error(t, err)
			assert.Zero(t, bed.engine.calls.Load(), "no call passed the handshake")
		})
	}
}

func TestADeadlineEndsTheCallOnce(t *testing.T) {
	bed := newTestbed(t)
	bed.engine.hold = true
	p := open(t, bed, memory.DefaultAllocator, expectOneCall(t))
	ctx, cancel := context.WithTimeout(userContext(), 300*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, err := p.Query(ctx, "select trace_id, name from spans")
	assert.ErrorIs(t, err, context.DeadlineExceeded)
	assert.Less(t, time.Since(start), 5*time.Second)
}

func TestTheFallbackServesOnlyClickhouse(t *testing.T) {
	bed := newTestbed(t)
	p := open(t, bed, memory.DefaultAllocator)
	assert.Equal(t, "cluster", p.Cluster())
	assert.NotNil(t, p.ClickhouseDB())
	_, err := p.Query(userContext(), "select 1", 1)
	assert.True(t, errors.Asc(err, telemetrystore.ErrCodeArgsUnsupported), "a refused query is refused, never sent to ClickHouse: %v", err)
}

func TestTokensAreReusedUntilHalfTheirLife(t *testing.T) {
	bed := newTestbed(t)
	s, err := newSigner(bed.config.JWT, func(error) {}, func(string) {})
	require.NoError(t, err)
	now := time.Unix(1_792_678_623, 0)
	s.now = func() time.Time { return now }
	alice := telemetrystore.Identity{Tenant: testOrg, Subject: "user:alice"}

	first, err := s.token(alice)
	require.NoError(t, err)
	now = now.Add(29 * time.Second)
	again, err := s.token(alice)
	require.NoError(t, err)
	assert.Equal(t, first, again)
	bob, err := s.token(telemetrystore.Identity{Tenant: testOrg, Subject: "user:bob"})
	require.NoError(t, err)
	assert.NotEqual(t, first, bob)
	now = now.Add(time.Second)
	renewed, err := s.token(alice)
	require.NoError(t, err)
	assert.NotEqual(t, first, renewed, "renewed once half the 60 s passed")
}

func TestEngineMessagesStayOutOfTheError(t *testing.T) {
	bed := newTestbed(t)
	bed.engine.refuse = status.Error(codes.InvalidArgument, "column secret_salary of /data/t/acme/l1/f.parquet not found")
	p := open(t, bed, memory.DefaultAllocator, expectOneCall(t))
	_, err := p.Query(userContext(), "select secret_salary from spans")
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeInvalidInput), "%v", err)
	assert.NotContains(t, err.Error(), "secret_salary")
	assert.NotContains(t, err.Error(), "parquet")
}

func TestARotatedKeySignsUnderItsOwnKid(t *testing.T) {
	bed := newTestbed(t)
	s, err := newSigner(bed.config.JWT, func(error) {}, func(string) {})
	require.NoError(t, err)
	now := time.Unix(1_792_678_623, 0)
	s.now = func() time.Time { return now }
	s.key.now = func() time.Time { return now }
	alice := telemetrystore.Identity{Tenant: testOrg, Subject: "user:alice"}
	before, err := s.token(alice)
	require.NoError(t, err)

	public, private, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	der, err := x509.MarshalPKCS8PrivateKey(private)
	require.NoError(t, err)
	write(t, bed.dir, "jwt.key", pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	now = now.Add(2 * time.Second)
	after, err := s.token(alice)
	require.NoError(t, err)
	assert.NotEqual(t, before, after, "the cache is cleared when the key changes, well within ttl/2")
	parsed, _, err := jwt.NewParser().ParseUnverified(after, jwt.MapClaims{})
	require.NoError(t, err)
	assert.Equal(t, thumbprintOf(t, public), parsed.Header["kid"])
}

// recorder keeps the level of every record logged.
type recorder struct {
	mu     sync.Mutex
	levels []slog.Level
}

func (r *recorder) Enabled(context.Context, slog.Level) bool { return true }

func (r *recorder) Handle(_ context.Context, record slog.Record) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.levels = append(r.levels, record.Level)
	return nil
}

func (r *recorder) WithAttrs([]slog.Attr) slog.Handler { return r }

func (r *recorder) WithGroup(string) slog.Handler { return r }

// A refusal that points at the deployment, a wrong kid, skewed clocks or an engine bug, is logged
// at the default level; one that is the query's own is not.
func TestEngineRefusalsAreLoggedByWhatTheyMean(t *testing.T) {
	testCases := []struct {
		name string
		code codes.Code
		want slog.Level
	}{
		{name: "Unauthenticated_Warn", code: codes.Unauthenticated, want: slog.LevelWarn},
		{name: "PermissionDenied_Warn", code: codes.PermissionDenied, want: slog.LevelWarn},
		{name: "Internal_Error", code: codes.Internal, want: slog.LevelError},
		{name: "InvalidArgument_Debug", code: codes.InvalidArgument, want: slog.LevelDebug},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			bed := newTestbed(t)
			bed.engine.refuse = status.Error(testCase.code, "refused")
			logs := &recorder{}
			settings := factorytest.NewSettings()
			settings.Logger = slog.New(logs)
			fallback := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherEqual)
			p, err := newProvider(settings, bed.config, 5*time.Second, fallback, nil, memory.DefaultAllocator)
			require.NoError(t, err)
			t.Cleanup(func() { _ = p.client.Close() })
			_, err = p.Query(userContext(), "select 1")
			require.Error(t, err)
			logs.mu.Lock()
			defer logs.mu.Unlock()
			assert.Contains(t, logs.levels, testCase.want)
		})
	}
}
