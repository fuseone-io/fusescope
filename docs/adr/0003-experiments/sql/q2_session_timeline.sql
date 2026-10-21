-- One session's timeline: its spans and log events, merged and ordered by time.
-- The session start is unknown, so the whole range is searched.
SELECT * FROM
(
    SELECT timestamp AS ts, 'span' AS kind, name, duration_nano AS duration,
           attributes_string['fusescope.rum.view.route'] AS route, trace_id, has_error AS error
    FROM signoz_traces.distributed_signoz_index_v3
    WHERE resource_fingerprint GLOBAL IN
    (
        SELECT fingerprint FROM signoz_traces.distributed_traces_v3_resource
        WHERE simpleJSONExtractString(labels, 'service.name') = {app:String}
          AND seen_at_ts_bucket_start >= {start_s:UInt64} - 1800 AND seen_at_ts_bucket_start <= {end_s:UInt64}
    )
      AND timestamp >= fromUnixTimestamp64Nano({start_s:UInt64} * 1000000000)
      AND timestamp <= fromUnixTimestamp64Nano({end_s:UInt64} * 1000000000)
      AND ts_bucket_start >= {start_s:UInt64} - 1800 AND ts_bucket_start <= {end_s:UInt64}
      AND SID = {sid:String}
    UNION ALL
    SELECT fromUnixTimestamp64Nano(timestamp) AS ts, 'log' AS kind, attributes_string['event.name'] AS name, 0 AS duration,
           attributes_string['fusescope.rum.view.route'] AS route, trace_id, severity_number >= 17 AS error
    FROM signoz_logs.distributed_logs_v2
    WHERE resource_fingerprint GLOBAL IN
    (
        SELECT fingerprint FROM signoz_logs.distributed_logs_v2_resource
        WHERE simpleJSONExtractString(labels, 'service.name') = {app:String}
          AND seen_at_ts_bucket_start >= {start_s:UInt64} - 1800 AND seen_at_ts_bucket_start <= {end_s:UInt64}
    )
      AND timestamp >= {start_s:UInt64} * 1000000000 AND timestamp <= {end_s:UInt64} * 1000000000
      AND ts_bucket_start >= {start_s:UInt64} - 1800 AND ts_bucket_start <= {end_s:UInt64}
      AND SID_LOG = {sid:String}
)
ORDER BY ts
