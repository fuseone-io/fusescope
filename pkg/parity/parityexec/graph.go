package parityexec

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/modules/services"
	"github.com/fuseone-io/fusescope/pkg/modules/services/implservices"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail/impltracedetail"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/tracesstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetrymetadata"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/clickhousetelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/flighttelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Graph is one store's modules, answering the trace views as the handlers call them. The two
// graphs of a run share nothing: neither store, metadata, builders nor modules.
type Graph struct {
	Querier     querier.Querier
	Services    services.Module
	TraceDetail tracedetail.Module
}

// Config is what both graphs take besides their store. Neither has a bucket cache.
type Config struct {
	// Org is the organisation compared; the engine graph routes it, and only it, to the engine.
	Org         valuer.UUID
	Querier     querier.Config
	TraceDetail tracedetail.Config
}

// NewEngineGraph is the graph over fusescope-engine. Its ClickHouse is a Refuser, its keys come
// from metadata.keys, and its routing is strict, so it answers from the engine or not at all.
//
// # Errors
//
// An invalid flight configuration.
func NewEngineGraph(ctx context.Context, ps factory.ProviderSettings, fl flagger.Flagger, store telemetrystore.Config, cfg Config) (*Graph, *Refuser, error) {
	refuser := NewRefuser()
	ts, err := flighttelemetrystore.NewWithFallback(ctx, ps, store, refuser)
	if err != nil {
		return nil, nil, err
	}
	g, err := newEngineGraph(ps, fl, ts, refuser, cfg)
	return g, refuser, err
}

func newEngineGraph(ps factory.ProviderSettings, fl flagger.Flagger, ts telemetrystore.TelemetryStore, refuser *Refuser, cfg Config) (*Graph, error) {
	serves := func(_ telemetrystore.Route, org valuer.UUID) bool { return org == cfg.Org }
	builder := tracesstatementbuilder.NewEngineTraceQueryStatementBuilder(ps, telemetrymetadata.NewEngineKeyStore(ts), fl)
	q := querier.New(ps, ts, nil, nil, refuser.Builder(), nil, nil, nil, nil, nil, nil, nil, fl, cfg.Querier.LogTraceIDWindowPadding, cfg.Querier.MaxConcurrentQueries)
	if err := q.RouteToEngine(querier.EngineRouting{Serves: serves, TraceStmtBuilder: builder, RequireEngine: true}); err != nil {
		return nil, err
	}
	return &Graph{
		Querier:     q,
		Services:    implservices.NewModule(q, ts, serves),
		TraceDetail: impltracedetail.NewModule(impltracedetail.NewTraceStore(ts, nil, fl), impltracedetail.NewEngineReader(ts, fl, serves), ps, cfg.TraceDetail),
	}, nil
}

// NewClickHouseGraph is the graph over ClickHouse, as production assembles it without the engine.
//
// # Errors
//
// An invalid ClickHouse configuration, or a builder that does not assemble.
func NewClickHouseGraph(ctx context.Context, ps factory.ProviderSettings, fl flagger.Flagger, store telemetrystore.Config, cfg Config) (*Graph, error) {
	ts, err := clickhousetelemetrystore.New(ctx, ps, store)
	if err != nil {
		return nil, err
	}
	metadata := telemetrymetadata.NewTelemetryMetaStore(ps, ts, fl)
	builder, err := tracesstatementbuilder.NewFactory(ts, metadata, fl).New(ctx, ps, cfg.Querier.Config)
	if err != nil {
		return nil, err
	}
	q := querier.New(ps, ts, metadata, nil, builder, nil, nil, nil, nil, nil, nil, nil, fl, cfg.Querier.LogTraceIDWindowPadding, cfg.Querier.MaxConcurrentQueries)
	return &Graph{
		Querier:     q,
		Services:    implservices.NewModule(q, ts, nil),
		TraceDetail: impltracedetail.NewModule(impltracedetail.NewTraceStore(ts, metadata, fl), nil, ps, cfg.TraceDetail),
	}, nil
}
