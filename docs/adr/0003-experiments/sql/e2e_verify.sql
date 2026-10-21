-- Checks for one browser session from drive.mjs: spans and logs carry session.id,
-- and every browser fetch/XHR span to HotROD is the parent of a backend span.
SELECT 'spans by name' AS check, name, count() AS n, groupUniqArray(attributes_string['fusescope.rum.view.route']) AS routes
FROM signoz_traces.signoz_index_v3
WHERE attributes_string['session.id'] = {sid:String}
GROUP BY name ORDER BY name
FORMAT PrettyCompactMonoBlock;

SELECT 'trace link' AS check, b.name AS browser_span, s.serviceName AS child_service, s.name AS child_span, b.trace_id
FROM signoz_traces.signoz_index_v3 AS b
INNER JOIN signoz_traces.signoz_index_v3 AS s ON s.parent_span_id = b.span_id AND s.trace_id = b.trace_id
WHERE b.attributes_string['session.id'] = {sid:String} AND b.kind_string = 'Client'
FORMAT PrettyCompactMonoBlock;

SELECT 'log events' AS check, severity_text, attributes_string['event.name'] AS event_name,
       attributes_string['fusescope.rum.vital.name'] AS vital, attributes_string['exception.type'] AS exception_type,
       attributes_string['fusescope.rum.error.source'] AS source, attributes_string['fusescope.rum.view.route'] AS route
FROM signoz_logs.logs_v2
WHERE attributes_string['session.id'] = {sid:String}
ORDER BY timestamp
FORMAT PrettyCompactMonoBlock;

SELECT 'without session.id' AS check, count() AS spans
FROM signoz_traces.signoz_index_v3
WHERE serviceName = 'rum-spike-web' AND attributes_string['session.id'] = '';
