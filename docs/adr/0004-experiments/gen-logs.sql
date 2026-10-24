-- One day of logs_v2. Params: t0 (UInt32, end of the data window), day (0 = oldest), n (rows per day), days.
INSERT INTO signoz_logs.logs_v2 (ts_bucket_start, resource_fingerprint, timestamp, observed_timestamp, id, trace_id, span_id,
  trace_flags, severity_text, severity_number, body, attributes_string, attributes_number, attributes_bool, resources_string,
  scope_name, scope_version, inserted_at)
WITH
  {t0:UInt32} - ({days:UInt32} - {day:UInt32}) * 86400 AS day_start,
  sipHash64(number, {day:UInt32}) AS r,
  sipHash64(r) AS r2,
  day_start + intDiv(number * 86400, {n:UInt32}) AS ts_s,
  toUInt64(ts_s) * 1000000000 + (r % 1000000000) AS ts_ns,
  r % 240 AS res,
  res % 30 AS svc,
  r2 % 10 AS tpl,
  ['/api/v1/orders', '/api/v1/orders/{id}', '/api/v1/cart', '/api/v1/checkout', '/api/v1/users/{id}', '/api/v1/search',
   '/api/v1/payments', '/healthz', '/api/v1/inventory', '/api/v1/shipping'][1 + (r2 % 10)] AS route,
  ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE'][1 + (r % 6)] AS method,
  multiIf(tpl = 7, 503, r % 50 = 0, 500, r % 20 = 0, 404, 200) AS status,
  toUInt32(exp((r % 1000) / 160.0)) AS dur_ms,
  {day:UInt32} * 150000 + (r % 150000) AS trace_n
SELECT
  intDiv(ts_s, 1800) * 1800,
  toString(cityHash64(res)),
  ts_ns,
  ts_ns + 2000000,
  lower(hex(sipHash128(number, {day:UInt32}))),
  if(r % 2 = 0, lower(hex(MD5(toString(trace_n)))), ''),
  if(r % 2 = 0, lower(hex(substring(MD5(toString(r)), 1, 8))), ''),
  if(r % 2 = 0, 1, 0),
  multiIf(tpl = 7, 'ERROR', tpl = 8, 'WARN', r % 50 = 1, 'DEBUG', 'INFO'),
  multiIf(tpl = 7, 17, tpl = 8, 13, r % 50 = 1, 5, 9),
  multiIf(
    tpl < 5, concat(method, ' ', replaceOne(route, '{id}', toString(r % 100000)), ' completed status=', toString(status), ' duration=', toString(dur_ms), 'ms request_id=', lower(hex(r))),
    tpl = 5, concat('user ', toString(r % 500000), ' authenticated via oauth provider=', ['google', 'github', 'okta'][1 + (r % 3)], ' session=', lower(hex(r2))),
    tpl = 6, concat('cache miss key=order:', toString(r % 100000), ' fallback=db latency_ms=', toString(dur_ms)),
    tpl = 7, concat('payment failed for order ', toString(r % 1000000), ': upstream timeout after 3000ms (attempt ', toString(r % 3 + 1), ') provider=', ['stripe', 'adyen', 'paypal'][1 + (r % 3)]),
    tpl = 8, concat('slow query: SELECT * FROM orders WHERE customer_id = ', toString(r % 50000), ' took ', toString(dur_ms * 10), 'ms'),
    concat('kafka consumer lag topic=orders partition=', toString(r % 32), ' lag=', toString(r % 10000))),
  map('http.method', method, 'http.route', route, 'user.id', toString(r % 500000), 'request.id', lower(hex(r)), 'code.function', concat('handler', toString(tpl))),
  map('http.status_code', toFloat64(status), 'duration_ms', toFloat64(dur_ms)),
  map('retry', r % 30 = 0),
  map('service.name', concat('svc-', leftPad(toString(svc), 2, '0')), 'k8s.pod.name', concat('svc-', leftPad(toString(svc), 2, '0'), '-', lower(hex(cityHash64(res) % 65536))),
      'k8s.namespace.name', ['shop', 'payments', 'platform'][1 + (svc % 3)], 'host.name', concat('node-', toString(res % 12)), 'deployment.environment', 'prod'),
  'io.opentelemetry.logs',
  '1.0.0',
  toDateTime64(ts_s, 3)
FROM numbers({n:UInt32})
SETTINGS max_insert_threads = 2, max_threads = 4, max_block_size = 65536, min_insert_block_size_rows = 262144, min_insert_block_size_bytes = 268435456, max_memory_usage = 6000000000;
