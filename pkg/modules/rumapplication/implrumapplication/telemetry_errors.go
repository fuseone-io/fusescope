package implrumapplication

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	sqlbuilder "github.com/huandu/go-sqlbuilder"
)

// maxErrorKeys bounds the distinct (type, normalized message, top frame
// line) keys an error query maps to fingerprints; the keys travel in the
// query text.
const (
	maxErrorKeys     = 2000
	maxLatestErrors  = 10
	maxAffected      = 5
	maxErrorReleases = 50
)

var (
	errorTypeExpr   = attribute(rumtypes.AttributeExceptionType)
	errorMessageRaw = "if(" + attribute(rumtypes.AttributeExceptionMessage) + " = '', body, " + attribute(rumtypes.AttributeExceptionMessage) + ")"
	errorStackExpr  = attribute(rumtypes.AttributeExceptionStack)
	errorKeyColumns = []string{errorTypeExpr + " AS type", errorMessageExpr(errorMessageRaw) + " AS normalized_message", stackFrameLineExpr(errorStackExpr) + " AS frame_line"}
	errorKeyExpr    = "cityHash64(type, normalized_message, frame_line)"
)

type errorKeyRow struct {
	key               uint64
	exceptionType     string
	normalizedMessage string
	frameLine         string
	firstSeen         uint64
	firstFingerprint  string
}

type errorGroupRow struct {
	index       uint16
	events      uint64
	sessions    uint64
	firstSeen   uint64
	lastSeen    uint64
	message     string
	route       string
	source      string
	frameLine   string
	lastRelease string
	releases    []string
	sparkline   map[uint64]uint64
}

type errorEventRow struct {
	id          string
	timestamp   uint64
	sessionID   string
	route       string
	fingerprint string
	key         uint64
	errorType   string
	message     string
	source      string
	stacktrace  string
}

type affectedSessionRow struct {
	sessionID   string
	lastError   uint64
	errors      uint64
	fingerprint string
}

// ErrorKeys lists the error keys of the scope with when each was first seen.
func (reader *telemetryReader) ErrorKeys(ctx context.Context, scope telemetryScope) ([]*errorKeyRow, error) {
	rows := []*errorKeyRow{}
	err := reader.query(ctx, "ErrorKeys", newErrorKeysQuery(scope), func(scanner driver.Rows) error {
		row := &errorKeyRow{}
		if err := scanner.Scan(&row.key, &row.exceptionType, &row.normalizedMessage, &row.frameLine, &row.firstSeen, &row.firstFingerprint); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

// ErrorGroups aggregates the scope's error events by group, keys mapping to
// 1-based group indexes.
func (reader *telemetryReader) ErrorGroups(ctx context.Context, scope telemetryScope, keys []uint64, indexes []uint16, step time.Duration) ([]*errorGroupRow, error) {
	rows := []*errorGroupRow{}
	if len(keys) == 0 {
		return rows, nil
	}
	err := reader.query(ctx, "ErrorGroups", newErrorGroupsQuery(scope, keys, indexes, step), func(scanner driver.Rows) error {
		row := &errorGroupRow{}
		if err := scanner.Scan(&row.index, &row.events, &row.sessions, &row.firstSeen, &row.lastSeen, &row.message, &row.route, &row.source, &row.frameLine, &row.lastRelease, &row.releases, &row.sparkline); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

func (reader *telemetryReader) ErrorEvents(ctx context.Context, scope telemetryScope, keys []uint64) ([]*errorEventRow, error) {
	rows := []*errorEventRow{}
	err := reader.query(ctx, "ErrorEvents", newErrorEventsQuery(scope, keys), func(scanner driver.Rows) error {
		row := &errorEventRow{}
		if err := scanner.Scan(&row.id, &row.timestamp, &row.sessionID, &row.route, &row.fingerprint, &row.key, &row.errorType, &row.message, &row.source, &row.stacktrace); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

func (reader *telemetryReader) AffectedSessions(ctx context.Context, scope telemetryScope, keys []uint64) ([]*affectedSessionRow, error) {
	rows := []*affectedSessionRow{}
	err := reader.query(ctx, "AffectedSessions", newAffectedSessionsQuery(scope, keys), func(scanner driver.Rows) error {
		row := &affectedSessionRow{}
		if err := scanner.Scan(&row.sessionID, &row.lastError, &row.errors, &row.fingerprint); err != nil {
			return err
		}
		rows = append(rows, row)
		return nil
	})
	return rows, err
}

func newErrorKeysQuery(scope telemetryScope) *sqlbuilder.SelectBuilder {
	events := newErrorRowsQuery(scope)

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(errorKeyExpr+" AS key", "type", "normalized_message", "frame_line", "min(timestamp) AS first_seen", "argMin(resource_fingerprint, timestamp)")
	sb.From(sb.BuilderAs(events, "events"))
	sb.GroupBy("type", "normalized_message", "frame_line")
	sb.OrderBy("max(timestamp) DESC")
	sb.Limit(maxErrorKeys)
	return sb
}

func newErrorGroupsQuery(scope telemetryScope, keys []uint64, indexes []uint16, step time.Duration) *sqlbuilder.SelectBuilder {
	events := newErrorRowsQuery(scope)
	events.SelectMore(
		sqlbuilder.Escape(sessionColumn)+" AS session",
		sqlbuilder.Escape(routeColumn)+" AS route",
		errorMessageRaw+" AS message",
		attribute(rumtypes.AttributeErrorSource)+" AS source",
	)

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		"transform("+errorKeyExpr+", "+sb.Var(keys)+", "+sb.Var(indexes)+", toUInt16(0)) AS group_index",
		"count()",
		"uniqIf(e.session, e.session != '')",
		"min(e.timestamp)",
		"max(e.timestamp)",
		"argMax(e.message, e.timestamp)",
		"argMax(e.route, e.timestamp)",
		"argMax(e.source, e.timestamp)",
		"argMax(e.frame_line, e.timestamp)",
		"argMax(r.release, e.timestamp)",
		"groupUniqArrayIf("+literalInt(int64(maxErrorReleases))+")(r.release, r.release != '')",
		"sumMap(map(toUInt64(intDiv(e.timestamp, "+literalInt(step.Nanoseconds())+") * "+literalInt(int64(step.Seconds()))+"), toUInt64(1)))",
	)
	sb.From(sb.BuilderAs(events, "e"))
	sb.JoinWithOption(globalAnyLeftJoin, sb.BuilderAs(resourceDimension(logSignal, scope), "r"), "e.resource_fingerprint = r.fingerprint")
	sb.GroupBy("group_index")
	sb.Having("group_index != 0")
	sb.SQL(smallJoinSettings)
	return sb
}

func newErrorEventsQuery(scope telemetryScope, keys []uint64) *sqlbuilder.SelectBuilder {
	events := newErrorRowsQuery(scope)
	events.SelectMore(
		"id",
		sqlbuilder.Escape(sessionColumn)+" AS session",
		sqlbuilder.Escape(routeColumn)+" AS route",
		errorMessageRaw+" AS message",
		attribute(rumtypes.AttributeErrorSource)+" AS source",
		errorStackExpr+" AS stacktrace",
	)

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("id", "timestamp", "session", "route", "resource_fingerprint", errorKeyExpr+" AS key", "type", "message", "source", "stacktrace")
	sb.From(sb.BuilderAs(events, "events"))
	sb.Where(sb.In(errorKeyExpr, anySlice(keys)...))
	sb.OrderBy("timestamp DESC")
	sb.Limit(maxLatestErrors)
	return sb
}

func newAffectedSessionsQuery(scope telemetryScope, keys []uint64) *sqlbuilder.SelectBuilder {
	events := newErrorRowsQuery(scope)
	events.SelectMore(sqlbuilder.Escape(sessionColumn) + " AS session")

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("session", "max(timestamp) AS last_error", "count()", "argMax(resource_fingerprint, timestamp)")
	sb.From(sb.BuilderAs(events, "events"))
	sb.Where(sb.In(errorKeyExpr, anySlice(keys)...), sb.NE("session", ""))
	sb.GroupBy("session")
	sb.OrderBy("last_error DESC")
	sb.Limit(maxAffected)
	return sb
}

// newErrorRowsQuery selects the scope's error events with their key columns.
func newErrorRowsQuery(scope telemetryScope) *sqlbuilder.SelectBuilder {
	sb := sqlbuilder.NewSelectBuilder()
	columns := []string{"timestamp", "resource_fingerprint"}
	for _, column := range errorKeyColumns {
		columns = append(columns, sqlbuilder.Escape(column))
	}
	sb.Select(columns...)
	sb.From(logTable)
	sb.Where(scopeConditions(sb, logSignal, scope)...)
	sb.Where(sb.E(eventNameExpr, rumtypes.EventNameException))
	return sb
}
