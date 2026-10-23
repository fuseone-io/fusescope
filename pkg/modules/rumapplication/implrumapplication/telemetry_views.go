package implrumapplication

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	sqlbuilder "github.com/huandu/go-sqlbuilder"
)

const (
	maxSlowRequests    = 10
	maxRecentSessions  = 10
	maxExamplePaths    = 3
	maxViewFingerprint = 20000
)

type viewRouteRow struct {
	route        string
	counts       rumtypes.ViewCounts
	medianNs     float64
	examplePaths []string
}

type viewEventRow struct {
	route            string
	event            string
	vital            string
	bucket           uint64
	samples          uint64
	p75              float64
	good             uint64
	needsImprovement uint64
	poor             uint64
}

type requestTemplateRow struct {
	route          string
	template       rumtypes.RequestTemplate
	p75Ns          float64
	calls          uint64
	failed         uint64
	exampleTraceID string
}

type viewFingerprintRow struct {
	fingerprint string
	firstView   time.Time
	views       uint64
	pageLoads   uint64
}

type clientLCPRow struct {
	byOS    bool
	browser uint16
	os      uint16
	p75     float64
}

type routeSessionRow struct {
	sessionID   string
	startedAt   time.Time
	loadingType string
	fingerprint string
}

type routeSessionLogRow struct {
	sessionID  string
	lcpSamples uint64
	lcp        float64
	errors     uint64
}

func (reader *telemetryReader) ViewRoutes(ctx context.Context, scope telemetryScope, route string, limit int) ([]*viewRouteRow, error) {
	rows := []*viewRouteRow{}
	err := reader.query(ctx, "ViewRoutes", newViewRoutesQuery(scope, route, limit), func(scanner driver.Rows) error {
		row := &viewRouteRow{}
		var views, pageLoads, routeChanges, unknown uint64
		if err := scanner.Scan(&row.route, &views, &pageLoads, &routeChanges, &unknown, &row.medianNs, &row.examplePaths); err != nil {
			return err
		}
		row.counts = rumtypes.ViewCounts{Views: int64(views), PageLoads: int64(pageLoads), RouteChanges: int64(routeChanges), UnknownLoads: int64(unknown)}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

// ViewEvents aggregates vitals and errors per route and, with a step, per bucket too.
func (reader *telemetryReader) ViewEvents(ctx context.Context, scope telemetryScope, route string, step time.Duration) ([]*viewEventRow, error) {
	rows := []*viewEventRow{}
	err := reader.query(ctx, "ViewEvents", newViewEventsQuery(scope, route, step), func(scanner driver.Rows) error {
		row := &viewEventRow{}
		if err := scanner.Scan(&row.route, &row.event, &row.vital, &row.bucket, &row.samples, &row.p75, &row.good, &row.needsImprovement, &row.poor); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

// RequestTemplates returns the slowest template per route, or with a route
// that route's slowest templates.
func (reader *telemetryReader) RequestTemplates(ctx context.Context, scope telemetryScope, route string) ([]*requestTemplateRow, error) {
	rows := []*requestTemplateRow{}
	err := reader.query(ctx, "RequestTemplates", newRequestTemplatesQuery(scope, route), func(scanner driver.Rows) error {
		row := &requestTemplateRow{}
		if err := scanner.Scan(&row.route, &row.template.Method, &row.template.Host, &row.template.Path, &row.p75Ns, &row.calls, &row.failed, &row.exampleTraceID); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

func (reader *telemetryReader) ViewFingerprints(ctx context.Context, scope telemetryScope, route string) ([]*viewFingerprintRow, error) {
	rows := []*viewFingerprintRow{}
	err := reader.query(ctx, "ViewFingerprints", newViewFingerprintsQuery(scope, route), func(scanner driver.Rows) error {
		row := &viewFingerprintRow{}
		if err := scanner.Scan(&row.fingerprint, &row.firstView, &row.views, &row.pageLoads); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

// ClientLCP returns the LCP p75 per browser and per OS label index.
func (reader *telemetryReader) ClientLCP(ctx context.Context, scope telemetryScope, route string, clientKeys []uint64, browsers []uint16, systems []uint16) ([]*clientLCPRow, error) {
	rows := []*clientLCPRow{}
	if len(clientKeys) == 0 {
		return rows, nil
	}
	err := reader.query(ctx, "ClientLCP", newClientLCPQuery(scope, route, clientKeys, browsers, systems), func(scanner driver.Rows) error {
		row := &clientLCPRow{}
		var grouping uint64
		if err := scanner.Scan(&grouping, &row.browser, &row.os, &row.p75); err != nil {
			return err
		}
		row.byOS = grouping != 0
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

func (reader *telemetryReader) RouteSessions(ctx context.Context, scope telemetryScope, route string) ([]*routeSessionRow, error) {
	rows := []*routeSessionRow{}
	err := reader.query(ctx, "RouteSessions", newRouteSessionsQuery(scope, route), func(scanner driver.Rows) error {
		row := &routeSessionRow{}
		if err := scanner.Scan(&row.sessionID, &row.startedAt, &row.loadingType, &row.fingerprint); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

func (reader *telemetryReader) RouteSessionLogs(ctx context.Context, scope telemetryScope, route string, sessionIDs []string) (map[string]*routeSessionLogRow, error) {
	rows := map[string]*routeSessionLogRow{}
	if len(sessionIDs) == 0 {
		return rows, nil
	}
	err := reader.query(ctx, "RouteSessionLogs", newRouteSessionLogsQuery(scope, route, sessionIDs), func(scanner driver.Rows) error {
		row := &routeSessionLogRow{}
		if err := scanner.Scan(&row.sessionID, &row.lcpSamples, &row.lcp, &row.errors); err != nil {
			return err
		}
		rows[row.sessionID] = row
		return nil
	})
	return rows, err
}

func newViewRoutesQuery(scope telemetryScope, route string, limit int) *sqlbuilder.SelectBuilder {
	paths := "''"
	if route != "" {
		paths = attribute(rumtypes.AttributeURLPath)
	}

	views := sqlbuilder.NewSelectBuilder()
	views.Select(
		sqlbuilder.Escape(routeColumn)+" AS route",
		attribute(rumtypes.AttributeViewLoadingType)+" AS loading_type",
		attribute(attributeNavigation)+" AS navigation_type",
		paths+" AS path",
		"duration_nano",
	)
	views.From(spanTable)
	views.Where(scopeConditions(views, spanSignal, scope)...)
	views.Where(views.E("name", rumtypes.SpanNameView))
	if route != "" {
		views.Where(views.E(routeColumn, route))
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		"route",
		"count() AS views",
		"countIf(loading_type = "+literal(rumtypes.LoadingTypeInitialLoad.StringValue())+") AS page_loads",
		"countIf(loading_type = "+literal(rumtypes.LoadingTypeRouteChange.StringValue())+" AND navigation_type != "+literal(navigationRestore)+") AS route_changes",
		"countIf(loading_type NOT IN ("+literal(rumtypes.LoadingTypeInitialLoad.StringValue())+", "+literal(rumtypes.LoadingTypeRouteChange.StringValue())+")) AS unknown_loads",
		"quantile(0.5)(duration_nano) AS median_ns",
		fmt.Sprintf("groupUniqArrayIf(%d)(path, path != '') AS paths", maxExamplePaths),
	)
	sb.From(sb.BuilderAs(views, "views"))
	sb.GroupBy("route")
	sb.OrderBy("views DESC", "route")
	sb.Limit(limit)
	return sb
}

func newViewEventsQuery(scope telemetryScope, route string, step time.Duration) *sqlbuilder.SelectBuilder {
	bucket := "toUInt64(0)"
	if step > 0 {
		bucket = fmt.Sprintf("toUInt64(intDiv(timestamp, %d) * %d)", step.Nanoseconds(), int64(step.Seconds()))
	}

	events := sqlbuilder.NewSelectBuilder()
	events.Select(
		sqlbuilder.Escape(routeColumn)+" AS route",
		attribute(rumtypes.AttributeEventName)+" AS event",
		"lower("+attribute(rumtypes.AttributeVitalName)+") AS vital",
		vitalValueExpr+" AS value",
		attribute(rumtypes.AttributeVitalRating)+" AS rating",
		bucket+" AS bucket",
	)
	events.From(logTable)
	events.Where(scopeConditions(events, logSignal, scope)...)
	events.Where(events.In(attribute(rumtypes.AttributeEventName), rumtypes.EventNameWebVital, rumtypes.EventNameException))
	if route != "" {
		events.Where(events.E(routeColumn, route))
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		"route", "event", "vital", "bucket",
		"count() AS samples",
		"quantile(0.75)(value) AS p75",
		"countIf(rating = "+literal(rumtypes.VitalRatingGood.StringValue())+") AS good",
		"countIf(rating = "+literal(rumtypes.VitalRatingNeedsImprovement.StringValue())+") AS needs_improvement",
		"countIf(rating = "+literal(rumtypes.VitalRatingPoor.StringValue())+") AS poor",
	)
	sb.From(sb.BuilderAs(events, "events"))
	if step > 0 {
		// The set without bucket returns bucket 0, which no real bucket is.
		sb.GroupBy("GROUPING SETS ((route, event, vital, bucket), (route, event, vital))")
	} else {
		sb.GroupBy("route", "event", "vital", "bucket")
	}
	return sb
}

func newRequestTemplatesQuery(scope telemetryScope, route string) *sqlbuilder.SelectBuilder {
	requests := sqlbuilder.NewSelectBuilder()
	requests.Select(
		sqlbuilder.Escape(routeColumn)+" AS route",
		"upper(http_method) AS method",
		sqlbuilder.Escape(requestHostExpr("http_url"))+" AS host",
		sqlbuilder.Escape(requestPathTemplateExpr("http_url"))+" AS path",
		"duration_nano",
		"trace_id",
		"(toUInt16OrZero(response_status_code) >= 400 OR has_error) AS failed",
	)
	requests.From(spanTable)
	requests.Where(scopeConditions(requests, spanSignal, scope)...)
	requests.Where(requests.E("kind", spanKindClient), requests.NE("http_url", ""))
	if route != "" {
		requests.Where(requests.E(routeColumn, route))
	}

	templates := sqlbuilder.NewSelectBuilder()
	templates.Select(
		"route", "method", "host", "path",
		"quantile(0.75)(duration_nano) AS p75",
		"count() AS calls",
		"countIf(failed) AS failed_calls",
		"toString(argMax(trace_id, duration_nano)) AS example_trace_id",
	)
	templates.From(templates.BuilderAs(requests, "requests"))
	templates.GroupBy("route", "method", "host", "path")
	if route != "" {
		templates.OrderBy("p75 DESC", "calls DESC")
		templates.Limit(maxSlowRequests)
		return templates
	}

	sb := sqlbuilder.NewSelectBuilder()
	key := "(p75, calls, method, host, path)"
	sb.Select(
		"route",
		"argMax(method, "+key+")",
		"argMax(host, "+key+")",
		"argMax(path, "+key+")",
		"max(p75)",
		"argMax(calls, "+key+")",
		"argMax(failed_calls, "+key+")",
		"argMax(example_trace_id, "+key+")",
	)
	sb.From(sb.BuilderAs(templates, "templates"))
	sb.GroupBy("route")
	return sb
}

func newViewFingerprintsQuery(scope telemetryScope, route string) *sqlbuilder.SelectBuilder {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		"resource_fingerprint",
		"min(timestamp)",
		"count()",
		"countIf("+attribute(rumtypes.AttributeViewLoadingType)+" = "+literal(rumtypes.LoadingTypeInitialLoad.StringValue())+")",
	)
	sb.From(spanTable)
	sb.Where(scopeConditions(sb, spanSignal, scope)...)
	sb.Where(sb.E("name", rumtypes.SpanNameView), sb.E(routeColumn, route))
	sb.GroupBy("resource_fingerprint")
	sb.Limit(maxViewFingerprint)
	return sb
}

func newClientLCPQuery(scope telemetryScope, route string, clientKeys []uint64, browsers []uint16, systems []uint16) *sqlbuilder.SelectBuilder {
	vitals := sqlbuilder.NewSelectBuilder()
	vitals.Select("resource_fingerprint", vitalValueExpr+" AS value")
	vitals.From(logTable)
	vitals.Where(scopeConditions(vitals, logSignal, scope)...)
	vitals.Where(
		vitals.E(attribute(rumtypes.AttributeEventName), rumtypes.EventNameWebVital),
		vitals.E("lower("+attribute(rumtypes.AttributeVitalName)+")", rumtypes.VitalNameLCP.StringValue()),
		vitals.E(routeColumn, route),
	)

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		"grouping(browser)",
		"transform(r.client_key, "+sb.Var(clientKeys)+", "+sb.Var(browsers)+", toUInt16(0)) AS browser",
		"transform(r.client_key, "+sb.Var(clientKeys)+", "+sb.Var(systems)+", toUInt16(0)) AS os",
		"quantile(0.75)(v.value) AS p75",
	)
	sb.From(sb.BuilderAs(vitals, "v"))
	sb.JoinWithOption(globalAnyLeftJoin, sb.BuilderAs(resourceDimension(logSignal, scope), "r"), "v.resource_fingerprint = r.fingerprint")
	sb.GroupBy("GROUPING SETS ((browser), (os))")
	sb.SQL(smallJoinSettings)
	return sb
}

func newRouteSessionsQuery(scope telemetryScope, route string) *sqlbuilder.SelectBuilder {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		sqlbuilder.Escape(sessionColumn)+" AS session",
		"min(timestamp) AS started_at",
		"argMin("+attribute(rumtypes.AttributeViewLoadingType)+", timestamp)",
		"any(resource_fingerprint)",
	)
	sb.From(spanTable)
	sb.Where(scopeConditions(sb, spanSignal, scope)...)
	sb.Where(sb.E("name", rumtypes.SpanNameView), sb.E(routeColumn, route), sb.NE(sessionColumn, ""))
	sb.GroupBy("session")
	sb.OrderBy("started_at DESC")
	sb.Limit(maxRecentSessions)
	return sb
}

func newRouteSessionLogsQuery(scope telemetryScope, route string, sessionIDs []string) *sqlbuilder.SelectBuilder {
	isLCP := attribute(rumtypes.AttributeEventName) + " = " + literal(rumtypes.EventNameWebVital) + " AND lower(" + attribute(rumtypes.AttributeVitalName) + ") = " + literal(rumtypes.VitalNameLCP.StringValue())

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		sqlbuilder.Escape(sessionColumn)+" AS session",
		"countIf("+isLCP+")",
		"maxIf("+vitalValueExpr+", "+isLCP+")",
		"countIf("+attribute(rumtypes.AttributeEventName)+" = "+literal(rumtypes.EventNameException)+")",
	)
	sb.From(logTable)
	sb.Where(scopeConditions(sb, logSignal, scope)...)
	sb.Where(sb.In(sessionColumn, anySlice(sessionIDs)...), sb.E(routeColumn, route))
	sb.GroupBy("session")
	return sb
}

func anySlice[T any](values []T) []any {
	out := make([]any, 0, len(values))
	for _, value := range values {
		out = append(out, value)
	}
	return out
}
