package retentiontypes

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
)

const (
	// ResourceBucketTime is the end of a resource row's 30-minute bucket.
	ResourceBucketTime = "toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800)"
)

var (
	coldStorageVolumeRegexp   = regexp.MustCompile(`TO VOLUME '((?:[^'\\]|\\.)*)'`)
	stringLiteralUnescapeRule = strings.NewReplacer(`\'`, `'`, `\\`, `\`)
)

// TTLClause is a table's TTL: rows are deleted Delete after Time and, when Volume is set,
// moved to it MoveAfter after Time. Time, Delete and MoveAfter are ClickHouse expressions.
//
// A Backstop (the archive's, ADR 0002 §5) delays deletion by that interval, counted from
// Ingestion when the table has an ingestion-time column and from Time otherwise; with
// Ingestion, rows never expire before Time + Delete.
type TTLClause struct {
	Time      string
	Delete    string
	Ingestion string
	Backstop  string
	Volume    string
	MoveAfter string
}

// Statement replaces the TTL of table on every node of cluster.
func (clause TTLClause) Statement(table string, cluster string) string {
	ttl := clause.expiry() + " DELETE"
	if clause.Volume != "" {
		ttl += fmt.Sprintf(", %s + %s TO VOLUME %s", clause.Time, clause.MoveAfter, clickhousesql.StringLiteral(clause.Volume))
	}

	// https://github.com/SigNoz/signoz/issues/5470
	// we will change ttl for only the new parts and not the old ones
	return fmt.Sprintf("ALTER TABLE %s ON CLUSTER %s MODIFY TTL %s SETTINGS materialize_ttl_after_modify=0", table, cluster, ttl)
}

// ColdStorageVolume returns the volume of the move rule in a table's create_table_query,
// or "" when its TTL has none.
func ColdStorageVolume(createTableQuery string) string {
	match := coldStorageVolumeRegexp.FindStringSubmatch(createTableQuery)
	if match == nil {
		return ""
	}
	return stringLiteralUnescapeRule.Replace(match[1])
}

// ValidateColdStorage refuses a move rule without cold-storage days: rows would move as soon
// as the TTL is materialized.
func ValidateColdStorage(volume string, days int) error {
	if volume != "" && days == 0 {
		return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "the TTL moves rows to volume %s without cold-storage days; set them in the retention settings", volume)
	}
	return nil
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

// LogsColdStorageDays is the cold-storage delay of a custom-retention logs row. Rows
// written before cold storage was set have _retention_days_cold = 0, which would move
// them at their next merge; they move after days instead.
func LogsColdStorageDays(days int) string {
	return fmt.Sprintf("if(_retention_days_cold = 0, %d, _retention_days_cold)", days)
}

func IntervalDaysOf(expression string) string {
	return fmt.Sprintf("toIntervalDay(%s)", expression)
}

func (clause TTLClause) expiry() string {
	expiry := fmt.Sprintf("%s + %s", clause.Time, clause.Delete)
	switch {
	case clause.Backstop == "":
		return expiry
	case clause.Ingestion == "":
		return fmt.Sprintf("%s + %s", expiry, clause.Backstop)
	default:
		return fmt.Sprintf("greatest(%s, %s + %s + %s)", expiry, clause.Ingestion, clause.Delete, clause.Backstop)
	}
}
