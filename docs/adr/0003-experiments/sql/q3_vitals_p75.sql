-- Web Vitals p75 per route, with the good / needs-improvement / poor split.
SELECT
    attributes_string['fusescope.rum.view.route'] AS route,
    attributes_string['fusescope.rum.vital.name'] AS vital,
    count() AS samples,
    quantile(0.75)(attributes_number['fusescope.rum.vital.value']) AS p75,
    countIf(attributes_string['fusescope.rum.vital.rating'] = 'good') / samples AS good,
    countIf(attributes_string['fusescope.rum.vital.rating'] = 'poor') / samples AS poor
FROM signoz_logs.distributed_logs_v2
WHERE resource_fingerprint GLOBAL IN
(
    SELECT fingerprint FROM signoz_logs.distributed_logs_v2_resource
    WHERE simpleJSONExtractString(labels, 'service.name') = {app:String}
      AND seen_at_ts_bucket_start >= {start_s:UInt64} - 1800 AND seen_at_ts_bucket_start <= {end_s:UInt64}
)
  AND timestamp >= {start_s:UInt64} * 1000000000 AND timestamp <= {end_s:UInt64} * 1000000000
  AND ts_bucket_start >= {start_s:UInt64} - 1800 AND ts_bucket_start <= {end_s:UInt64}
  AND attributes_string['event.name'] = 'rum.vital'
GROUP BY route, vital
ORDER BY route, vital
