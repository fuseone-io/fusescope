package clickhouseReader

import (
	"strings"

	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

// logsTTLTables are the local logs tables a logs retention applies to.
type logsTTLTables struct {
	Logs          string
	Resource      string
	AttributeKeys string
	ResourceKeys  string
}

// tracesTTLTables are the local traces tables a traces retention applies to; Resource,
// Summary and SpanAttributesKeys are among Tables and get their own time expression or no
// move rule.
type tracesTTLTables struct {
	Tables             []string
	Resource           string
	Summary            string
	SpanAttributesKeys string
}

// logsTTLStatements are the TTL statements of a v1 logs retention, by table. The keys
// tables get no move rule.
func logsTTLStatements(tables logsTTLTables, cluster string, params *retentiontypes.TTLParams) map[string]string {
	deleteAfter := retentiontypes.IntervalSeconds(params.DelDuration)
	moveAfter := retentiontypes.IntervalSeconds(params.ToColdStorageDuration)

	return map[string]string{
		// TTL query for logs_v2 table
		tables.Logs: retentiontypes.TTLClause{Time: retentiontypes.UnixNanoTime("timestamp"), Delete: deleteAfter, Volume: params.ColdStorageVolume, MoveAfter: moveAfter}.Statement(tables.Logs, cluster),
		// TTL query for logs_v2_resource table
		// adding 1800 as our bucket size is 1800 seconds
		tables.Resource:      retentiontypes.TTLClause{Time: retentiontypes.ResourceBucketTime, Delete: deleteAfter, Volume: params.ColdStorageVolume, MoveAfter: moveAfter}.Statement(tables.Resource, cluster),
		tables.AttributeKeys: retentiontypes.TTLClause{Time: "timestamp", Delete: deleteAfter}.Statement(tables.AttributeKeys, cluster),
		tables.ResourceKeys:  retentiontypes.TTLClause{Time: "timestamp", Delete: deleteAfter}.Statement(tables.ResourceKeys, cluster),
	}
}

// customRetentionLogsTTLStatements are the TTL statements of a custom (v2) logs retention,
// by table. The logs and resource TTLs read _retention_days, so they are rewritten only to
// set a move rule; the keys tables keep keysRetentionDays.
func customRetentionLogsTTLStatements(tables logsTTLTables, cluster string, coldStorageVolume string, keysRetentionDays int) map[string]string {
	statements := map[string]string{
		tables.AttributeKeys: retentiontypes.TTLClause{Time: "timestamp", Delete: retentiontypes.IntervalDays(keysRetentionDays)}.Statement(tables.AttributeKeys, cluster),
		tables.ResourceKeys:  retentiontypes.TTLClause{Time: "timestamp", Delete: retentiontypes.IntervalDays(keysRetentionDays)}.Statement(tables.ResourceKeys, cluster),
	}
	if coldStorageVolume == "" {
		return statements
	}

	deleteAfter := retentiontypes.IntervalDaysColumn("_retention_days")
	moveAfter := retentiontypes.IntervalDaysColumn("_retention_days_cold")
	statements[tables.Logs] = retentiontypes.TTLClause{Time: retentiontypes.UnixNanoTime("timestamp"), Delete: deleteAfter, Volume: coldStorageVolume, MoveAfter: moveAfter}.Statement(tables.Logs, cluster)
	statements[tables.Resource] = retentiontypes.TTLClause{Time: retentiontypes.ResourceBucketTime, Delete: deleteAfter, Volume: coldStorageVolume, MoveAfter: moveAfter}.Statement(tables.Resource, cluster)

	return statements
}

func tracesTTLStatements(tables tracesTTLTables, cluster string, params *retentiontypes.TTLParams) map[string]string {
	statements := make(map[string]string, len(tables.Tables))
	for _, table := range tables.Tables {
		// TTL query
		clause := retentiontypes.TTLClause{Time: retentiontypes.DateTimeOf("timestamp"), Delete: retentiontypes.IntervalSeconds(params.DelDuration)}
		switch table {
		case tables.Resource:
			// TTL query for resource table
			clause.Time = retentiontypes.ResourceBucketTime
		case tables.Summary:
			// for trace summary table, we need to use end instead of timestamp
			clause.Time = retentiontypes.DateTimeOf("end")
		}
		if table != tables.SpanAttributesKeys {
			clause.Volume = params.ColdStorageVolume
			clause.MoveAfter = retentiontypes.IntervalSeconds(params.ToColdStorageDuration)
		}
		statements[table] = clause.Statement(table, cluster)
	}

	return statements
}

func metricsTTLStatements(tables []string, cluster string, params *retentiontypes.TTLParams) map[string]string {
	statements := make(map[string]string, len(tables))
	for _, table := range tables {
		timeColumn := "timestamp_ms"
		if strings.Contains(table, "v4") || strings.Contains(table, "exp_hist") {
			timeColumn = "unix_milli"
		}
		statements[table] = retentiontypes.TTLClause{
			Time:      retentiontypes.UnixMilliTime(timeColumn),
			Delete:    retentiontypes.IntervalSeconds(params.DelDuration),
			Volume:    params.ColdStorageVolume,
			MoveAfter: retentiontypes.IntervalSeconds(params.ToColdStorageDuration),
		}.Statement(table, cluster)
	}

	return statements
}
