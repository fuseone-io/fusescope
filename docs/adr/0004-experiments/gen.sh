#!/usr/bin/env bash
# Loads DAYS days ending at T0 into logs_v2 (LOGS_PER_DAY rows/day) and signoz_index_v3 (SPANS_PER_DAY/day).
set -euo pipefail
C=${C:-csbench-clickhouse-1}
DAYS=${DAYS:-10}; LOGS_PER_DAY=${LOGS_PER_DAY:-3000000}; SPANS_PER_DAY=${SPANS_PER_DAY:-1500000}
q() { docker exec "$C" clickhouse-client "$@"; }
T0=$(q -q "SELECT toUnixTimestamp(toStartOfHour(now()))")
q -q "CREATE DATABASE IF NOT EXISTS bench"
q -q "CREATE TABLE IF NOT EXISTS bench.meta (k String, v UInt64) ENGINE = MergeTree ORDER BY k"
q -q "INSERT INTO bench.meta VALUES ('t0', $T0), ('days', $DAYS)"
# Dependency-graph and root-operation views are irrelevant here and only slow the load.
for v in dependency_graph_minutes_db_calls_mv_v2 dependency_graph_minutes_messaging_calls_mv_v2 dependency_graph_minutes_service_calls_mv_v2 root_operations sub_root_operations; do
  q -q "DETACH TABLE IF EXISTS signoz_traces.$v"
done
P="--param_t0=$T0 --param_days=$DAYS"
q $P --multiquery --queries-file /w/gen-resources.sql
for d in $(seq 0 $((DAYS - 1))); do
  q $P --param_day=$d --param_n=$LOGS_PER_DAY --queries-file /w/gen-logs.sql
  q $P --param_day=$d --param_n=$SPANS_PER_DAY --queries-file /w/gen-spans.sql
  echo "day $d loaded"
done
# Old partitions are normally fully merged; get there now so moves and reads see production-shaped parts.
for t in signoz_logs.logs_v2 signoz_traces.signoz_index_v3 signoz_logs.logs_v2_resource signoz_traces.traces_v3_resource signoz_traces.trace_summary; do
  q -q "OPTIMIZE TABLE $t FINAL" --receive_timeout=3600 --send_timeout=3600
done
q -q "SELECT table, count() parts, sum(rows) rows, formatReadableSize(sum(data_compressed_bytes)) compressed, formatReadableSize(sum(data_uncompressed_bytes)) uncompressed FROM system.parts WHERE active AND database LIKE 'signoz_%' AND table IN ('logs_v2','signoz_index_v3','logs_v2_resource','traces_v3_resource','trace_summary') GROUP BY table FORMAT PrettyCompactMonoBlock"
