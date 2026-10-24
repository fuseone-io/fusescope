-- APM: hourly p99 latency of one service's server spans over 7 days (days 1..7 of the window).
WITH {t0:UInt64} - 9 * 86400 AS s, s + 7 * 86400 AS e
SELECT toStartOfInterval(timestamp, INTERVAL 1 HOUR) AS t, quantile(0.99)(duration_nano) AS p99, count() AS calls
FROM signoz_traces.distributed_signoz_index_v3
WHERE `resource_string_service$$name` = 'svc-07' AND kind_string = 'Server'
  AND timestamp >= toDateTime64(s, 9) AND timestamp <= toDateTime64(e, 9) AND ts_bucket_start >= s - 1800 AND ts_bucket_start <= e
GROUP BY t ORDER BY t
