package implwatchdog

import (
	"context"
	"time"

	sqlbuilder "github.com/huandu/go-sqlbuilder"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/ctxtypes"
	"github.com/fuseone-io/fusescope/pkg/types/instrumentationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
)

var ErrCodeQueryExceptions = errors.MustNewCode("watchdog_query_exceptions_failed")

var errorIndexTable = clickhousesql.Identifier(tracestelemetryschema.DBName) + "." + clickhousesql.Identifier(tracestelemetryschema.ErrorIndexV2TableName)

type exceptionReader interface {
	// ListNewGroups returns, in cursor order, the groups first seen in the
	// lookback ending at the window's end and after the cursor: at most
	// ExceptionBatchSize plus one.
	ListNewGroups(ctx context.Context, window watchdogtypes.Window, cursor watchdogtypes.ExceptionCursor) ([]watchdogtypes.ExceptionGroup, error)
}

type telemetryExceptionReader struct {
	telemetryStore telemetrystore.TelemetryStore
}

func newTelemetryExceptionReader(telemetryStore telemetrystore.TelemetryStore) *telemetryExceptionReader {
	return &telemetryExceptionReader{telemetryStore: telemetryStore}
}

func (reader *telemetryExceptionReader) ListNewGroups(ctx context.Context, window watchdogtypes.Window, cursor watchdogtypes.ExceptionCursor) ([]watchdogtypes.ExceptionGroup, error) {
	query, args := newExceptionGroupsQuery(window, cursor).BuildWithFlavor(sqlbuilder.ClickHouse)
	ctx = ctxtypes.NewContextWithCommentVals(ctx, map[string]string{
		instrumentationtypes.TelemetrySignal:  telemetrytypes.SignalTraces.StringValue(),
		instrumentationtypes.CodeNamespace:    "watchdog",
		instrumentationtypes.CodeFunctionName: "ListNewGroups",
	})
	rows, err := reader.telemetryStore.ClickhouseDB().Query(ctx, query, args...)
	if err != nil {
		return nil, errors.WrapInternalf(err, ErrCodeQueryExceptions, "couldn't query the new exception groups")
	}
	defer rows.Close()

	groups := make([]watchdogtypes.ExceptionGroup, 0)
	for rows.Next() {
		var group watchdogtypes.ExceptionGroup
		if err := rows.Scan(&group.GroupID, &group.Service, &group.Type, &group.FirstSeen); err != nil {
			return nil, errors.WrapInternalf(err, ErrCodeQueryExceptions, "couldn't read a new exception group")
		}
		groups = append(groups, group)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.WrapInternalf(err, ErrCodeQueryExceptions, "couldn't read the new exception groups")
	}
	return groups, nil
}

// newExceptionGroupsQuery aggregates over the whole lookback only the groups
// with an occurrence since the cursor: only they can be first seen after it.
func newExceptionGroupsQuery(window watchdogtypes.Window, cursor watchdogtypes.ExceptionCursor) *sqlbuilder.SelectBuilder {
	recent := sqlbuilder.NewSelectBuilder()
	recent.Select("groupID").From(errorIndexTable)
	recent.Where(atOrAfter(recent, cursor.FirstSeen), atOrBefore(recent, window.End))

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("groupID", "any(serviceName) AS service", "any(exceptionType) AS exception_type", "min(timestamp) AS first_seen")
	sb.From(errorIndexTable)
	sb.Where(atOrAfter(sb, window.End.Add(-watchdogtypes.ExceptionLookback)), atOrBefore(sb, window.End))
	sb.Where("groupID GLOBAL IN (" + sb.Var(recent) + ")")
	sb.GroupBy("groupID")
	after := "first_seen > " + nanos(sb, cursor.FirstSeen)
	if cursor.GroupID == "" {
		sb.Having(after)
	} else {
		sb.Having(sb.Or(after, sb.And("first_seen = "+nanos(sb, cursor.FirstSeen), sb.GreaterThan("groupID", cursor.GroupID))))
	}
	sb.OrderBy("first_seen", "groupID")
	sb.Limit(watchdogtypes.ExceptionBatchSize + 1)
	return sb
}

func atOrAfter(sb *sqlbuilder.SelectBuilder, at time.Time) string {
	return "timestamp >= " + nanos(sb, at)
}

func atOrBefore(sb *sqlbuilder.SelectBuilder, at time.Time) string {
	return "timestamp <= " + nanos(sb, at)
}

func nanos(sb *sqlbuilder.SelectBuilder, at time.Time) string {
	return "fromUnixTimestamp64Nano(" + sb.Var(at.UnixNano()) + ")"
}
