# 0004 · Cold storage on object storage for warm data

- Status: proposed
- Deciders: FuseOne maintainers. Chart defaults, backend TTL rules and docs span several PRs and repos.
- Related: [ADR 0002](0002-long-term-archive.md) (Parquet archive, step 2 of the storage-cost plan). This ADR is step 1.

## Context

Telemetry storage is most of what a FuseScope install costs. Today every byte lives on the ClickHouse data volume until retention deletes it, and every replica keeps a full copy. Most queries read the last hours or days; older data is read rarely, for incident reviews and long-range charts. ClickHouse can keep older parts on object storage (S3, GCS, MinIO) behind a storage policy and move them there with `TTL … TO VOLUME`, while they stay queryable. ADR 0002 then exports what leaves ClickHouse to Parquet. The question is whether step 1 is fast and safe enough to be the recommended layout, and what has to change first.

Facts the decision rests on. Code was read on `main` at `ec880a49c` (backend), `17e90db` (charts) and the docs site. Experiments B, S, T and X ran on ClickHouse 25.12.5.44 with the v0.145.0 schema and are reproducible from [`0004-experiments/`](0004-experiments/).

### What exists

- **Chart** (`charts/clickhouse`, values under `clickhouse.coldStorage.*`). With `enabled: true` it renders `config.d/storage.xml`:
  - a disk named after `type` (`s3`, or `gcs` with `<type>s3</type>` and `support_batch_delete = false`), with `access_key_id`/`secret_access_key` inline, or `use_environment_credentials` when `role.enabled` (the annotations go on the ClickHouse service account, for IRSA);
  - a policy `tiered` with volumes `default` (local) and `s3` (`perform_ttl_move_on_insert = 0`, `prefer_not_to_merge = 1`), `move_factor = 0`;
  - no filesystem cache, no region, no setting for zero-copy replication (so the server default, off).
- **Backend** (`pkg/query-service/app/clickhouseReader/reader.go`).
  - `GET /api/v1/disks` returns `system.disks` (`name`, `type`).
  - v1 `POST /api/v1/settings/ttl?…&coldStorage=<volume>&toColdDuration=<d>` (metrics, traces) and v2 `POST /api/v2/settings/ttl` with `coldStorageVolume` / `coldStorageDurationDays` (logs).
  - With a volume set, `setColdStorage` runs `MODIFY SETTING storage_policy = 'tiered'` on each table (the name is hard-coded) and the TTL gains `… + INTERVAL <d> TO VOLUME '<volume>'`, with `materialize_ttl_after_modify = 0`.
  - Logs keep the cold period per row: `_retention_days_cold UInt16 DEFAULT 0` is in the partition key of `logs_v2` and `logs_v2_resource`, and the move rule is `toDateTime(timestamp / 1e9) + toIntervalDay(_retention_days_cold) TO VOLUME`.
  - v1 checks that the cold period is shorter than retention; v2 does not.
  - #156 moves all of this into one `retentiontypes.TTLClause` builder and keeps the `TO VOLUME` rules.
- **UI** (`container/GeneralSettings`). A **Move to S3** field per signal appears only when some disk has type `s3` or `ObjectStorage`. The volume sent is the literal `'s3'`. Logs accept days only; metrics and traces hours, days or months. The logs request sends `'s3'` whenever the field is above 0, without checking that such a disk exists.
- **Docs** (`administration/retention`) show the chart values and the field; nothing on what happens to existing data, caching, replicas or cost.

### Measured

- **Warm cold storage is close to local** (B). With the filesystem cache filled, the six queries ran at 1.0–1.6× the all-local p50, with no S3 requests: 1 h log search 35 vs 32 ms, 24 h 84 vs 63 ms, trace lookup 30 vs 27 ms, 7-day p99 60 vs 38 ms.
- **Cold reads pay per request round** (B). Cache empty, 25 ms per S3 request: 0.3–1.2 s p50 (trace lookup 1.2 s, 24 h log search 1.1 s, 7-day p99 0.6 s), for 36–164 GETs and 14–118 MiB per query. Without the added latency (MinIO on the same host) the same queries took 31–301 ms. The cache downloads aligned segments, so the trace lookup fetched 50 MiB to use 4.7 MiB.
- **The working set is small** (B). One pass of the six queries filled 272 MiB of cache, 10 % of the 2.8 GiB on S3.
- **Local disk is freed almost entirely** (S). Moving 3 GiB left 29 KiB of parts and 32 MiB of disk metadata (1.1 %) locally. Parts are copied as they are, so compression is unchanged. Moves do not fill the cache.
- **PUTs scale with files, not bytes** (S). 7082 PUTs for 55 parts (about 130 objects per part: one per column, mark and index file). Files above 32 MiB go multipart.
- **Enabling cold storage does not move existing data** (T1). With `materialize_ttl_after_modify = 0`, a 20-day-old part stayed local after a 7-day move rule was set. `MATERIALIZE TTL` moved it.
- **Logs written before cold storage was enabled go cold at once** (T2, T2b). Their `_retention_days_cold` is 0, so the move rule is `timestamp + 0 days`. The next merge or `MATERIALIZE TTL` of their part moved 1-hour-old rows to S3. The ADR 0002 backstop (#160) runs `MATERIALIZE TTL` on `logs_v2`, so with a cold rule in place it would push every pre-existing logs partition to S3.
- **Deletes on cold parts are clean** (T3). A delete TTL dropped a cold part and its objects; the bucket and `system.remote_data_paths` matched afterwards.
- **Late data fragments the cold volume** (T4). Inserts older than the move period land locally, are moved within seconds as separate parts and, with `prefer_not_to_merge = 1`, never merge; `OPTIMIZE … FINAL` does nothing. Exporters accept rows up to 15 days old (`maxAllowedDataAgeDays`).
- **Each replica keeps its own copy** (T5). `allow_remote_fs_zero_copy_replication` is 0 by default, so with two replicas each one uploads and stores its parts. ClickHouse documents zero-copy replication as not recommended for production ([MergeTree remote-fs settings](https://clickhouse.com/docs/reference/settings/merge-tree-settings/remote-fs)).
- **Exports from cold parts work, but fill the cache** (X). Exporting one cold day (213 MiB) to Parquet took 2.4–3.7 s vs 2.2 s from local, reading each byte once. With default settings it left the whole day in the cache. With `read_from_filesystem_cache_if_exists_otherwise_bypass_cache = 1` it left nothing, for 2490 GETs instead of about 100.

### Cost

AWS us-east-1 public list prices, read from the AWS price list (`b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/{ec2/ebs,s3}`) on 2026-10-24: EBS gp3 $0.08/GB-month (3000 IOPS, 125 MB/s included); S3 Standard $0.023/GB-month (first 50 TB), PUT $0.005 and GET $0.0004 per 1000 requests. DELETE is free.

Workload: 1 TB of compressed telemetry ingested per month (33 GB/day), 2 replicas, EBS kept at most 75 % full, cache 10 % of the cold data per replica, 2 M cold GETs a month. PUTs are given as a range: about 120 k a month for large production parts, and 2300 per GB (the density measured on S's small parts) as the worst case.

| Retention | All local (gp3) | Hot 7 days + cold on S3 | Saving |
|---|---|---|---|
| 30 days (233 GB hot, 767 GB cold) | $213 | $101–123: gp3 $52, cache $12, S3 $35, PUT $1–23, GET $1 | 42–53 % |
| 90 days (233 GB hot, 2767 GB cold) | $640 | $230–251: gp3 $56, cache $44, S3 $127, PUT $1–23, GET $1 | 61–64 % |

Not included: EBS snapshots of the local volume (cold parts are not in them), NAT gateway data processing (avoided with an S3 gateway VPC endpoint), instance cost, which drops too when smaller disks allow smaller nodes.

## Decision

1. **Recommended layout for production: 7 days hot on local disk, the rest of retention on object storage.** It stays opt-in (`clickhouse.coldStorage.enabled: false`) because it needs a bucket, but the docs and the install guide present it as the default for any install that keeps more than 7 days. Metrics, which are small and read over long ranges by dashboards, keep their whole retention local unless an install opts in.
2. **The chart ships a cache in front of the object storage disk.**
   - A `cache` disk over the `s3`/`gcs` disk, used by the `s3` volume, on the ClickHouse data volume.
   - `clickhouse.coldStorage.cache.maxSize`, default `50Gi`. Rule of thumb: the larger of 10 % of the cold data and 2 days of compressed ingest, and the data volume sized for hot data + cache + 1 % metadata.
   - The volume name `s3` and policy name `tiered` stay: the backend and UI depend on them. The docs state them for `externalClickhouse` users.
3. **Chart values become safe to enable.**
   - No placeholder defaults (`<access_key_id>` renders invalid XML); rendering fails when `enabled` and `endpoint` is empty.
   - Keys come from a Kubernetes Secret through environment variables (`from_env`), not inline XML.
   - `region` is configurable. GCS stays on the S3-compatible API with HMAC keys; workload identity is out of scope.
4. **Replicas keep their own copies; zero-copy replication stays off.** We accept 2× object storage for 2 replicas; it is still the cheapest tier and avoids the known zero-copy failure modes.
5. **Backend fixes before the docs recommend it** (one PR each, on top of #156):
   - the logs move rule treats `_retention_days_cold = 0` as "not set": `toIntervalDay(if(_retention_days_cold = 0, <cold days>, _retention_days_cold))`, so pre-existing logs move by age, and #160's `MATERIALIZE TTL` cannot push them to S3 early;
   - enabling or shortening the cold period runs `MATERIALIZE TTL` per table, so existing parts move by age instead of only parts written later;
   - v2 rejects a cold period not shorter than retention, as v1 does;
   - the UI sends a volume only when an object storage disk exists, and the field reads **Move to object storage** (S3, GCS or MinIO).
6. **ADR 0002 exports read cold parts without filling the cache**, with `read_from_filesystem_cache_if_exists_otherwise_bypass_cache = 1`.
7. **The retention page and docs say** that data older than the move period is stored in the bucket and stays queryable, that the first query on cold data takes about a second and repeats are close to local, that the bucket must not have lifecycle rules or be shared with other writers, and that backups of the local volume do not contain cold data.

## Consequences

- **Cost.** 40–65 % less storage spend for 30–90 days of retention, more as retention grows, since cold bytes cost $0.023 instead of $0.08 / 0.75.
- **Latency.** Queries over cold data that is not cached take up to about 1 s per query on S3, mostly per-request latency; cached, they are close to local. After a restart or a cache eviction the first queries are slow again. Cache persistence across restarts and behaviour with a cache smaller than the working set were not measured.
- **S3 requests.** PUTs are paid once per part move and per replica; GETs are paid on cache misses. Both were under $25 a month in the estimate. Bypassing the cache for exports trades cache pollution for about 20× the GETs of one export, a fraction of a cent.
- **Merges.** Cold parts are not merged (`prefer_not_to_merge = 1`), so a merge never downloads and re-uploads a large part. The price is late data: rows older than the hot window become small parts that stay unmerged until deleted. Operators should watch the cold part count; a hot window shorter than `maxAllowedDataAgeDays` makes this more frequent.
- **Deletes.** TTL deletes of cold parts remove their objects; with `ttl_only_drop_parts = 1` nothing is downloaded. A bucket lifecycle rule that deletes objects behind ClickHouse's back corrupts parts.
- **Replication.** Two replicas store and upload twice.
- **Disk sizing.** The local volume shrinks to hot data + cache + metadata; `move_factor = 0` means a full local disk still blocks inserts instead of moving parts early.
- **ADR 0002.** The archive reads cold parts from S3 at about the speed of local reads, one read per byte, and drops them with `DROP PART`, which deletes their objects (T3). The ingestion-time backstop must keep the cold rule; #156/#160 already preserve `TO VOLUME`, and decision 5 keeps #160's `MATERIALIZE TTL` from moving pre-existing logs early.

## For the team to confirm

- The 7-day hot window and the `50Gi` cache default.
- Whether metrics should also go cold by default.
- Whether decision 5's logs fix lands in #160 or before it.

## Evidence

| Id | What | Where |
|---|---|---|
| B | Query latency, local vs S3 cold/warm, with and without 25 ms | [`0004-experiments/README.md#b`](0004-experiments/README.md), [`results.tsv`](0004-experiments/results.tsv) |
| S | Storage and PUTs after the move | [`move.log`](0004-experiments/move.log), [`storage.tsv`](0004-experiments/storage.tsv) |
| T1–T5 | TTL moves, cold = 0 rows, deletes, late data, defaults | [`ttl.sh`](0004-experiments/ttl.sh), [`ttl.log`](0004-experiments/ttl.log) |
| X1–X4 | Parquet export from cold and local parts | [`export.sh`](0004-experiments/export.sh), [`export.log`](0004-experiments/export.log) |
