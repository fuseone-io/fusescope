package retentiontypes

import (
	"fmt"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
)

// ResourceBucketTime is the end of a resource row's 30-minute bucket.
const ResourceBucketTime = "toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800)"

// TTLClause is a table's TTL: rows are deleted Delete after Time and, when Volume is set,
// moved to it MoveAfter after Time. Time, Delete and MoveAfter are ClickHouse expressions.
type TTLClause struct {
	Time      string
	Delete    string
	Volume    string
	MoveAfter string
}

// Statement replaces the TTL of table on every node of cluster.
func (clause TTLClause) Statement(table string, cluster string) string {
	ttl := fmt.Sprintf("%s + %s DELETE", clause.Time, clause.Delete)
	if clause.Volume != "" {
		ttl += fmt.Sprintf(", %s + %s TO VOLUME %s", clause.Time, clause.MoveAfter, clickhousesql.StringLiteral(clause.Volume))
	}

	// https://github.com/SigNoz/signoz/issues/5470
	// we will change ttl for only the new parts and not the old ones
	return fmt.Sprintf("ALTER TABLE %s ON CLUSTER %s MODIFY TTL %s SETTINGS materialize_ttl_after_modify=0", table, cluster, ttl)
}

func UnixNanoTime(column string) string {
	return fmt.Sprintf("toDateTime(%s / 1000000000)", column)
}

func UnixMilliTime(column string) string {
	return fmt.Sprintf("toDateTime(toUInt32(%s / 1000), 'UTC')", column)
}

func DateTimeOf(column string) string {
	return fmt.Sprintf("toDateTime(%s)", column)
}

func IntervalSeconds(seconds int64) string {
	return fmt.Sprintf("INTERVAL %d SECOND", seconds)
}

func IntervalDays(days int) string {
	return fmt.Sprintf("toIntervalDay(%d)", days)
}

func IntervalDaysColumn(column string) string {
	return fmt.Sprintf("toIntervalDay(%s)", column)
}
