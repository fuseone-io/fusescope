# ADR 0002 experiments

Run on 2026-10-18 against `clickhouse/clickhouse-server:25.12.5` (`SELECT version()` → `25.12.5.44`), Docker on Colima (arm64).

## E1–E3: single node (`clickhouse local`)

```bash
docker run --rm -v "$PWD":/w clickhouse/clickhouse-server:25.12.5 \
  clickhouse local --multiquery --queries-file /w/e1-e3.sql --path /tmp/chlocal
```

| | Result |
|---|---|
| E1 | `MOVE PARTITION … TO TABLE` on a `MergeTree` moved the 1000 committed rows; a row inserted afterwards stayed in the live table (1) and a second move took it; dropping the first stage table left the live table intact. |
| E2 | `CREATE TABLE stage AS live` copied `PARTITION BY` and `ORDER BY` (`MergeTree` only). |
| E3 | `ReplacingMergeTree(computed_at)` with merges stopped: 3 physical rows for one key; two share the same `computed_at`. `FINAL` returned the last inserted (30). `argMax` happened to return 30 too, but its tie-breaking is not documented, so only `FINAL` is relied on. |

## E4–E5: two replicas of one shard (embedded Keeper)

```bash
docker run -d --name ch-e4 -v "$PWD/keeper.xml":/etc/clickhouse-server/config.d/keeper.xml \
  -v "$PWD":/w clickhouse/clickhouse-server:25.12.5
docker exec ch-e4 clickhouse-client --multiquery --queries-file /w/e4.sql
docker exec ch-e4 clickhouse-client --multiquery --queries-file /w/e5.sql
```

| | Result |
|---|---|
| E4 | Replica `b` with fetches stopped lacked a committed 50-row part. `MOVE PARTITION` issued on `b` moved its 100 rows; after both replicas synced, **the 50-row part was gone from both** (`live_a` 0, stage 100). `MOVE`/`DROP PARTITION` remove the whole block range, including parts the issuing replica hasn't fetched. |
| E5 | Same lag. `DROP PART` of the two part names `b` had (`20261001_0_0_0`, `20261001_1_1_0`), issued on `b`, removed only those; the unfetched part `20261001_2_2_0` (7 rows) survived on both replicas. |
| E5b | A merge folding part 2 with a later part 3 produced `20261001_2_3_1`: the block range in the name widens to `2–3`. |

Limitations: one shard, two replicas on one server, no concurrent insert racing the `DROP PART` itself, no Distributed table, no network delay.

## E6: a column added later, and TTL on existing parts (single node)

Run on 2026-10-24, same image (`25.12.5.44`).

```bash
docker run -d --name ch-e6 -v "$PWD/keeper.xml":/etc/clickhouse-server/config.d/keeper.xml \
  -v "$PWD":/w clickhouse/clickhouse-server:25.12.5
docker exec ch-e6 clickhouse-client --multiquery --ignore-error --queries-file /w/e6.sql
```

| | Result |
|---|---|
| E6a | `ALTER TABLE … ADD COLUMN created_at DateTime64(3) DEFAULT now64(3)` on a resource-shaped `ReplacingMergeTree` created no mutation. Old rows evaluate the DEFAULT at read time: two reads 2 s apart returned different `created_at`. |
| E6b | `MODIFY TTL greatest(event, created_at) + 22 d … SETTINGS materialize_ttl_after_modify = 0` (the backend's form) left `delete_ttl_info_max` of existing parts unchanged (event time + 15 d); only the part inserted afterwards carried `now + 22 d`. |
| E6c | With merges resumed, the pre-existing 20-day part was **dropped under its old TTL info**, although the new expression would keep it until `now + 22 d`. The parts written after the change survived. Rewriting the TTL does not protect parts that already exist. |
| E6d | `materialize_ttl_recalculate_only = 1` + `MODIFY TTL` with `materialize_ttl_after_modify = 1`: one `MATERIALIZE TTL` mutation, `delete_ttl_info_max` became `now + 22 d`, part renamed `_1_1_1 → _1_1_1_2`, `bytes_on_disk` unchanged (624). Old rows get `created_at = now` for TTL purposes. |
| E6e | `INSERT INTO t SELECT a, b, c` (no column list) succeeds with `created_at … MATERIALIZED now64(3)` and fails with `… DEFAULT now64(3)` (`NUMBER_OF_COLUMNS_DOESNT_MATCH`, source 3, result 4). |
| E6f | `ReplacingMergeTree` with a MATERIALIZED `created_at` outside the key: two inserts of one key, `OPTIMIZE FINAL` kept one row with the later `created_at`. |

Limitations: single node, tiny parts, `merge_with_ttl_timeout = 0`; E6e uses `INSERT … SELECT`, not the native protocol the exporters use (clickhouse-go checks the same arity client-side, `lib/proto/block.go`).

## E7: `DROP PART` under concurrent inserts; block numbers vs commit order

```bash
./e7.sh ch-e6
```

| | Result |
|---|---|
| E7a | 200 single-row inserts into the partition while `DROP PART` of its only existing part ran: all 200 rows present, the named part gone, 200 active parts. |
| E7a2 | `DROP PART` of a name a merge had already replaced: `Code: 232 … No part … in committed state (NO_SUCH_DATA_PART)`, table untouched. |
| E7b | `MergeTree`: a 4 M-row insert racing 0.2 s single-row inserts. The large part got the highest block number (`_9_9_0`): the number is taken after the block is formed, just before the write. No inversion (lower block number committing later) was observed. |
| E7c | `ReplicatedMergeTree`: same, large part `_8_8_0` between the small ones; no inversion. Block numbers are allocated in Keeper at commit. |

Limitations: single server, no Keeper or disk latency; E7b/E7c show the window is small, not that it does not exist. One run each.

## E8: `_part IN (…)` through a Distributed table with a lagging replica (two containers)

```bash
./e8.sh    # creates network e8, ch-e8a (Keeper + replica a) and ch-e8b (replica b); removes them at the end
```

| | Result |
|---|---|
| E8 | After `STOP FETCHES` on `b` and an insert through `a`: `clusterAllReplicas(c, system.parts)` showed `a` = `{_0_0_0, _1_1_0}`, `b` = `{_0_0_0}`. |
| E8a | `SELECT count() FROM d8 WHERE _part IN (…)` with `prefer_localhost_replica = 1` (default) returned 107 on `a` and 100 on `b`. |
| E8b | Same query on `a` with `prefer_localhost_replica = 0, load_balancing = 'random'`, 8 runs: 5 × 107, 3 × 100. |
| E8c | `remote('ch-e8a', …)` from `b` → 107; `remote('ch-e8b', …)` from `a` → 100. `_part` is readable through the Distributed table. |
| E8d | `DROP PART '…_1_1_0'` on `a` while `b` still had the fetch pending; after `START FETCHES` + `SYNC REPLICA`: 100 rows on both, empty replication queue. |

Limitations: one shard, two replicas, Docker network without delay; the image's `default` user needs a password for inter-node queries (`CLICKHOUSE_PASSWORD=e8`, also in `e8-a.xml`/`e8-b.xml`).

## E9: `MATERIALIZE TTL` with and without `materialize_ttl_recalculate_only`

Run on 2026-10-24, same image.

```bash
./e9.sh    # creates ch-e9 (embedded Keeper) and removes it at the end
```

| | Result |
|---|---|
| E9a | `materialize_ttl_recalculate_only` as a query setting: `UNKNOWN_SETTING`. It is a MergeTree table setting; the migrator's tables don't set it (`system.tables` on migrator 0.145.0). |
| E9b | `ttl_only_drop_parts` tables, a part of 1000 rows half of which are expired, `MODIFY TTL greatest(ts + 40 d, c + 47 d)` then `MATERIALIZE TTL`: with the setting off, on, and on two replicas, the same result. 1000 rows kept, `delete_ttl_info_max` recalculated, the TTL columns `ts` and `c` rewritten (link count 1), `k` and `v` kept as hardlinks (2). |
| E9c | The replicated mutation ran on both replicas (`MutatePart` on `a` and `b`). |

Limitations: one server, small parts; a table without `ttl_only_drop_parts` was not part of E9 (in a side run it deleted the expired rows and rewrote every column, as documented).
