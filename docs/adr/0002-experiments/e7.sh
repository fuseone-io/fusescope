#!/usr/bin/env bash
# E7: DROP PART racing inserts into the same partition; block numbers versus commit order.
# Usage: ./e7.sh <container>   (a running clickhouse-server container with keeper.xml, as in E4–E5)
set -euo pipefail
C=${1:-ch-e6}
q() { docker exec "$C" clickhouse-client -q "$1"; }

# E7a: 200 single-row inserts into the partition while its only part is dropped by name.
q "DROP TABLE IF EXISTS t7"
q "CREATE TABLE t7 (ts DateTime, n UInt32) ENGINE = MergeTree PARTITION BY toDate(ts) ORDER BY (ts, n)"
q "SYSTEM STOP MERGES t7"
q "INSERT INTO t7 SELECT toDateTime('2026-10-01 00:00:00') + number, number FROM numbers(1000)"
P0=$(q "SELECT name FROM system.parts WHERE table = 't7' AND active")
( for i in $(seq 1 200); do q "INSERT INTO t7 VALUES ('2026-10-01 12:00:00', $i)"; done ) &
BG=$!
sleep 0.5
q "ALTER TABLE t7 DROP PART '$P0'"
wait $BG
echo "E7a rows after drop (expect 200): $(q "SELECT count() FROM t7")"
echo "E7a $P0 still active (expect 0): $(q "SELECT count() FROM system.parts WHERE table = 't7' AND active AND name = '$P0'")"
echo "E7a active parts (expect 200): $(q "SELECT count() FROM system.parts WHERE table = 't7' AND active")"

# E7a2: DROP PART of a name that a merge has already replaced.
q "SYSTEM START MERGES t7"
q "OPTIMIZE TABLE t7 FINAL"
q "SYSTEM STOP MERGES t7"
OLD=$(q "SELECT name FROM system.parts WHERE table = 't7' AND NOT active ORDER BY name LIMIT 1")
echo "E7a2 DROP PART of merged-away part $OLD:"
docker exec "$C" clickhouse-client -q "ALTER TABLE t7 DROP PART '$OLD'" 2>&1 | grep -m1 'Code:' || true
echo "E7a2 rows after that (expect 200): $(q "SELECT count() FROM t7")"

# E7b: non-replicated MergeTree. A large insert takes its block number before it finishes writing;
# small inserts committed meanwhile get higher numbers but earlier modification_time.
q "DROP TABLE IF EXISTS t7b"
q "CREATE TABLE t7b (ts DateTime, s String) ENGINE = MergeTree PARTITION BY toDate(ts) ORDER BY s"
q "SYSTEM STOP MERGES t7b"
( q "INSERT INTO t7b SELECT toDateTime('2026-10-01 00:00:00'), randomPrintableASCII(120) FROM numbers(4000000) SETTINGS max_insert_block_size = 100000000, min_insert_block_size_rows = 100000000, min_insert_block_size_bytes = 0, max_insert_threads = 1, max_threads = 2" ) &
BG=$!
i=0
while kill -0 $BG 2>/dev/null; do i=$((i+1)); q "INSERT INTO t7b VALUES ('2026-10-01 01:00:00', 'tiny-$i')"; sleep 0.2; done
wait $BG
echo "E7b parts by block number (name, rows, modification_time):"
q "SELECT name, rows, modification_time FROM system.parts WHERE table = 't7b' AND active ORDER BY min_block_number FORMAT TSV"
echo "E7b parts whose modification_time is earlier than a lower-numbered part (>0 means lower block numbers can commit later):"
q "SELECT count() FROM (SELECT modification_time, max(modification_time) OVER (ORDER BY min_block_number ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev FROM system.parts WHERE table = 't7b' AND active) WHERE modification_time < prev"

# E7c: same on a ReplicatedMergeTree, where the block number is taken from Keeper at commit time.
q "DROP TABLE IF EXISTS t7c SYNC"
q "CREATE TABLE t7c (ts DateTime, s String) ENGINE = ReplicatedMergeTree('/t/t7c', 'a') PARTITION BY toDate(ts) ORDER BY s"
q "SYSTEM STOP MERGES t7c"
( q "INSERT INTO t7c SELECT toDateTime('2026-10-01 00:00:00'), randomPrintableASCII(120) FROM numbers(4000000) SETTINGS max_insert_block_size = 100000000, min_insert_block_size_rows = 100000000, min_insert_block_size_bytes = 0, max_insert_threads = 1, max_threads = 2" ) &
BG=$!
i=0
while kill -0 $BG 2>/dev/null; do i=$((i+1)); q "INSERT INTO t7c VALUES ('2026-10-01 01:00:00', 'tiny-$i')"; sleep 0.2; done
wait $BG
echo "E7c parts by block number (name, rows, modification_time):"
q "SELECT name, rows, modification_time FROM system.parts WHERE table = 't7c' AND active ORDER BY min_block_number FORMAT TSV"
echo "E7c inversions (expect 0: replicated tables allocate the number at commit):"
q "SELECT count() FROM (SELECT modification_time, max(modification_time) OVER (ORDER BY min_block_number ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev FROM system.parts WHERE table = 't7c' AND active) WHERE modification_time < prev"
