-- Sessions list: one app, a time range, top 50 by last seen, with views, requests,
-- failed requests, duration, platform, app version and error count.
-- SID is replaced by the runner with the map lookup or the promoted column.
-- No CTE: ClickHouse inlines a CTE at every reference, which would run the
-- span aggregation twice.
SELECT recent.*, r.platform, r.app_version, ifNull(e.errors, 0) AS errors
FROM
(
    SELECT
        SID AS sid,
        min(timestamp) AS first_seen,
        max(timestamp) AS last_seen,
        dateDiff('second', first_seen, last_seen) AS duration_s,
        countIf(name = 'view') AS views,
        countIf(kind = 3) AS requests,
        countIf(kind = 3 AND has_error) AS failed_requests,
        any(resource_fingerprint) AS fingerprint
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
      AND SID != ''
    GROUP BY sid
    ORDER BY last_seen DESC
    LIMIT 50
) AS recent
LEFT JOIN
(
    SELECT fingerprint,
           any(simpleJSONExtractString(labels, 'browser.platform')) AS platform,
           any(simpleJSONExtractString(labels, 'service.version')) AS app_version
    FROM signoz_traces.distributed_traces_v3_resource
    WHERE simpleJSONExtractString(labels, 'service.name') = {app:String}
      AND seen_at_ts_bucket_start >= {start_s:UInt64} - 1800 AND seen_at_ts_bucket_start <= {end_s:UInt64}
    GROUP BY fingerprint
) AS r USING (fingerprint)
LEFT JOIN
(
    SELECT SID_LOG AS sid, count() AS errors
    FROM signoz_logs.distributed_logs_v2
    WHERE resource_fingerprint GLOBAL IN
    (
        SELECT fingerprint FROM signoz_logs.distributed_logs_v2_resource
        WHERE simpleJSONExtractString(labels, 'service.name') = {app:String}
          AND seen_at_ts_bucket_start >= {start_s:UInt64} - 1800 AND seen_at_ts_bucket_start <= {end_s:UInt64}
    )
      AND timestamp >= {start_s:UInt64} * 1000000000 AND timestamp <= {end_s:UInt64} * 1000000000
      AND ts_bucket_start >= {start_s:UInt64} - 1800 AND ts_bucket_start <= {end_s:UInt64}
      AND severity_number >= 17
    GROUP BY sid
) AS e USING (sid)
ORDER BY last_seen DESC
