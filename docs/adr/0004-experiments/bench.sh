#!/usr/bin/env bash
# Runs every query in queries/ ITER times and records query_log stats in bench.runs under LABEL.
# Usage: ./bench.sh LABEL cold|warm [ITER]
#   cold: drops every ClickHouse cache, filesystem cache included, before each run.
#   warm: one unrecorded priming run, then drops only the in-memory caches before each run.
set -euo pipefail
cd "$(dirname "$0")"
C=${C:-csbench-clickhouse-1}; LABEL=$1; MODE=$2; ITER=${3:-7}
q() { docker exec "$C" clickhouse-client "$@"; }
T0=$(q -q "SELECT v FROM bench.meta WHERE k = 't0'")
minio_gets() { curl -s http://127.0.0.1:19090/minio/v2/metrics/cluster | awk '/^minio_s3_requests_total\{.*api="getobject"/ {s += $2} END {printf "%d", s}'; }
drop_mem="SYSTEM DROP MARK CACHE; SYSTEM DROP UNCOMPRESSED CACHE; SYSTEM DROP PRIMARY INDEX CACHE; SYSTEM DROP SKIPPING INDEX CACHE;
SYSTEM DROP INDEX MARK CACHE; SYSTEM DROP INDEX UNCOMPRESSED CACHE; SYSTEM DROP QUERY CONDITION CACHE; SYSTEM DROP QUERY CACHE; SYSTEM DROP PAGE CACHE;"
q -q "CREATE TABLE IF NOT EXISTS bench.runs (label String, query String, iter UInt8, ms UInt64, read_rows UInt64, read_bytes UInt64,
  s3_get UInt64, s3_read_bytes UInt64, cache_hit_bytes UInt64, cache_miss_bytes UInt64, minio_get UInt64, result_rows UInt64) ENGINE = MergeTree ORDER BY (label, query, iter)"
q -q "ALTER TABLE bench.runs DELETE WHERE label = '$LABEL' SETTINGS mutations_sync = 1"
for f in queries/*.sql; do
  name=$(basename "$f" .sql)
  if [ "$MODE" = warm ]; then q --param_t0="$T0" --queries-file "/w/$f" --format Null; fi
  for i in $(seq 1 "$ITER"); do
    if [ "$MODE" = cold ]; then q --multiquery --ignore-error -q "$drop_mem SYSTEM DROP FILESYSTEM CACHE;" 2>/dev/null || true
    else q --multiquery --ignore-error -q "$drop_mem" 2>/dev/null || true; fi
    id="$LABEL-$name-$i-$RANDOM"
    before=$(minio_gets)
    q --param_t0="$T0" --query_id="$id" --use_query_cache=0 --queries-file "/w/$f" --format Null
    after=$(minio_gets)
    q -q "SYSTEM FLUSH LOGS query_log"
    q -q "INSERT INTO bench.runs SELECT '$LABEL', '$name', $i, query_duration_ms, read_rows, read_bytes,
      ProfileEvents['S3GetObject'], ProfileEvents['ReadBufferFromS3Bytes'], ProfileEvents['CachedReadBufferReadFromCacheBytes'],
      ProfileEvents['CachedReadBufferReadFromSourceBytes'], $((after - before)), result_rows
      FROM system.query_log WHERE query_id = '$id' AND type = 'QueryFinish'"
  done
  echo "$LABEL $name done"
done
