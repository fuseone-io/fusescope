package telemetrystore

import "context"

// Route names which reads a call serves, so the engine's metrics and logs can tell them apart. It is
// a bounded set: it labels metrics.
type Route string

const (
	// RouteTracesRaw is a builder query of span rows: the span list.
	RouteTracesRaw Route = "traces_raw"
	// RouteTracesAggregate is a builder query of trace time series or scalars.
	RouteTracesAggregate Route = "traces_aggregate"
	// RouteTraceDetail is the summary and waterfall of one trace.
	RouteTraceDetail Route = "trace_detail"
	// RouteUnrouted is a call no route named.
	RouteUnrouted Route = "unrouted"
)

type routeKey struct{}

func WithRoute(ctx context.Context, route Route) context.Context {
	return context.WithValue(ctx, routeKey{}, route)
}

// RouteFromContext is the route ctx carries, RouteUnrouted when none.
func RouteFromContext(ctx context.Context) Route {
	if route, ok := ctx.Value(routeKey{}).(Route); ok {
		return route
	}
	return RouteUnrouted
}
