-- Resource tables: every resource seen in every 30-minute bucket of the window.
INSERT INTO signoz_logs.logs_v2_resource (labels, fingerprint, seen_at_ts_bucket_start)
SELECT
  concat('{"deployment.environment":"prod","host.name":"node-', toString(res % 12), '","k8s.namespace.name":"', ['shop', 'payments', 'platform'][1 + ((res % 30) % 3)],
         '","k8s.pod.name":"svc-', leftPad(toString(res % 30), 2, '0'), '-', lower(hex(cityHash64(res) % 65536)), '","service.name":"svc-', leftPad(toString(res % 30), 2, '0'), '"}'),
  toString(cityHash64(res)),
  intDiv({t0:UInt32} - {days:UInt32} * 86400, 1800) * 1800 + b * 1800
FROM (SELECT number AS res FROM numbers(240)) AS r CROSS JOIN (SELECT number AS b FROM numbers({days:UInt32} * 48 + 1)) AS bk;
INSERT INTO signoz_traces.traces_v3_resource (labels, fingerprint, seen_at_ts_bucket_start)
SELECT
  concat('{"deployment.environment":"prod","host.name":"node-', toString(res % 12), '","k8s.namespace.name":"', ['shop', 'payments', 'platform'][1 + (intDiv(res, 8) % 3)],
         '","k8s.pod.name":"svc-', leftPad(toString(intDiv(res, 8)), 2, '0'), '-', lower(hex(cityHash64(res) % 65536)), '","service.name":"svc-', leftPad(toString(intDiv(res, 8)), 2, '0'), '"}'),
  toString(cityHash64(res)),
  intDiv({t0:UInt32} - {days:UInt32} * 86400, 1800) * 1800 + b * 1800
FROM (SELECT number AS res FROM numbers(240)) AS r CROSS JOIN (SELECT number AS b FROM numbers({days:UInt32} * 48 + 1)) AS bk;
