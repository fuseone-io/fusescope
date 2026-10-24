package clickhouseReader

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

var (
	testLogsTTLTables = logsTTLTables{
		Logs:          "signoz_logs.logs_v2",
		Resource:      "signoz_logs.logs_v2_resource",
		AttributeKeys: "signoz_logs.logs_attribute_keys",
		ResourceKeys:  "signoz_logs.logs_resource_keys",
	}
	testTracesTTLTables = tracesTTLTables{
		Tables: []string{
			"signoz_traces.signoz_index_v3",
			"signoz_traces.traces_v3_resource",
			"signoz_traces.signoz_error_index_v2",
			"signoz_traces.usage_explorer",
			"signoz_traces.dependency_graph_minutes_v2",
			"signoz_traces.trace_summary",
			"signoz_traces.span_attributes_keys",
		},
		Resource:           "signoz_traces.traces_v3_resource",
		Summary:            "signoz_traces.trace_summary",
		SpanAttributesKeys: "signoz_traces.span_attributes_keys",
	}
	testMetricsTTLTables = []string{
		"signoz_metrics.samples_v4",
		"signoz_metrics.samples_v4_agg_5m",
		"signoz_metrics.samples_v4_agg_30m",
		"signoz_metrics.exp_hist",
		"signoz_metrics.time_series_v4",
		"signoz_metrics.time_series_v4_6hrs",
		"signoz_metrics.time_series_v4_1day",
		"signoz_metrics.time_series_v4_1week",
	}
)

func TestLogsTTLStatements(t *testing.T) {
	testCases := []struct {
		name   string
		params *retentiontypes.TTLParams
		want   map[string]string
	}{
		{
			name:   "DeleteOnly",
			params: &retentiontypes.TTLParams{Type: retentiontypes.LogsTTL, DelDuration: 1296000},
			want: map[string]string{
				"signoz_logs.logs_v2":             "ALTER TABLE signoz_logs.logs_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp / 1000000000) + INTERVAL 1296000 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_v2_resource":    "ALTER TABLE signoz_logs.logs_v2_resource ON CLUSTER cluster MODIFY TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + INTERVAL 1296000 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_attribute_keys": "ALTER TABLE signoz_logs.logs_attribute_keys ON CLUSTER cluster MODIFY TTL timestamp + INTERVAL 1296000 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_resource_keys":  "ALTER TABLE signoz_logs.logs_resource_keys ON CLUSTER cluster MODIFY TTL timestamp + INTERVAL 1296000 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
			},
		},
		{
			name:   "ColdStorage_NotOnKeysTables",
			params: &retentiontypes.TTLParams{Type: retentiontypes.LogsTTL, DelDuration: 2592000, ColdStorageVolume: "cold", ToColdStorageDuration: 86400},
			want: map[string]string{
				"signoz_logs.logs_v2":             "ALTER TABLE signoz_logs.logs_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp / 1000000000) + INTERVAL 2592000 SECOND DELETE, toDateTime(timestamp / 1000000000) + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_v2_resource":    "ALTER TABLE signoz_logs.logs_v2_resource ON CLUSTER cluster MODIFY TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + INTERVAL 2592000 SECOND DELETE, toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_attribute_keys": "ALTER TABLE signoz_logs.logs_attribute_keys ON CLUSTER cluster MODIFY TTL timestamp + INTERVAL 2592000 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_resource_keys":  "ALTER TABLE signoz_logs.logs_resource_keys ON CLUSTER cluster MODIFY TTL timestamp + INTERVAL 2592000 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, logsTTLStatements(testLogsTTLTables, "cluster", testCase.params))
		})
	}
}

func TestCustomRetentionLogsTTLStatements(t *testing.T) {
	testCases := []struct {
		name   string
		volume string
		want   map[string]string
	}{
		{
			name: "NoColdStorage_KeysTablesOnly",
			want: map[string]string{
				"signoz_logs.logs_attribute_keys": "ALTER TABLE signoz_logs.logs_attribute_keys ON CLUSTER cluster MODIFY TTL timestamp + toIntervalDay(30) DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_resource_keys":  "ALTER TABLE signoz_logs.logs_resource_keys ON CLUSTER cluster MODIFY TTL timestamp + toIntervalDay(30) DELETE SETTINGS materialize_ttl_after_modify=0",
			},
		},
		{
			name:   "ColdStorage_MoveRuleFromColumn",
			volume: "cold",
			want: map[string]string{
				"signoz_logs.logs_v2":             "ALTER TABLE signoz_logs.logs_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp / 1000000000) + toIntervalDay(_retention_days) DELETE, toDateTime(timestamp / 1000000000) + toIntervalDay(if(_retention_days_cold = 0, _retention_days, _retention_days_cold)) TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_v2_resource":    "ALTER TABLE signoz_logs.logs_v2_resource ON CLUSTER cluster MODIFY TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + toIntervalDay(_retention_days) DELETE, toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + toIntervalDay(if(_retention_days_cold = 0, _retention_days, _retention_days_cold)) TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_attribute_keys": "ALTER TABLE signoz_logs.logs_attribute_keys ON CLUSTER cluster MODIFY TTL timestamp + toIntervalDay(30) DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_logs.logs_resource_keys":  "ALTER TABLE signoz_logs.logs_resource_keys ON CLUSTER cluster MODIFY TTL timestamp + toIntervalDay(30) DELETE SETTINGS materialize_ttl_after_modify=0",
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, customRetentionLogsTTLStatements(testLogsTTLTables, "cluster", testCase.volume, 30))
		})
	}
}

func TestTracesTTLStatements(t *testing.T) {
	testCases := []struct {
		name   string
		params *retentiontypes.TTLParams
		want   map[string]string
	}{
		{
			name:   "DeleteOnly",
			params: &retentiontypes.TTLParams{Type: retentiontypes.TraceTTL, DelDuration: 604800},
			want: map[string]string{
				"signoz_traces.signoz_index_v3":             "ALTER TABLE signoz_traces.signoz_index_v3 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.traces_v3_resource":          "ALTER TABLE signoz_traces.traces_v3_resource ON CLUSTER cluster MODIFY TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + INTERVAL 604800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.signoz_error_index_v2":       "ALTER TABLE signoz_traces.signoz_error_index_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.usage_explorer":              "ALTER TABLE signoz_traces.usage_explorer ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.dependency_graph_minutes_v2": "ALTER TABLE signoz_traces.dependency_graph_minutes_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.trace_summary":               "ALTER TABLE signoz_traces.trace_summary ON CLUSTER cluster MODIFY TTL toDateTime(end) + INTERVAL 604800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.span_attributes_keys":        "ALTER TABLE signoz_traces.span_attributes_keys ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
			},
		},
		{
			name:   "ColdStorage_NotOnSpanAttributesKeys",
			params: &retentiontypes.TTLParams{Type: retentiontypes.TraceTTL, DelDuration: 604800, ColdStorageVolume: "cold", ToColdStorageDuration: 3600},
			want: map[string]string{
				"signoz_traces.signoz_index_v3":             "ALTER TABLE signoz_traces.signoz_index_v3 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE, toDateTime(timestamp) + INTERVAL 3600 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.traces_v3_resource":          "ALTER TABLE signoz_traces.traces_v3_resource ON CLUSTER cluster MODIFY TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + INTERVAL 604800 SECOND DELETE, toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + INTERVAL 3600 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.signoz_error_index_v2":       "ALTER TABLE signoz_traces.signoz_error_index_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE, toDateTime(timestamp) + INTERVAL 3600 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.usage_explorer":              "ALTER TABLE signoz_traces.usage_explorer ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE, toDateTime(timestamp) + INTERVAL 3600 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.dependency_graph_minutes_v2": "ALTER TABLE signoz_traces.dependency_graph_minutes_v2 ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE, toDateTime(timestamp) + INTERVAL 3600 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.trace_summary":               "ALTER TABLE signoz_traces.trace_summary ON CLUSTER cluster MODIFY TTL toDateTime(end) + INTERVAL 604800 SECOND DELETE, toDateTime(end) + INTERVAL 3600 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
				"signoz_traces.span_attributes_keys":        "ALTER TABLE signoz_traces.span_attributes_keys ON CLUSTER cluster MODIFY TTL toDateTime(timestamp) + INTERVAL 604800 SECOND DELETE SETTINGS materialize_ttl_after_modify=0",
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, tracesTTLStatements(testTracesTTLTables, "cluster", testCase.params))
		})
	}
}

func TestMetricsTTLStatements(t *testing.T) {
	statements := metricsTTLStatements(testMetricsTTLTables, "cluster", &retentiontypes.TTLParams{Type: retentiontypes.MetricsTTL, DelDuration: 2592000, ColdStorageVolume: "cold", ToColdStorageDuration: 86400})

	assert.Equal(t, map[string]string{
		"signoz_metrics.samples_v4":           "ALTER TABLE signoz_metrics.samples_v4 ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		"signoz_metrics.samples_v4_agg_5m":    "ALTER TABLE signoz_metrics.samples_v4_agg_5m ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		"signoz_metrics.samples_v4_agg_30m":   "ALTER TABLE signoz_metrics.samples_v4_agg_30m ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		"signoz_metrics.exp_hist":             "ALTER TABLE signoz_metrics.exp_hist ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		"signoz_metrics.time_series_v4":       "ALTER TABLE signoz_metrics.time_series_v4 ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		"signoz_metrics.time_series_v4_6hrs":  "ALTER TABLE signoz_metrics.time_series_v4_6hrs ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		"signoz_metrics.time_series_v4_1day":  "ALTER TABLE signoz_metrics.time_series_v4_1day ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
		"signoz_metrics.time_series_v4_1week": "ALTER TABLE signoz_metrics.time_series_v4_1week ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 2592000 SECOND DELETE, toDateTime(toUInt32(unix_milli / 1000), 'UTC') + INTERVAL 86400 SECOND TO VOLUME 'cold' SETTINGS materialize_ttl_after_modify=0",
	}, statements)
	assert.Equal(t, "ALTER TABLE signoz_metrics.legacy_samples ON CLUSTER cluster MODIFY TTL toDateTime(toUInt32(timestamp_ms / 1000), 'UTC') + INTERVAL 60 SECOND DELETE SETTINGS materialize_ttl_after_modify=0", metricsTTLStatements([]string{"signoz_metrics.legacy_samples"}, "cluster", &retentiontypes.TTLParams{DelDuration: 60})["signoz_metrics.legacy_samples"])
}
