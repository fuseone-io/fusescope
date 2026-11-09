package flighttelemetrystore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

// observer reports each call to the engine as one log event, one client span and its metrics.
// The statement goes in by size and hash only: the engine's SQL carries the tenant's values
// rendered as literals. Metric labels are bounded sets: route, operation, outcome, category.
type observer struct {
	logger   *slog.Logger
	tracer   trace.Tracer
	requests metric.Int64Counter
	duration metric.Float64Histogram
	partial  metric.Int64Counter
}

func newObserver(settings factory.ScopedProviderSettings) (*observer, error) {
	meter := settings.Meter()
	requests, err := meter.Int64Counter("fusescope_engine_requests_total", metric.WithDescription("Calls to fusescope-engine by route, operation and outcome."))
	if err != nil {
		return nil, err
	}
	duration, err := meter.Float64Histogram("fusescope_engine_request_duration_seconds", metric.WithDescription("Duration of calls to fusescope-engine."), metric.WithUnit("s"))
	if err != nil {
		return nil, err
	}
	partial, err := meter.Int64Counter("fusescope_engine_partial_total", metric.WithDescription("Partial answers from fusescope-engine by route and category."))
	if err != nil {
		return nil, err
	}
	return &observer{logger: settings.Logger(), tracer: settings.Tracer(), requests: requests, duration: duration, partial: partial}, nil
}

// call is one observed call; finish runs once.
type call struct {
	observer  *observer
	span      trace.Span
	start     time.Time
	route     telemetrystore.Route
	operation string
	tenant    string
	bytes     int
	digest    string
	partial   []string
}

// begin starts observing operation, a statement or an action name, whose text is statement.
func (o *observer) begin(ctx context.Context, operation, statement, tenant string) (context.Context, *call) {
	sum := sha256.Sum256([]byte(statement))
	c := &call{
		observer:  o,
		start:     time.Now(),
		route:     telemetrystore.RouteFromContext(ctx),
		operation: operation,
		tenant:    tenant,
		bytes:     len(statement),
		digest:    hex.EncodeToString(sum[:8]),
	}
	ctx, c.span = o.tracer.Start(ctx, "fusescope-engine "+operation, trace.WithSpanKind(trace.SpanKindClient), trace.WithAttributes(
		attribute.String("db.system.name", "fusescope-engine"),
		attribute.String("db.operation.name", operation),
		attribute.String("rpc.system", "grpc"),
		attribute.String("fusescope.engine.route", string(c.route)),
		attribute.String("fusescope.tenant", tenant),
		attribute.Int("fusescope.engine.statement.bytes", c.bytes),
		attribute.String("fusescope.engine.statement.sha256", c.digest),
	))
	return ctx, c
}

func (c *call) finish(ctx context.Context, err error) {
	elapsed := time.Since(c.start)
	outcome := outcomeOf(ctx, err, c.partial)
	labels := metric.WithAttributes(
		attribute.String("route", string(c.route)),
		attribute.String("operation", c.operation),
		attribute.String("outcome", outcome),
	)
	c.observer.requests.Add(ctx, 1, labels)
	c.observer.duration.Record(ctx, elapsed.Seconds(), metric.WithAttributes(
		attribute.String("route", string(c.route)),
		attribute.String("operation", c.operation),
	))
	for _, category := range c.partial {
		c.observer.partial.Add(ctx, 1, metric.WithAttributes(attribute.String("route", string(c.route)), attribute.String("reason", category)))
	}
	c.span.SetAttributes(attribute.String("fusescope.engine.outcome", outcome))
	if err != nil {
		c.span.RecordError(err)
		c.span.SetStatus(codes.Error, outcome)
	}
	c.span.End()
	c.observer.logger.DebugContext(ctx, "fusescope-engine call",
		slog.String("route", string(c.route)),
		slog.String("operation", c.operation),
		slog.String("tenant", c.tenant),
		slog.String("outcome", outcome),
		slog.Duration("duration", elapsed),
		slog.Int("statement_bytes", c.bytes),
		slog.String("statement_sha256", c.digest),
		slog.Any("partial", c.partial),
	)
}

// outcomeOf is ok, partial, the context's end or the error's type: a bounded set.
func outcomeOf(ctx context.Context, err error, partial []string) string {
	switch {
	case err == nil && len(partial) > 0:
		return "partial"
	case err == nil:
		return "ok"
	case errors.Is(err, context.DeadlineExceeded):
		return "deadline_exceeded"
	case errors.Is(err, context.Canceled) || ctx.Err() != nil:
		return "canceled"
	}
	typ, _, _, _, _, _ := errors.Unwrapb(err)
	return typ.String()
}

// partialCategories maps the engine's partial reasons to their categories, each once, in order.
func partialCategories(reasons []string) []string {
	var categories []string
	seen := map[string]bool{}
	for _, reason := range reasons {
		category := telemetrystore.PartialUnknown
		if strings.Contains(reason, "did not answer") {
			category = telemetrystore.PartialIngesterUnavailable
		}
		if !seen[category] {
			seen[category] = true
			categories = append(categories, category)
		}
	}
	return categories
}
