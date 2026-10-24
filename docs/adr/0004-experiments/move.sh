#!/usr/bin/env bash
# Puts the bench tables on the tiered policy (as setColdStorage does) and moves every partition to the cold volume.
set -euo pipefail
C=${C:-csbench-clickhouse-1}
q() { docker exec "$C" clickhouse-client "$@"; }
puts() { curl -s http://127.0.0.1:19090/minio/v2/metrics/cluster | awk '/^minio_s3_requests_total\{.*api="(putobject|putobjectpart)"/ {s += $2} END {printf "%d", s}'; }
TABLES="signoz_logs.logs_v2 signoz_logs.logs_v2_resource signoz_traces.signoz_index_v3 signoz_traces.traces_v3_resource signoz_traces.trace_summary"
q -q "SELECT 'local before', formatReadableSize(sum(bytes_on_disk)) FROM system.parts WHERE active AND disk_name = 'default' FORMAT TSV"
p0=$(puts); t0=$(date +%s.%N)
for t in $TABLES; do
  q -q "ALTER TABLE $t ON CLUSTER cluster MODIFY SETTING storage_policy = 'tiered'" >/dev/null
  for p in $(q -q "SELECT DISTINCT partition_id FROM system.parts WHERE active AND concat(database, '.', table) = '$t'"); do
    q -q "ALTER TABLE $t MOVE PARTITION ID '$p' TO VOLUME 's3'"
  done
done
t1=$(date +%s.%N); p1=$(puts)
echo "moved in $(awk "BEGIN{print $t1 - $t0}") s, S3 PUT requests: $((p1 - p0))"
q -q "SELECT disk_name, count() parts, formatReadableSize(sum(bytes_on_disk)) bytes FROM system.parts WHERE active AND database LIKE 'signoz_%' GROUP BY disk_name FORMAT TSV"
q -q "SYSTEM FLUSH LOGS part_log"
q -q "SELECT table, count() parts, formatReadableSize(sum(size_in_bytes)) bytes, round(sum(duration_ms) / 1000, 1) seconds FROM system.part_log WHERE event_type = 'MovePart' AND database LIKE 'signoz_%' GROUP BY table FORMAT TSV"
docker exec "$C" du -sh /var/lib/clickhouse/disks/s3 /var/lib/clickhouse/store /var/lib/clickhouse/disks/s3_cache 2>/dev/null || true
docker exec csbench-minio-1 sh -c "mc alias set l http://localhost:9000 bench bench-secret >/dev/null && mc du l/cold"
