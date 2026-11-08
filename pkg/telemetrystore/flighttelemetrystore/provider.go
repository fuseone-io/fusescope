// Package flighttelemetrystore reads telemetry from fusescope-engine over Arrow Flight SQL, with
// mTLS and a tenant token signed per request. Callers not yet moved to Query and Do keep reading
// ClickHouse through the existing clickhouse block; Query and Do never fall back to it.
package flighttelemetrystore

import (
	"context"
	"strings"

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
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

// PartialHeader carries the reasons a result may be partial, joined by "; ".
const PartialHeader = "x-fusescope-partial"

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
	mem      memory.Allocator
}

type HookFactories = []factory.ProviderFactory[telemetrystore.TelemetryStoreHook, telemetrystore.Config]

// NewFactory builds the flight provider; flightHooks run around Query and Do, clickhouseHooks
// around the fallback's statements.
func NewFactory(flightHooks, clickhouseHooks HookFactories) factory.ProviderFactory[telemetrystore.TelemetryStore, telemetrystore.Config] {
	return factory.NewProviderFactory(factory.MustNewName("flight"), func(ctx context.Context, providerSettings factory.ProviderSettings, config telemetrystore.Config) (telemetrystore.TelemetryStore, error) {
		return New(ctx, providerSettings, config, flightHooks, clickhouseHooks)
	})
}

func New(ctx context.Context, providerSettings factory.ProviderSettings, config telemetrystore.Config, flightHooks, clickhouseHooks HookFactories) (telemetrystore.TelemetryStore, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}
	fallback, err := clickhousetelemetrystore.New(ctx, providerSettings, config, clickhouseHooks...)
	if err != nil {
		return nil, err
	}
	hooks := make([]telemetrystore.TelemetryStoreHook, len(flightHooks))
	for i, hookFactory := range flightHooks {
		if hooks[i], err = hookFactory.New(ctx, providerSettings, config); err != nil {
			return nil, err
		}
	}
	return newProvider(providerSettings, config.Flight, fallback, hooks, memory.DefaultAllocator)
}

func newProvider(providerSettings factory.ProviderSettings, config telemetrystore.FlightConfig, fallback clickhouseOnly, hooks []telemetrystore.TelemetryStoreHook, mem memory.Allocator) (*provider, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/telemetrystore/flighttelemetrystore")
	reloadFailed := func(err error) {
		settings.Logger().WarnContext(context.Background(), "engine credentials changed but do not load; the last good ones stay", errors.Attr(err))
	}
	tlsConfig, err := clientTLS(config.TLS, reloadFailed)
	if err != nil {
		return nil, err
	}
	signer, err := newSigner(config.JWT, reloadFailed)
	if err != nil {
		return nil, err
	}
	client, err := flightsql.NewClient(config.Endpoint, nil, nil,
		grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)),
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(config.MaxMessageBytes)),
	)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, telemetrystore.ErrCodeInvalidConfig, "telemetrystore.flight.endpoint")
	}
	client.Alloc = mem
	return &provider{clickhouseOnly: fallback, settings: settings, client: client, signer: signer, hooks: hooks, mem: mem}, nil
}

func (p *provider) Query(ctx context.Context, stmt string, args ...any) (telemetrystore.Rows, error) {
	if len(args) > 0 {
		return nil, errors.NewInvalidInputf(telemetrystore.ErrCodeArgsUnsupported, "the engine takes no statement arguments; render literals in the statement's dialect")
	}
	ctx, end, err := p.begin(ctx, stmt)
	if err != nil {
		return nil, err
	}
	info, err := p.client.Execute(ctx, stmt)
	if err != nil {
		return nil, end(castError(ctx, err))
	}
	if len(info.GetEndpoint()) != 1 {
		return nil, end(errors.NewInternalf(ErrCodeEngine, "fusescope-engine answered %d endpoints, one expected", len(info.GetEndpoint())))
	}
	stream, err := p.client.Client.DoGet(ctx, info.GetEndpoint()[0].GetTicket())
	if err != nil {
		return nil, end(castError(ctx, err))
	}
	header, err := stream.Header()
	if err != nil {
		return nil, end(castError(ctx, err))
	}
	reader, err := flight.NewRecordReader(stream, ipc.WithAllocator(p.mem))
	if err != nil {
		return nil, end(castError(ctx, err))
	}
	return p.rows(ctx, reader, header, end)
}

func (p *provider) Do(ctx context.Context, action string, body []byte) (telemetrystore.Rows, error) {
	ctx, end, err := p.begin(ctx, action)
	if err != nil {
		return nil, err
	}
	results, err := p.client.Client.DoAction(ctx, &flight.Action{Type: action, Body: body})
	if err != nil {
		return nil, end(castError(ctx, err))
	}
	header, err := results.Header()
	if err != nil {
		return nil, end(castError(ctx, err))
	}
	reader, err := ipc.NewReader(&actionStream{results: results}, ipc.WithAllocator(p.mem))
	if err != nil {
		return nil, end(castError(ctx, err))
	}
	return p.rows(ctx, reader, header, end)
}

// begin authorises ctx for its tenant and subject and starts the hooks. The returned end, which
// the caller runs exactly once, cancels the call and finishes the hooks; it returns its error.
func (p *provider) begin(ctx context.Context, operation string) (context.Context, func(error) error, error) {
	identity, err := telemetrystore.IdentityFromContext(ctx)
	if err != nil {
		return nil, nil, err
	}
	token, err := p.signer.token(identity)
	if err != nil {
		return nil, nil, err
	}
	ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)
	event := telemetrystore.NewQueryEvent(operation, nil)
	ctx = telemetrystore.WrapBeforeQuery(p.hooks, ctx, event)
	ctx, cancel := context.WithCancel(ctx)
	end := func(err error) error {
		cancel()
		event.Err = err
		telemetrystore.WrapAfterQuery(p.hooks, ctx, event)
		return err
	}
	return ctx, end, nil
}

func (p *provider) rows(ctx context.Context, src source, header metadata.MD, end func(error) error) (telemetrystore.Rows, error) {
	var warnings []string
	for _, value := range header.Get(PartialHeader) {
		warnings = append(warnings, strings.Split(value, "; ")...)
	}
	rows, err := newRows(castSource{source: src, ctx: ctx}, warnings, func(err error) { _ = end(err) })
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// castSource reports the stream's error as castError does.
type castSource struct {
	source
	ctx context.Context
}

func (s castSource) Err() error { return castError(s.ctx, s.source.Err()) }
