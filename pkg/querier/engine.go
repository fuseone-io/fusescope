package querier

import (
	"context"
	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// EngineRouting names which trace reads go to fusescope-engine, and the builder that renders
// them in its dialect. The decision is made per query, before any call: a query sent to the
// engine is never retried on ClickHouse.
type EngineRouting struct {
	Serves           func(route telemetrystore.Route, org valuer.UUID) bool
	TraceStmtBuilder qbtypes.StatementBuilder[qbtypes.TraceAggregation]
}

// RouteToEngine sends the reads routing serves to the engine; it is set once, at assembly.
func (q *querier) RouteToEngine(routing EngineRouting) error {
	routed, err := q.meter.Int64Counter("fusescope_engine_routed_total", metric.WithDescription("Routed trace queries by route, the store that served them and why."))
	if err != nil {
		return err
	}
	q.engine = &engineRouting{routing: routing, routed: routed}
	return nil
}

type engineRouting struct {
	routing EngineRouting
	routed  metric.Int64Counter
}

// traceRoute is the route of a trace builder query of kind; trace lists are not routed.
func traceRoute(kind qbtypes.RequestType) (telemetrystore.Route, bool) {
	switch kind {
	case qbtypes.RequestTypeRaw:
		return telemetrystore.RouteTracesRaw, true
	case qbtypes.RequestTypeTimeSeries, qbtypes.RequestTypeScalar:
		return telemetrystore.RouteTracesAggregate, true
	}
	return "", false
}

// engineFor is the engine call of a trace builder query, nil when ClickHouse serves it: an org or
// route not listed, a trace list, or a request holding a trace operator.
func (q *querier) engineFor(org valuer.UUID, kind qbtypes.RequestType, req *qbtypes.QueryRangeRequest) *engineCall[qbtypes.TraceAggregation] {
	if q.engine == nil {
		return nil
	}
	route, ok := traceRoute(kind)
	if !ok || !q.engine.routing.Serves(route, org) {
		return nil
	}
	for _, query := range req.CompositeQuery.Queries {
		if query.Type == qbtypes.QueryTypeTraceOperator {
			return nil
		}
	}
	return &engineCall[qbtypes.TraceAggregation]{route: route, builder: q.engine.routing.TraceStmtBuilder, routed: q.engine.routed, logger: q.logger}
}

// engineCall is how one routed builder query reaches the engine.
type engineCall[T any] struct {
	route    telemetrystore.Route
	builder  qbtypes.StatementBuilder[T]
	routed   metric.Int64Counter
	logger   *slog.Logger
	decision *engineDecision
}

// forAnotherWindow is the same route for a query over another window, which decides on its own:
// ranged queries of one cached query run in parallel, each with its statement.
func (e *engineCall[T]) forAnotherWindow() *engineCall[T] {
	if e == nil {
		return nil
	}
	copied := *e
	copied.decision = nil
	return &copied
}

// engineDecision is where a query runs, with the engine statement of its whole window if there.
type engineDecision struct {
	stmt     *qbtypes.Statement
	onEngine bool
}

func (e *engineCall[T]) decided(ctx context.Context, store, reason string) {
	if e.routed != nil {
		e.routed.Add(ctx, 1, metric.WithAttributes(attribute.String("route", string(e.route)), attribute.String("store", store), attribute.String("reason", reason)))
	}
}

// onEngine decides once, before any call, whether the query runs on the engine, and gives the
// engine statement for the query's whole window when it does. A query the engine dialect cannot
// render runs on ClickHouse instead, with ClickHouse's own preprocessing, and the fallback is
// counted. Any other build error is the caller's.
func (q *builderQuery[T]) onEngine(ctx context.Context) (*qbtypes.Statement, bool, error) {
	if q.engine == nil {
		return nil, false, nil
	}
	if q.engine.decision != nil {
		return q.engine.decision.stmt, q.engine.decision.onEngine, nil
	}
	stmt, err := q.engine.builder.Build(ctx, q.orgID, q.fromMS, q.toMS, q.kind, q.spec, q.variables)
	switch {
	case err == nil:
		q.engine.decided(ctx, "engine", "routed")
		q.engine.decision = &engineDecision{stmt: stmt, onEngine: true}
	case errors.Asc(err, querybuilder.ErrCodeUnsupportedDialect):
		q.engine.decided(ctx, "clickhouse", "unsupported_dialect")
		if q.engine.logger != nil {
			q.engine.logger.InfoContext(ctx, "a routed query has no engine form; ClickHouse serves it", slog.String("route", string(q.engine.route)), errors.Attr(err))
		}
		q.engine.decision = &engineDecision{}
	default:
		return nil, false, err
	}
	return q.engine.decision.stmt, q.engine.decision.onEngine, nil
}

// build renders the statement of [fromMS, toMS] for the store onEngine names.
func (q *builderQuery[T]) build(ctx context.Context, fromMS, toMS uint64, onEngine bool) (*qbtypes.Statement, error) {
	if onEngine {
		return q.engine.builder.Build(ctx, q.orgID, fromMS, toMS, q.kind, q.spec, q.variables)
	}
	return q.stmtBuilder.Build(ctx, q.orgID, fromMS, toMS, q.kind, q.spec, q.variables)
}

// execute runs stmt where onEngine decided.
func (q *builderQuery[T]) execute(ctx context.Context, stmt *qbtypes.Statement, onEngine bool) (*qbtypes.Result, error) {
	if onEngine {
		return q.executeOnEngine(ctx, stmt)
	}
	return q.executeWithContext(ctx, stmt.Query, stmt.Args)
}

// executeOnEngine reads stmt from the engine for the query's org, under its route. A partial
// answer adds the text of each of its categories to the result's warnings.
func (q *builderQuery[T]) executeOnEngine(ctx context.Context, stmt *qbtypes.Statement) (*qbtypes.Result, error) {
	ctx = telemetrystore.WithRoute(telemetrystore.WithTenant(ctx, q.orgID), q.engine.route)
	rows, err := q.telemetryStore.Query(ctx, stmt.Query)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, errors.Newf(errors.TypeTimeout, errors.CodeTimeout, "Query timed out").
				WithAdditional("Try refining your search by adding relevant resource attributes filtering")
		}
		return nil, err
	}
	defer rows.Close()
	payload, err := consume(rows, q.kind, &qbtypes.TimeRange{From: q.fromMS, To: q.toMS}, q.spec.StepInterval, q.spec.Name)
	if err != nil {
		return nil, err
	}
	if q.spec.Signal == telemetrytypes.SignalTraces {
		if raw, ok := payload.(*qbtypes.RawData); ok {
			for _, rr := range raw.Rows {
				storedEventsAndLinks(rr.Data)
				mergeSpanAttributeColumns(rr.Data)
			}
		}
	}
	result := &qbtypes.Result{Type: q.kind, Value: payload}
	for _, category := range rows.Warnings() {
		result.Warnings = append(result.Warnings, telemetrystore.PartialWarning(category))
	}
	return result, nil
}

// storedEventsAndLinks writes the engine's native events and links in the stored form the span
// reader decodes, so both stores answer alike.
func storedEventsAndLinks(data map[string]any) {
	if native, ok := data["events"].([]map[string]any); ok {
		data["events"] = spantypes.LegacyEvents(native)
	}
	if native, ok := data["links"].([]map[string]any); ok {
		data["links"] = spantypes.LegacyLinks(native)
	}
}
