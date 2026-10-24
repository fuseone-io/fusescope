-- Top 10 (service, operation, status message) by error count over 24 h on day 2 of the window.
WITH {t0:UInt64} - 8 * 86400 AS s, s + 86400 AS e
SELECT `resource_string_service$$name` AS service, name, status_message, count() AS errors
FROM signoz_traces.distributed_signoz_index_v3
WHERE has_error = true AND timestamp >= toDateTime64(s, 9) AND timestamp <= toDateTime64(e, 9) AND ts_bucket_start >= s - 1800 AND ts_bucket_start <= e
GROUP BY service, name, status_message ORDER BY errors DESC LIMIT 10
