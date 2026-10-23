package implrumapplication

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	sqlbuilder "github.com/huandu/go-sqlbuilder"
)

// maxTimelineRows bounds the spans and the logs one session timeline reads;
// one more row is read to tell a truncated timeline.
const maxTimelineRows = 5000

var (
	timelineEvents = []any{rumtypes.EventNameException, rumtypes.EventNameWebVital, rumtypes.EventNameClick, rumtypes.EventNameCustomAction}
)

type sessionRow struct {
	sessionID   string
	startedAt   time.Time
	endedNs     int64
	views       uint64
	fingerprint string
	total       uint64
}

type sessionOverview struct {
	startedAt time.Time
	views     uint64
}

type sessionLogCounts struct {
	actions uint64
	errors  uint64
}

type sessionAttributes struct {
	previousID string
	userID     string
}

type sessionSpanRow struct {
	timestamp   time.Time
	spanID      string
	traceID     string
	name        string
	kind        int8
	durationNs  uint64
	route       string
	path        string
	loadingType string
	method      string
	url         string
	statusCode  uint16
	hasError    bool
	fingerprint string
	previousID  string
	userID      string
}

type sessionLogRow struct {
	timestamp   uint64
	event       string
	route       string
	errorType   string
	message     string
	stacktrace  string
	source      string
	vitalName   string
	vitalValue  float64
	vitalRating string
	actionType  string
	actionName  string
	target      string
}

func (reader *telemetryReader) Sessions(ctx context.Context, scope telemetryScope, filter rumtypes.SessionFilter, page rumtypes.Page) ([]*sessionRow, error) {
	rows := []*sessionRow{}
	err := reader.query(ctx, "Sessions", newSessionsQuery(scope, filter, page), func(scanner driver.Rows) error {
		row := &sessionRow{}
		if err := scanner.Scan(&row.sessionID, &row.startedAt, &row.endedNs, &row.views, &row.fingerprint, &row.total); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

func (reader *telemetryReader) SessionOverviews(ctx context.Context, scope telemetryScope, sessionIDs []string) (map[string]sessionOverview, error) {
	overviews := map[string]sessionOverview{}
	if len(sessionIDs) == 0 {
		return overviews, nil
	}
	err := reader.query(ctx, "SessionOverviews", newSessionOverviewsQuery(scope, sessionIDs), func(scanner driver.Rows) error {
		var sessionID string
		row := sessionOverview{}
		if err := scanner.Scan(&sessionID, &row.startedAt, &row.views); err != nil {
			return err
		}
		overviews[sessionID] = row
		return nil
	})
	return overviews, err
}

func (reader *telemetryReader) SessionLogCounts(ctx context.Context, scope telemetryScope, sessionIDs []string) (map[string]sessionLogCounts, error) {
	counts := map[string]sessionLogCounts{}
	if len(sessionIDs) == 0 {
		return counts, nil
	}
	err := reader.query(ctx, "SessionLogCounts", newSessionLogCountsQuery(scope, sessionIDs), func(scanner driver.Rows) error {
		var sessionID string
		row := sessionLogCounts{}
		if err := scanner.Scan(&sessionID, &row.actions, &row.errors); err != nil {
			return err
		}
		counts[sessionID] = row
		return nil
	})
	return counts, err
}

func (reader *telemetryReader) SessionAttributes(ctx context.Context, scope telemetryScope, sessionIDs []string) (map[string]sessionAttributes, error) {
	attributes := map[string]sessionAttributes{}
	if len(sessionIDs) == 0 {
		return attributes, nil
	}
	err := reader.query(ctx, "SessionAttributes", newSessionAttributesQuery(scope, sessionIDs), func(scanner driver.Rows) error {
		var sessionID string
		row := sessionAttributes{}
		if err := scanner.Scan(&sessionID, &row.previousID, &row.userID); err != nil {
			return err
		}
		attributes[sessionID] = row
		return nil
	})
	return attributes, err
}

// SessionSpans returns the session's views and requests in time order.
func (reader *telemetryReader) SessionSpans(ctx context.Context, scope telemetryScope, sessionID string) ([]*sessionSpanRow, error) {
	rows := []*sessionSpanRow{}
	err := reader.query(ctx, "SessionSpans", newSessionSpansQuery(scope, sessionID), func(scanner driver.Rows) error {
		row := &sessionSpanRow{}
		if err := scanner.Scan(&row.timestamp, &row.spanID, &row.traceID, &row.name, &row.kind, &row.durationNs, &row.route, &row.path, &row.loadingType, &row.method, &row.url, &row.statusCode, &row.hasError, &row.fingerprint, &row.previousID, &row.userID); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

// SessionLogs returns the session's errors, vitals, clicks and actions in time order.
func (reader *telemetryReader) SessionLogs(ctx context.Context, scope telemetryScope, sessionID string) ([]*sessionLogRow, error) {
	rows := []*sessionLogRow{}
	err := reader.query(ctx, "SessionLogs", newSessionLogsQuery(scope, sessionID), func(scanner driver.Rows) error {
		row := &sessionLogRow{}
		if err := scanner.Scan(&row.timestamp, &row.event, &row.route, &row.errorType, &row.message, &row.stacktrace, &row.source, &row.vitalName, &row.vitalValue, &row.vitalRating, &row.actionType, &row.actionName, &row.target); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

func newSessionsQuery(scope telemetryScope, filter rumtypes.SessionFilter, page rumtypes.Page) *sqlbuilder.SelectBuilder {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		sqlbuilder.Escape(sessionColumn)+" AS session",
		"min(timestamp) AS started_at",
		"max(toUnixTimestamp64Nano(timestamp) + duration_nano) AS ended_ns",
		"countIf(name = "+literal(rumtypes.SpanNameView)+") AS views",
		"any(resource_fingerprint)",
		"count() OVER () AS total",
	)
	sb.From(spanTable)
	sb.Where(scopeConditions(sb, spanSignal, scope)...)
	sb.Where(sb.NE(sessionColumn, ""))

	if filter.HasError != nil {
		errors := sqlbuilder.NewSelectBuilder()
		errors.Select(sqlbuilder.Escape(sessionColumn)).From(logTable)
		errors.Where(scopeConditions(errors, logSignal, scope)...)
		errors.Where(errors.E(eventNameExpr, rumtypes.EventNameException))
		operator := " GLOBAL IN "
		if !*filter.HasError {
			operator = " GLOBAL NOT IN "
		}
		sb.Where(sqlbuilder.Escape(sessionColumn) + operator + "(" + sb.Var(errors) + ")")
	}
	if filter.UserID != "" {
		users := sqlbuilder.NewSelectBuilder()
		users.Select(sqlbuilder.Escape(sessionColumn)).From(spanTable)
		users.Where(scopeConditions(users, spanSignal, scope)...)
		users.Where(users.E(attribute(rumtypes.AttributeUserID), filter.UserID))
		sb.Where(sqlbuilder.Escape(sessionColumn) + " GLOBAL IN (" + sb.Var(users) + ")")
	}

	sb.GroupBy("session")
	having := []string{}
	if filter.Route != "" {
		having = append(having, "countIf(name = "+literal(rumtypes.SpanNameView)+" AND "+sqlbuilder.Escape(routeColumn)+" = "+sb.Var(filter.Route)+") > 0")
	}
	if filter.MinDuration > 0 {
		having = append(having, "ended_ns - toUnixTimestamp64Nano(started_at) >= "+sb.Var(filter.MinDuration.Nanoseconds()))
	}
	if filter.MaxDuration > 0 {
		having = append(having, "ended_ns - toUnixTimestamp64Nano(started_at) <= "+sb.Var(filter.MaxDuration.Nanoseconds()))
	}
	if len(having) > 0 {
		sb.Having(having...)
	}

	sb.OrderBy("started_at DESC", "session")
	sb.Limit(page.Limit)
	sb.Offset(page.Offset)
	return sb
}

func newSessionOverviewsQuery(scope telemetryScope, sessionIDs []string) *sqlbuilder.SelectBuilder {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(sqlbuilder.Escape(sessionColumn)+" AS session", "min(timestamp)", "countIf(name = "+literal(rumtypes.SpanNameView)+")")
	sb.From(spanTable)
	sb.Where(scopeConditions(sb, spanSignal, scope)...)
	sb.Where(sb.In(sessionColumn, anySlice(sessionIDs)...))
	sb.GroupBy("session")
	return sb
}

func newSessionLogCountsQuery(scope telemetryScope, sessionIDs []string) *sqlbuilder.SelectBuilder {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		sqlbuilder.Escape(sessionColumn)+" AS session",
		"countIf("+eventNameExpr+" IN ("+literal(rumtypes.EventNameClick)+", "+literal(rumtypes.EventNameCustomAction)+"))",
		"countIf("+eventNameExpr+" = "+literal(rumtypes.EventNameException)+")",
	)
	sb.From(logTable)
	sb.Where(scopeConditions(sb, logSignal, scope)...)
	sb.Where(sb.In(sessionColumn, anySlice(sessionIDs)...))
	sb.GroupBy("session")
	return sb
}

func newSessionAttributesQuery(scope telemetryScope, sessionIDs []string) *sqlbuilder.SelectBuilder {
	previousID, userID := attribute(rumtypes.AttributeSessionPreviousID), attribute(rumtypes.AttributeUserID)

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		sqlbuilder.Escape(sessionColumn)+" AS session",
		"anyIf("+previousID+", "+previousID+" != '')",
		"anyIf("+userID+", "+userID+" != '')",
	)
	sb.From(spanTable)
	sb.Where(scopeConditions(sb, spanSignal, scope)...)
	sb.Where(sb.In(sessionColumn, anySlice(sessionIDs)...), sb.E("name", rumtypes.SpanNameView))
	sb.GroupBy("session")
	return sb
}

func newSessionSpansQuery(scope telemetryScope, sessionID string) *sqlbuilder.SelectBuilder {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		"timestamp", "span_id", "toString(trace_id)", "name", "kind", "duration_nano",
		sqlbuilder.Escape(routeColumn),
		attribute(rumtypes.AttributeURLPath),
		attribute(rumtypes.AttributeViewLoadingType),
		"upper(http_method)", "http_url", "toUInt16OrZero(response_status_code)", "has_error", "resource_fingerprint",
		attribute(rumtypes.AttributeSessionPreviousID),
		attribute(rumtypes.AttributeUserID),
	)
	sb.From(spanTable)
	sb.Where(scopeConditions(sb, spanSignal, scope)...)
	sb.Where(
		sb.E(sessionColumn, sessionID),
		sb.Or(sb.E("name", rumtypes.SpanNameView), sb.And(sb.E("kind", spanKindClient), sb.NE("http_url", ""))),
	)
	sb.OrderBy("timestamp")
	sb.Limit(maxTimelineRows + 1)
	return sb
}

func newSessionLogsQuery(scope telemetryScope, sessionID string) *sqlbuilder.SelectBuilder {
	target, selector := attribute(rumtypes.AttributeActionTarget), attribute(rumtypes.AttributeCSSSelector)

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		"timestamp",
		eventNameExpr,
		sqlbuilder.Escape(routeColumn),
		errorTypeExpr,
		errorMessageRaw,
		errorStackExpr,
		attribute(rumtypes.AttributeErrorSource),
		"lower("+attribute(rumtypes.AttributeVitalName)+")",
		vitalValueExpr,
		attribute(rumtypes.AttributeVitalRating),
		attribute(rumtypes.AttributeActionType),
		attribute(rumtypes.AttributeActionName),
		"if("+target+" != '', "+target+", "+selector+")",
	)
	sb.From(logTable)
	sb.Where(scopeConditions(sb, logSignal, scope)...)
	sb.Where(sb.E(sessionColumn, sessionID), sb.In(eventNameExpr, timelineEvents...))
	sb.OrderBy("timestamp")
	sb.Limit(maxTimelineRows + 1)
	return sb
}
