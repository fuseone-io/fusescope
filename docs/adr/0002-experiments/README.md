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
