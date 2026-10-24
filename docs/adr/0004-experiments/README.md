# ADR 0004 experiments

Run on 2026-10-24 against `clickhouse/clickhouse-server:25.12.5` (`SELECT version()` → `25.12.5.44`), MinIO `RELEASE.2025-04-22T22-12-26Z` and the schema of `ghcr.io/fuseone-io/fusescope-otel-collector:0.145.0` (the devenv's migrator), on one x86-64 Linux host (32 threads, NVMe), Docker. ClickHouse ran with `max_server_memory_usage` 8 GiB in a 12 GiB container.

## Setup

[`compose.yaml`](compose.yaml) starts MinIO, a Toxiproxy in front of it, one ClickHouse with embedded Keeper (cluster `cluster`, one shard, one replica, `Replicated*` tables like the devenv), and the migrator. [`config/storage.xml`](config/storage.xml) is the chart's `tiered` policy (volumes `default` and `s3`, `perform_ttl_move_on_insert = 0`, `prefer_not_to_merge = 1`, `move_factor = 0`) with one change: the `s3` volume uses a 4 GiB filesystem cache disk (`s3_cache`) over the `s3` disk.

```bash
docker compose -p csbench up -d          # waits for the migrator
./gen.sh                                 # 10 days: 30 M logs_v2 rows, 15 M spans, resource tables, trace_summary
./bench.sh local warm 7                  # all parts on local disk
./ttl.sh                                 # T1–T5, on small tables in database ttlx
./move.sh                                # storage_policy = 'tiered', MOVE PARTITION … TO VOLUME 's3' for every partition
./bench.sh s3-cold cold 7
./bench.sh s3-warm warm 7
docker exec csbench-toxiproxy-1 /toxiproxy-cli toxic add -t latency -a latency=25 -u -n lat s3
./bench.sh s3-cold-25ms cold 7
./bench.sh s3-warm-25ms warm 7
./export.sh                              # X1–X4
docker exec csbench-clickhouse-1 clickhouse-client --queries-file /w/report.sql
docker compose -p csbench down -v
```

- **Data** ([`gen-logs.sql`](gen-logs.sql), [`gen-spans.sql`](gen-spans.sql), [`gen-resources.sql`](gen-resources.sql)). 3 M logs and 1.5 M spans a day, 30 services, 240 resources (pods), templated bodies with high-cardinality ids, maps with `http.*`, `user.id` and `request.id`, half the logs carry a trace id, 10 spans per trace, 3 % error spans. Inserted into the local tables, so `trace_summary_mv` fills `trace_summary`; the dependency-graph and root-operation views were detached to speed up the load. Every table was `OPTIMIZE … FINAL`ed, so each day is one part, as old partitions are in production.
- **Queries** ([`queries/`](queries/)) follow the shape the query builder emits (resource-filter CTE, `ts_bucket_start` bounds, `distributed_*` tables). Each reads data of days 1–8 of the window.
- **Modes** ([`bench.sh`](bench.sh)).
  - `cold`: every ClickHouse cache is dropped before each run, the filesystem cache included.
  - `warm`: one unrecorded priming run, then only the in-memory caches (marks, uncompressed, primary and skipping index, query condition) are dropped before each run.
  - `local` runs in `warm` mode: the OS page cache is warm, so it is the best case for local disk.
  - `-25ms`: Toxiproxy, always in the path, adds 25 ms to every request ClickHouse sends to MinIO, an approximation of S3 first-byte latency. Without it MinIO answers in under 1 ms.
- **Counters** come from `system.query_log` `ProfileEvents`: `S3GetObject`, `ReadBufferFromS3Bytes`, `CachedReadBufferReadFromCacheBytes`. The `minio_get` column (MinIO's Prometheus counter) was too coarse per query and is ignored.

## B: query latency, all-local vs S3 cold vs S3 warm

7 runs each; full rows in [`results.tsv`](results.tsv) and [`runs.csv`](runs.csv). Columns: p50 / p95 in ms, `GET` = S3 GETs per run, `S3` = MiB downloaded per run.

| Query | Local | S3 warm | S3 cold, LAN | S3 cold, +25 ms | GET | S3 |
|---|---|---|---|---|---|---|
| Logs, 1 service, ERROR + `timeout`, 1 h | 32 / 34 | 35 / 36 | 67 / 87 | 916 / 973 | 60 | 32 |
| Same, 24 h | 63 / 68 | 84 / 95 | 301 / 692 | 1139 / 1216 | 96 | 99 |
| Logs, full-text count per 5 min, all services, 24 h | 37 / 38 | 56 / 58 | 155 / 187 | 401 / 445 | 36 | 75 |
| Trace lookup (`trace_summary` + spans) | 27 / 28 | 30 / 32 | 74 / 114 | 1185 / 1239 | 105 | 50 |
| Service p99 per hour, 7 days | 38 / 50 | 60 / 64 | 176 / 211 | 602 / 656 | 164 | 118 |
| Top 10 errors, 24 h | 16 / 18 | 24 / 27 | 31 / 32 | 286 / 286 | 50 | 14 |

- Warm S3 is within 1.0–1.6× of local and makes no S3 requests.
- Cold cost is latency × request rounds, not bandwidth: at most 118 MiB per query, but 0.3–1.2 s with 25 ms per request.
- Cold reads download more than the query needs: the trace lookup read 50 MiB from S3 to use 4.7 MiB of cached data, because the cache downloads aligned segments (several MiB) of every column file it touches.
- A repeat of the cold and warm runs (`s3-*-repeat` in `results.tsv`) was within 15 % at p50; the cold 24 h p95 varied between 342 and 692 ms.
- One full pass of the six queries filled 272 MiB of cache, 10 % of the 2.8 GiB on S3.

## S: storage after the move

[`move.log`](move.log), [`storage.tsv`](storage.tsv).

| | Before | After |
|---|---|---|
| Parts on local disk (5 tables) | 3.00 GiB | 29 KiB |
| On S3 | — | 3.0 GiB, 7143 objects (55 parts) |
| Local metadata of the S3 disk | — | 32 MiB (1.1 % of the data) |
| Filesystem cache after the move | — | 3.2 MiB (moves do not fill it) |

- The move of 3 GiB took 7 s of part-move time to MinIO on the same host, with 7082 PUTs: one object per column, mark and index file, about 130 per part. Files above `s3_max_single_part_upload_size` (32 MiB) use multipart uploads, so on large parts PUTs grow with bytes / part size, not with files.
- Compression on S3 is unchanged: parts are copied as they are (logs 2.1 GiB compressed for 13.1 GiB uncompressed).

## T: TTL, moves and merges on the `tiered` policy

[`ttl.sh`](ttl.sh), [`ttl.log`](ttl.log). Small tables, same engine and settings as the bulk tables.

| | Result |
|---|---|
| T1 | `MODIFY SETTING storage_policy = 'tiered'` then `MODIFY TTL … DELETE, ts + 7 DAY TO VOLUME 's3' SETTINGS materialize_ttl_after_modify = 0` (the backend's `SetTTL` form): a 20-day-old part stayed on `default` 15 s later. After `MATERIALIZE TTL` it moved to `s3`; the 1-day-old part stayed local. **Enabling cold storage does not move data written before it.** |
| T2 | `logs_v2` form: 100 rows written before cold storage was enabled have `_retention_days_cold = 0` (the column's default), in their own partition. After `MODIFY COLUMN _retention_days_cold DEFAULT 7` and `MODIFY TTL … + toIntervalDay(_retention_days_cold) TO VOLUME 's3'`, a merge of that 1-hour-old part **moved it to `s3` at once**; rows written afterwards (`cold = 7`) stayed local. |
| T2b | Same with `MATERIALIZE TTL` instead of a merge (the ADR 0002 backstop path, #160): the `cold = 0` part moved to `s3` at once. |
| T3 | A part moved to `s3` and then expired by a delete TTL (`ttl_only_drop_parts = 1`) was dropped and its objects deleted from the bucket. `system.remote_data_paths` and the bucket listed the same 7143 objects afterwards: no orphans. |
| T4 | Four inserts of 5-day-old data (late data) landed on `default` (`perform_ttl_move_on_insert = 0`) and were moved to `s3` within 15 s, as four parts. With `prefer_not_to_merge = 1` they did not merge, and `OPTIMIZE … FINAL` silently did nothing. |
| T5 | Defaults: `allow_remote_fs_zero_copy_replication = 0`, `merge_with_ttl_timeout = 14400`, `background_move_pool_size = 8`. |

## X: exporting a cold day to Parquet (ADR 0002)

[`export.sh`](export.sh), [`export.log`](export.log). One `logs_v2` day (3 M rows, 213 MiB compressed) to `s3(…, 'Parquet')` with zstd, 25 ms latency on the cold reads.

| | Time | S3 GET | Read from S3 | Filesystem cache after |
|---|---|---|---|---|
| X1 cold, default settings | 2.4–3.7 s | 88–134 | 213 MiB | 213 MiB (the whole day) |
| X2 cold, `read_from_filesystem_cache_if_exists_otherwise_bypass_cache = 1` | 2.5 s | 2490 | 223 MiB | 0 |
| X3 cold, `enable_filesystem_cache = 0` | 2.7 s | 2486 | 216 MiB | 0 |
| X4 local part | 2.2 s | 0 | 0 | 0 |

An export reads each cold byte about once; time is dominated by writing Parquet. With default settings it fills the cache with the whole day and evicts the interactive working set; bypassing the cache costs 20–30× the GETs (2490 GETs is $0.001).

## Limitations

- One replica; zero-copy replication and two replicas sharing a bucket were not run.
- MinIO on the same host. The 25 ms toxic adds latency per request, not S3's throughput limits, throttling (`503 SlowDown`) or tail latency.
- 3 GiB of data and one-day parts of 0.2–2 GiB; production parts are larger, so per-query GET counts and PUTs per GB are upper bounds.
- The cache was larger than the data; eviction under a cache smaller than the working set was not measured.
- Local runs had the OS page cache warm; cold local reads from EBS would be slower than shown.
- GCS, IAM roles (IRSA) and the chart's rendered config were not run against a cluster.
