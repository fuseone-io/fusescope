#!/usr/bin/env bash
# T1-T5: how move TTL, delete TTL and merges behave on the tiered policy, on small tables in database ttlx.
set -euo pipefail
C=${C:-csbench-clickhouse-1}
q() { docker exec "$C" clickhouse-client "$@"; }
ddl() { q -q "$1" >/dev/null; }
parts() { q -q "SELECT partition, name, disk_name, rows FROM system.parts WHERE database = 'ttlx' AND table = '$1' AND active ORDER BY name FORMAT TSV"; }
objects() { docker exec csbench-minio-1 sh -c "mc alias set l http://localhost:9000 bench bench-secret >/dev/null && mc ls -r l/cold | wc -l"; }
wait_moves() { for i in $(seq 1 30); do n=$(q -q "SELECT count() FROM system.moves"); [ "$n" = 0 ] && sleep 2 && return; sleep 1; done; }
ddl "DROP DATABASE IF EXISTS ttlx ON CLUSTER cluster SYNC"
ddl "CREATE DATABASE ttlx ON CLUSTER cluster"

echo "== T1: MODIFY TTL ... TO VOLUME with materialize_ttl_after_modify = 0 on existing parts (backend's SetTTL form)"
ddl "CREATE TABLE ttlx.t1 ON CLUSTER cluster (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}')
  PARTITION BY toDate(ts) ORDER BY ts TTL ts + INTERVAL 30 DAY SETTINGS ttl_only_drop_parts = 1"
q -q "INSERT INTO ttlx.t1 SELECT now() - INTERVAL 20 DAY + number, number FROM numbers(1000)"
q -q "INSERT INTO ttlx.t1 SELECT now() - INTERVAL 1 DAY + number, number FROM numbers(1000)"
ddl "ALTER TABLE ttlx.t1 ON CLUSTER cluster MODIFY SETTING storage_policy = 'tiered'"
ddl "ALTER TABLE ttlx.t1 ON CLUSTER cluster MODIFY TTL ts + INTERVAL 30 DAY DELETE, ts + INTERVAL 7 DAY TO VOLUME 's3' SETTINGS materialize_ttl_after_modify = 0"
sleep 15; wait_moves
echo "after MODIFY TTL + 15 s (20-day-old part should be cold):"; parts t1
q -q "ALTER TABLE ttlx.t1 MATERIALIZE TTL SETTINGS mutations_sync = 2"
sleep 10; wait_moves
echo "after MATERIALIZE TTL:"; parts t1

echo "== T2: v2 logs form, rows written before cold storage was enabled carry _retention_days_cold = 0"
ddl "CREATE TABLE ttlx.t2 ON CLUSTER cluster (ts DateTime, n UInt32, _retention_days UInt16 DEFAULT 15, _retention_days_cold UInt16 DEFAULT 0)
  ENGINE = ReplicatedMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}')
  PARTITION BY (toDate(ts), _retention_days, _retention_days_cold) ORDER BY ts TTL ts + toIntervalDay(_retention_days)
  SETTINGS ttl_only_drop_parts = 1, storage_policy = 'tiered'"
q -q "INSERT INTO ttlx.t2 (ts, n) SELECT now() - INTERVAL 1 HOUR + number, number FROM numbers(100)"
ddl "ALTER TABLE ttlx.t2 ON CLUSTER cluster MODIFY COLUMN _retention_days_cold UInt16 DEFAULT 7"
ddl "ALTER TABLE ttlx.t2 ON CLUSTER cluster MODIFY TTL ts + toIntervalDay(_retention_days) DELETE, ts + toIntervalDay(_retention_days_cold) TO VOLUME 's3' SETTINGS materialize_ttl_after_modify = 0"
q -q "INSERT INTO ttlx.t2 (ts, n) SELECT now() - INTERVAL 1 HOUR + number, number FROM numbers(100)"
q -q "INSERT INTO ttlx.t2 (ts, n) SELECT now() - INTERVAL 1 HOUR + number, number FROM numbers(100)"
sleep 10; wait_moves
echo "before merge (1-hour-old rows; first part has cold=0):"; parts t2
q -q "OPTIMIZE TABLE ttlx.t2 FINAL"
sleep 10; wait_moves
echo "after merge:"; parts t2

echo "== T2b: same, but MATERIALIZE TTL instead of a merge (ADR 0002 backstop path)"
ddl "CREATE TABLE ttlx.t2b ON CLUSTER cluster AS ttlx.t2 ENGINE = ReplicatedMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}')
  PARTITION BY (toDate(ts), _retention_days, _retention_days_cold) ORDER BY ts TTL ts + toIntervalDay(_retention_days)
  SETTINGS ttl_only_drop_parts = 1, storage_policy = 'tiered'"
ddl "ALTER TABLE ttlx.t2b ON CLUSTER cluster MODIFY COLUMN _retention_days_cold UInt16 DEFAULT 0"
q -q "INSERT INTO ttlx.t2b (ts, n) SELECT now() - INTERVAL 1 HOUR + number, number FROM numbers(100)"
ddl "ALTER TABLE ttlx.t2b ON CLUSTER cluster MODIFY COLUMN _retention_days_cold UInt16 DEFAULT 7"
ddl "ALTER TABLE ttlx.t2b ON CLUSTER cluster MODIFY TTL ts + toIntervalDay(_retention_days) DELETE, ts + toIntervalDay(_retention_days_cold) TO VOLUME 's3' SETTINGS materialize_ttl_after_modify = 0"
q -q "INSERT INTO ttlx.t2b (ts, n) SELECT now() - INTERVAL 1 HOUR + number, number FROM numbers(100)"
q -q "ALTER TABLE ttlx.t2b MATERIALIZE TTL SETTINGS mutations_sync = 2"
sleep 10; wait_moves
echo "after MATERIALIZE TTL:"; parts t2b

echo "== T3: delete TTL on a cold part removes its objects"
ddl "CREATE TABLE ttlx.t3 ON CLUSTER cluster (ts DateTime, s String) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}')
  PARTITION BY toDate(ts) ORDER BY ts TTL ts + INTERVAL 1 DAY TO VOLUME 's3', ts + INTERVAL 40 DAY DELETE
  SETTINGS ttl_only_drop_parts = 1, storage_policy = 'tiered', merge_with_ttl_timeout = 1"
before=$(objects)
q -q "INSERT INTO ttlx.t3 SELECT toDateTime(today() - 3) + number, randomPrintableASCII(100) FROM numbers(100000)"
sleep 10; wait_moves
echo "part:"; parts t3
echo "objects before insert: $before, after move: $(objects)"
ddl "ALTER TABLE ttlx.t3 ON CLUSTER cluster MODIFY TTL ts + INTERVAL 1 DAY TO VOLUME 's3', ts + INTERVAL 2 DAY DELETE"
for i in $(seq 1 30); do [ -z "$(parts t3)" ] && break; sleep 2; done
echo "after the part expired: parts=[$(parts t3)] objects=$(objects)"
q -q "SELECT event_type, part_name, disk_name FROM system.part_log WHERE database = 'ttlx' AND table = 't3' ORDER BY event_time_microseconds FORMAT TSV"

echo "== T4: several parts of one partition on the cold volume (prefer_not_to_merge = 1)"
ddl "CREATE TABLE ttlx.t4 ON CLUSTER cluster (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}')
  PARTITION BY toDate(ts) ORDER BY ts TTL ts + INTERVAL 1 DAY TO VOLUME 's3' SETTINGS storage_policy = 'tiered'"
for i in 1 2 3 4; do q -q "INSERT INTO ttlx.t4 SELECT toDateTime(today() - 5) + number, number FROM numbers(1000)"; done
sleep 15; wait_moves
echo "after inserts of late (5-day-old) data:"; parts t4
sleep 20
echo "20 s later (no background merge expected):"; parts t4
q -q "OPTIMIZE TABLE ttlx.t4 FINAL" || echo "OPTIMIZE refused"
sleep 5
echo "after OPTIMIZE FINAL:"; parts t4
q -q "SELECT event_type, part_name, disk_name, merge_reason FROM system.part_log WHERE database = 'ttlx' AND table = 't4' AND event_type IN ('MergeParts', 'MovePart') ORDER BY event_time_microseconds FORMAT TSV"

echo "== T5: settings that matter"
q -q "SELECT name, value FROM system.merge_tree_settings WHERE name IN ('allow_remote_fs_zero_copy_replication', 'merge_with_ttl_timeout', 'ttl_only_drop_parts', 'remote_fs_execute_merges_on_single_replica_time_threshold') FORMAT TSV"
q -q "SELECT name, value FROM system.server_settings WHERE name IN ('background_move_pool_size', 'max_server_memory_usage') FORMAT TSV"
docker logs csbench-clickhouse-1 2>&1 | grep -i -E "prefer_not_to_merge|deprecat|zero.copy" | head -5 || true
