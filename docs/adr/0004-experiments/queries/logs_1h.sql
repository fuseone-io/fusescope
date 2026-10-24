-- Logs explorer list: one service, ERROR, body contains "timeout", 1 h window on day 2 of the window.
WITH {t0:UInt64} - 8 * 86400 AS s, s + 3600 AS e,
__resource_filter AS (
  SELECT fingerprint FROM signoz_logs.distributed_logs_v2_resource
  WHERE simpleJSONExtractString(labels, 'service.name') = 'svc-07' AND seen_at_ts_bucket_start >= s - 1800 AND seen_at_ts_bucket_start <= e)
SELECT timestamp, id, trace_id, span_id, severity_text, body, attributes_string, attributes_number, resources_string
FROM signoz_logs.distributed_logs_v2
WHERE resource_fingerprint GLOBAL IN (SELECT fingerprint FROM __resource_filter)
  AND timestamp >= s * 1000000000 AND timestamp <= e * 1000000000 AND ts_bucket_start >= s - 1800 AND ts_bucket_start <= e
  AND severity_text = 'ERROR' AND lower(body) LIKE '%timeout%'
ORDER BY timestamp DESC LIMIT 100
