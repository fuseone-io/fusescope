package retentiontypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTTLClauseStatement(t *testing.T) {
	testCases := []struct {
		name    string
		ttl     TTLClause
		table   string
		cluster string
		want    string
	}{
		{
			name:    "UnixNano_DeleteOnly",
			ttl:     TTLClause{Time: UnixNanoTime("timestamp"), Delete: IntervalSeconds(1296000)},
			table:   "signoz_logs.logs_v2",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_logs.logs_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp / 1000000000) + INTERVAL 1296000 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "UnixNano_WithColdStorage",
			ttl:     TTLClause{Time: UnixNanoTime("timestamp"), Delete: IntervalSeconds(2592000), Volume: "cold", MoveAfter: IntervalSeconds(86400)},
			table:   "signoz_logs.logs_v2",
			cluster: "prod",
			want:    "ALTER TABLE signoz_logs.logs_v2 ON CLUSTER prod MODIFY TTL toDateTime(timestamp / 1000000000) + INTERVAL 2592000 SECOND DELETE, toDateTime(timestamp / 1000000000) + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "ResourceBucket_WithColdStorage",
			ttl:     TTLClause{Time: ResourceBucketTime, Delete: IntervalSeconds(604800), Volume: "s3", MoveAfter: IntervalSeconds(3600)},
			table:   "signoz_traces.traces_v3_resource",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_traces.traces_v3_resource ON CLUSTER cluster MODIFY TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + INTERVAL 604800 SECOND DELETE, toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + INTERVAL 3600 SECOND TO VOLUME 's3' SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "DateTimeColumn_DeleteOnly",
			ttl:     TTLClause{Time: DateTimeOf("end"), Delete: IntervalSeconds(172800)},
			table:   "signoz_traces.trace_summary",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_traces.trace_summary ON CLUSTER cluster MODIFY TTL toDateTime(end) + INTERVAL 172800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "UnixMilli_WithColdStorage",
			ttl:     TTLClause{Time: UnixMilliTime("unix_milli"), Delete: IntervalSeconds(2592000), Volume: "cold", MoveAfter: IntervalSeconds(7200)},
			table:   "signoz_metrics.samples_v4",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_metrics.samples_v4 ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 7200 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "PlainColumn_Days",
			ttl:     TTLClause{Time: "timestamp", Delete: IntervalDays(30)},
			table:   "signoz_logs.logs_attribute_keys",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_logs.logs_attribute_keys ON CLUSTER cluster MODIFY TTL timestamp + toIntervalDay(30) DELETE SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "DaysColumn_WithColdStorage",
			ttl:     TTLClause{Time: UnixNanoTime("timestamp"), Delete: IntervalDaysOf("_retention_days"), Volume: "cold", MoveAfter: IntervalDaysOf("_retention_days_cold")},
			table:   "signoz_logs.logs_v2",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_logs.logs_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp / 1000000000) + toIntervalDay(_retention_days) DELETE, toDateTime(timestamp / 1000000000) + toIntervalDay(_retention_days_cold) TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "Backstop_WithIngestionAndColdStorage",
			ttl:     TTLClause{Time: UnixNanoTime("timestamp"), Delete: IntervalDaysOf("_retention_days"), Ingestion: DateTimeOf("created_at"), Backstop: IntervalDays(7), Volume: "cold", MoveAfter: IntervalDaysOf("_retention_days_cold")},
			table:   "signoz_logs.logs_v2",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_logs.logs_v2 ON CLUSTER cluster MODIFY TTL greatest(toDateTime(timestamp / 1000000000) + toIntervalDay(_retention_days), toDateTime(created_at) + toIntervalDay(_retention_days) + toIntervalDay(7)) DELETE, toDateTime(timestamp / 1000000000) + toIntervalDay(_retention_days_cold) TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "Backstop_NoIngestionColumn",
			ttl:     TTLClause{Time: ResourceBucketTime, Delete: IntervalDaysOf("_retention_days"), Backstop: IntervalDays(10)},
			table:   "signoz_logs.logs_v2_resource",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_logs.logs_v2_resource ON CLUSTER cluster MODIFY TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + toIntervalDay(_retention_days) + toIntervalDay(10) DELETE SETTINGS materialize_ttl_after_modify=0",
		},
		{
			name:    "VolumeWithQuote_Escaped",
			ttl:     TTLClause{Time: UnixNanoTime("timestamp"), Delete: IntervalSeconds(60), Volume: "co'ld", MoveAfter: IntervalSeconds(30)},
			table:   "signoz_logs.logs_v2",
			cluster: "cluster",
			want:    `ALTER TABLE signoz_logs.logs_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp / 1000000000) + INTERVAL 60 SECOND DELETE, toDateTime(timestamp / 1000000000) + INTERVAL 30 SECOND TO VOLUME 'co\'ld' SETTINGS materialize_ttl_after_modify=0`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, testCase.ttl.Statement(testCase.table, testCase.cluster))
		})
	}
}

func TestColdStorageVolume(t *testing.T) {
	testCases := []struct {
		name  string
		query string
		want  string
	}{
		{name: "NoMoveRule_Empty", query: "CREATE TABLE signoz_logs.logs_v2 (`ts` UInt64) ENGINE = MergeTree TTL toDateTime(timestamp / 1000000000) + toIntervalDay(_retention_days) SETTINGS index_granularity = 8192", want: ""},
		{name: "MoveRule_Volume", query: "CREATE TABLE signoz_logs.logs_v2 (`ts` UInt64) ENGINE = MergeTree TTL toDateTime(timestamp / 1000000000) + toIntervalDay(_retention_days), toDateTime(timestamp / 1000000000) + toIntervalDay(_retention_days_cold) TO VOLUME 'cold' SETTINGS storage_policy = 'tiered'", want: "cold"},
		{name: "EscapedQuote_Unescaped", query: `CREATE TABLE t (a UInt8) ENGINE = MergeTree TTL a + toIntervalDay(1) TO VOLUME 'co\'ld' SETTINGS index_granularity = 8192`, want: "co'ld"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, ColdStorageVolume(testCase.query))
		})
	}
}
