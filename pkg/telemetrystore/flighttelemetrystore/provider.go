// Package flighttelemetrystore reads telemetry from fusescope-engine over Arrow Flight SQL, with
// mTLS and a tenant token signed per request. Callers not yet moved to Query and Do keep reading
// ClickHouse through the existing clickhouse block; Query and Do never fall back to it.
package flighttelemetrystore

import (
	"context"
	"log/slog"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/apache/arrow-go/v18/arrow/flight"
	"github.com/apache/arrow-go/v18/arrow/flight/flightsql"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/clickhousetelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrystoretypes"
	"go.opentelemetry.io/otel/propagation"
	"google.golang.org/grpc"
	"google.golang.org/grpc/backoff"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// PartialHeader carries the reasons a result may be partial, one per value.
const PartialHeader = "x-fusescope-partial"

// keepaliveTime and keepaliveTimeout find a half-open connection to the engine while a call waits
// on it, whatever deadline the caller set.
const (
	keepaliveTime    = 30 * time.Second
	keepaliveTimeout = 10 * time.Second
)

// clickhouseOnly is what the fallback serves: the ClickHouse surface alone, so Query and Do
// cannot reach it.
type clickhouseOnly interface {
	ClickhouseDB() clickhouse.Conn
	Cluster() string
	Estimate(ctx context.Context, stmt string, args ...any) ([]telemetrystoretypes.EstimateEntry, error)
	Plan(ctx context.Context, stmt string, args ...any) error
	Indexes(ctx context.Context, stmt string, args ...any) (telemetrystoretypes.Granules, bool, error)
}

type provider struct {
	clickhouseOnly
	settings factory.ScopedProviderSettings
	client   *flightsql.Client
	signer   *signer
	hooks    []telemetrystore.TelemetryStoreHook
	observer *observer
	mem      memory.Allocator
}

type HookFactories = []factory.ProviderFactory[telemetrystore.TelemetryStoreHook, telemetrystore.Config]

// NewFactory builds the flight provider. Query and Do are observed by the provider itself, which
// keeps their statements out of logs and spans; clickhouseHooks run around the fallback's
// statements.
func NewFactory(clickhouseHooks HookFactories) factory.ProviderFactory[telemetrystore.TelemetryStore, telemetrystore.Config] {
	return factory.NewProviderFactory(factory.MustNewName("flight"), func(ctx context.Context, providerSettings factory.ProviderSettings, config telemetrystore.Config) (telemetrystore.TelemetryStore, error) {
		return New(ctx, providerSettings, config, clickhouseHooks)
	})
}

func New(ctx context.Context, providerSettings factory.ProviderSettings, config telemetrystore.Config, clickhouseHooks HookFactories) (telemetrystore.TelemetryStore, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}
	fallback, err := clickhousetelemetrystore.New(ctx, providerSettings, config, clickhouseHooks...)
	if err != nil {
		return nil, err
	}
	p, err := newProvider(providerSettings, config.Flight, config.Connection.DialTimeout, fallback, nil, memory.DefaultAllocator)
	if err != nil {
		if closer, ok := fallback.(interface{ Close() error }); ok {
			_ = closer.Close()
		}
		return nil, err
	}
	return p, nil
}

func newProvider(providerSettings factory.ProviderSettings, config telemetrystore.FlightConfig, dialTimeout time.Duration, fallback clickhouseOnly, hooks []telemetrystore.TelemetryStoreHook, mem memory.Allocator) (*provider, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/telemetrystore/flighttelemetrystore")
	reloadFailed := func(err error) {
		settings.Logger().WarnContext(context.Background(), "engine credentials changed but do not load; the last good ones stay", errors.Attr(err))
	}
	tlsConfig, err := clientTLS(config.TLS, reloadFailed)
	if err != nil {
		return nil, err
	}
	signer, err := newSigner(config.JWT, reloadFailed, func(kid string) {
		settings.Logger().InfoContext(context.Background(), "engine tokens are signed under a new key; publish it in the engine's auth.jwt_keys", slog.String("kid", kid))
	})
	if err != nil {
		return nil, err
	}
	client, err := flightsql.NewClient(config.Endpoint, nil, nil,
		grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)),
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(config.MaxMessageBytes)),
		grpc.WithKeepaliveParams(keepalive.ClientParameters{Time: keepaliveTime, Timeout: keepaliveTimeout}),
		grpc.WithConnectParams(grpc.ConnectParams{Backoff: backoff.DefaultConfig, MinConnectTimeout: dialTimeout}),
	)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, telemetrystore.ErrCodeInvalidConfig, "telemetrystore.flight.endpoint")
	}
	client.Alloc = mem
	observer, err := newObserver(settings)
	if err != nil {
		return nil, err
	}
	return &provider{clickhouseOnly: fallback, settings: settings, client: client, signer: signer, hooks: hooks, observer: observer, mem: mem}, nil
}

func (p *provider) Query(ctx context.Context, stmt string, args ...any) (telemetrystore.Rows, error) {
	if len(args) > 0 {
		return nil, errors.NewInvalidInputf(telemetrystore.ErrCodeArgsUnsupported, "the engine takes no statement arguments; render literals in the statement's dialect")
	}
	ctx, end, err := p.begin(ctx, "query", stmt)
	if err != nil {
		return nil, err
	}
	info, err := p.client.Execute(ctx, stmt)
	if err != nil {
		return nil, end.end(end.cast(ctx, err))
	}
	if len(info.GetEndpoint()) != 1 {
		return nil, end.end(errors.NewInternalf(ErrCodeEngine, "fusescope-engine answered %d endpoints, one expected", len(info.GetEndpoint())))
	}
	stream, err := p.client.Client.DoGet(ctx, info.GetEndpoint()[0].GetTicket())
	if err != nil {
		return nil, end.end(end.cast(ctx, err))
	}
	header, err := stream.Header()
	if err != nil {
		return nil, end.end(end.cast(ctx, err))
	}
	reader, err := flight.NewRecordReader(stream, ipc.WithAllocator(p.mem))
	if err != nil {
		return nil, end.end(end.cast(ctx, err))
	}
	return p.rows(ctx, reader, header, end)
}

func (p *provider) Do(ctx context.Context, action string, body []byte) (telemetrystore.Rows, error) {
	ctx, end, err := p.begin(ctx, action, string(body))
	if err != nil {
		return nil, err
	}
	results, err := p.client.Client.DoAction(ctx, &flight.Action{Type: action, Body: body})
	if err != nil {
		return nil, end.end(end.cast(ctx, err))
	}
	header, err := results.Header()
	if err != nil {
		return nil, end.end(end.cast(ctx, err))
	}
	reader, err := ipc.NewReader(&actionStream{results: results}, ipc.WithAllocator(p.mem))
	if err != nil {
		return nil, end.end(end.cast(ctx, err))
	}
	return p.rows(ctx, reader, header, end)
}

// begin authorises ctx for its tenant and subject and starts observing the call. The returned
// end, which the caller runs exactly once, cancels the call and finishes the observation; it
// returns its error. The hooks see the operation, never the statement.
func (p *provider) begin(ctx context.Context, operation, statement string) (context.Context, *ending, error) {
	identity, err := telemetrystore.IdentityFromContext(ctx)
	if err != nil {
		return nil, nil, err
	}
	token, err := p.signer.token(identity)
	if err != nil {
		return nil, nil, err
	}
	ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
	ctx, observed := p.observer.begin(ctx, operation, statement, identity.Tenant.StringValue())
	ctx = withTraceContext(ctx)
	event := &telemetrystore.QueryEvent{Operation: operation, StartTime: time.Now()}
	ctx = telemetrystore.WrapBeforeQuery(p.hooks, ctx, event)
	ctx, cancel := context.WithCancel(ctx)
	return ctx, &ending{finish: func(err error) {
		event.Err = err
		telemetrystore.WrapAfterQuery(p.hooks, ctx, event)
		observed.finish(ctx, err)
		cancel()
	}, observed: observed}, nil
}

// ending finishes one call exactly once, with the partial categories its answer announced.
type ending struct {
	finish   func(error)
	observed *call
}

func (e *ending) end(err error) error {
	e.finish(err)
	return err
}

func (p *provider) rows(ctx context.Context, src source, header metadata.MD, end *ending) (telemetrystore.Rows, error) {
	warnings := partialCategories(header.Get(PartialHeader))
	end.observed.partial = warnings
	rows, err := newRows(castSource{source: src, cast: func(err error) error { return end.cast(ctx, err) }}, warnings, func(err error) { _ = end.end(err) })
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// cast returns an error that carries only what kind of refusal it was: the engine's message may
// name SQL, columns or paths. The call's observation records the code, for its one log event.
func (e *ending) cast(ctx context.Context, err error) error {
	if err == nil {
		return nil
	}
	if st, ok := status.FromError(err); ok {
		e.observed.code = st.Code()
		e.observed.refused = true
	} else if ctx.Err() == nil {
		e.observed.unreachable = true
	}
	return castError(ctx, err)
}

// castSource reports the stream's error through cast.
type castSource struct {
	source
	cast func(error) error
}

func (s castSource) Err() error { return s.cast(s.source.Err()) }

// withTraceContext carries the call's span to the engine as W3C trace context in the gRPC metadata.
func withTraceContext(ctx context.Context) context.Context {
	carrier := propagation.MapCarrier{}
	propagation.TraceContext{}.Inject(ctx, carrier)
	pairs := make([]string, 0, 2*len(carrier))
	for key, value := range carrier {
		pairs = append(pairs, key, value)
	}
	return metadata.AppendToOutgoingContext(ctx, pairs...)
}
