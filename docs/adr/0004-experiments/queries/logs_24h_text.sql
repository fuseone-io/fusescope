-- Logs explorer histogram: count per 5 min of a full-text match across all services over 24 h (day 2).
WITH {t0:UInt64} - 8 * 86400 AS s, s + 86400 AS e
SELECT toStartOfInterval(fromUnixTimestamp64Nano(timestamp), INTERVAL 5 MINUTE) AS t, count() AS c
FROM signoz_logs.distributed_logs_v2
WHERE timestamp >= s * 1000000000 AND timestamp <= e * 1000000000 AND ts_bucket_start >= s - 1800 AND ts_bucket_start <= e
  AND lower(body) LIKE '%provider=adyen%'
GROUP BY t ORDER BY t
