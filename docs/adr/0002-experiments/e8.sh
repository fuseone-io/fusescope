#!/usr/bin/env bash
# E8: `_part IN (...)` through a Distributed table versus directly on a chosen replica, with one lagging replica.
# Two containers on one shard: ch-e8a (embedded Keeper, replica a) and ch-e8b (replica b).
# Usage: ./e8.sh            (creates network and containers, runs, removes them)
#        KEEP=1 ./e8.sh     (leaves the containers running)
set -euo pipefail
cd "$(dirname "$0")"
IMG=clickhouse/clickhouse-server:25.12.5
# The image's default user is localhost-only without a password; the cluster config carries the same one.
a() { docker exec ch-e8a clickhouse-client --password e8 -q "$1"; }
b() { docker exec ch-e8b clickhouse-client --password e8 -q "$1"; }
cleanup() { if [ -z "${KEEP:-}" ]; then docker rm -f ch-e8a ch-e8b >/dev/null 2>&1 || true; docker network rm e8 >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT

docker network create e8 >/dev/null 2>&1 || true
docker run -d --name ch-e8a --hostname ch-e8a --network e8 -e CLICKHOUSE_PASSWORD=e8 \
  -v "$PWD/keeper.xml":/etc/clickhouse-server/config.d/keeper.xml \
  -v "$PWD/e8-a.xml":/etc/clickhouse-server/config.d/e8.xml "$IMG" >/dev/null
docker run -d --name ch-e8b --hostname ch-e8b --network e8 -e CLICKHOUSE_PASSWORD=e8 \
  -v "$PWD/e8-b.xml":/etc/clickhouse-server/config.d/e8.xml "$IMG" >/dev/null
for i in $(seq 1 60); do a "SELECT 1" >/dev/null 2>&1 && b "SELECT 1" >/dev/null 2>&1 && break; sleep 1; done
echo "version: $(a "SELECT version()")"

a "CREATE TABLE t8 ON CLUSTER c (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/t/t8', '{replica}') PARTITION BY toDate(ts) ORDER BY (ts, n)" >/dev/null
a "CREATE TABLE d8 ON CLUSTER c AS t8 ENGINE = Distributed(c, default, t8)" >/dev/null
a "SYSTEM STOP MERGES ON CLUSTER c t8" >/dev/null
a "INSERT INTO t8 SELECT toDateTime('2026-10-01 00:00:00') + number, number FROM numbers(100)"
b "SYSTEM SYNC REPLICA t8"
b "SYSTEM STOP FETCHES t8"
a "INSERT INTO t8 SELECT toDateTime('2026-10-01 02:00:00') + number, number FROM numbers(7)"
echo "E8 snapshot via clusterAllReplicas (replica, parts):"
a "SELECT hostName(), arraySort(groupArray(name)) FROM clusterAllReplicas(c, system.parts) WHERE table = 't8' AND active GROUP BY hostName() ORDER BY 1 FORMAT TSV"

PARTS="'20261001_0_0_0', '20261001_1_1_0'"
echo "E8a Distributed on a, prefer_localhost_replica=1 (default): $(a "SELECT count() FROM d8 WHERE _part IN ($PARTS)")"
echo "E8a Distributed on b, prefer_localhost_replica=1 (default): $(b "SELECT count() FROM d8 WHERE _part IN ($PARTS)")"
echo "E8b Distributed on a, prefer_localhost_replica=0, load_balancing=random, 8 runs:"
for i in $(seq 1 8); do a "SELECT count() FROM d8 WHERE _part IN ($PARTS) SETTINGS prefer_localhost_replica = 0, load_balancing = 'random'"; done | sort | uniq -c
echo "E8c remote('ch-e8a') from b: $(b "SELECT count() FROM remote('ch-e8a', default.t8, 'default', 'e8') WHERE _part IN ($PARTS)")"
echo "E8c remote('ch-e8b') from a: $(a "SELECT count() FROM remote('ch-e8b', default.t8, 'default', 'e8') WHERE _part IN ($PARTS)")"
echo "E8c _part is readable through Distributed: $(a "SELECT arraySort(groupUniqArray(_part)) FROM d8")"

# E8d: DROP PART of the unfetched part, issued on a; b has a pending fetch for it.
a "ALTER TABLE t8 DROP PART '20261001_1_1_0'"
b "SYSTEM START FETCHES t8"
b "SYSTEM SYNC REPLICA t8"
echo "E8d after drop on a and sync: rows a=$(a "SELECT count() FROM t8") b=$(b "SELECT count() FROM t8"); b queue=$(b "SELECT count() FROM system.replication_queue WHERE table = 't8'")"
