-- Trace detail: trace_summary bounds, then every span of one trace (trace_n = 312345, day 2).
WITH lower(hex(MD5('312345'))) AS tid,
  (SELECT toUnixTimestamp(min(start)) FROM signoz_traces.distributed_trace_summary WHERE trace_id = tid) AS st,
  (SELECT toUnixTimestamp(max(end)) FROM signoz_traces.distributed_trace_summary WHERE trace_id = tid) AS en
SELECT timestamp, duration_nano, span_id, parent_span_id, has_error, kind, `resource_string_service$$name`, name, links, events,
  attributes_string, attributes_number, attributes_bool, resources_string, status_message, status_code_string
FROM signoz_traces.distributed_signoz_index_v3
WHERE trace_id = tid AND ts_bucket_start >= st - 1800 AND ts_bucket_start <= en
ORDER BY timestamp ASC
