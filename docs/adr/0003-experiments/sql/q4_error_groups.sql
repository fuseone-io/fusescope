-- Error groups: type + message, with occurrences, affected sessions, first/last seen and releases.
SELECT
    attributes_string['exception.type'] AS type,
    attributes_string['exception.message'] AS message,
    count() AS occurrences,
    uniq(SID_LOG) AS sessions,
    min(timestamp) AS first_seen_ns,
    max(timestamp) AS last_seen_ns,
    groupUniqArray(5)(resources_string['service.version']) AS releases
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
  AND attributes_string['event.name'] = 'exception'
GROUP BY type, message
ORDER BY occurrences DESC
LIMIT 50
