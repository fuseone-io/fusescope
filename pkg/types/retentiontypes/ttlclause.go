package retentiontypes

import (
	"fmt"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
)

const (
	// ResourceBucketTime is the end of a resource row's 30-minute bucket.
	ResourceBucketTime = "toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800)"

	// LogsColdStorageDays is the cold-storage delay of a custom-retention logs row. Rows
	// written before cold storage was set have _retention_days_cold = 0, which would move
	// them at their next merge; they move at their retention instead.
	LogsColdStorageDays = "if(_retention_days_cold = 0, _retention_days, _retention_days_cold)"
)

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

func IntervalDaysOf(expression string) string {
	return fmt.Sprintf("toIntervalDay(%s)", expression)
}
