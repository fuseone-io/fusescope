-- Resource rows the query builder joins on, derived from the spike rows of one day.
INSERT INTO signoz_traces.traces_v3_resource (labels, fingerprint, seen_at_ts_bucket_start)
SELECT DISTINCT toJSONString(resources_string), resource_fingerprint, ts_bucket_start
FROM signoz_traces.signoz_index_v3
WHERE toDate(timestamp) = {date:Date} AND resources_string['fusescope.spike'] = 'rum0';

INSERT INTO signoz_logs.logs_v2_resource (labels, fingerprint, seen_at_ts_bucket_start)
SELECT DISTINCT toJSONString(resources_string), resource_fingerprint, ts_bucket_start
FROM signoz_logs.logs_v2
WHERE toDate(fromUnixTimestamp64Nano(timestamp)) = {date:Date} AND resources_string['fusescope.spike'] = 'rum0';
