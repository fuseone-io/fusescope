# 0002 · Long-term archive to object storage

- Status: proposed
- Issue: [#11](https://github.com/fuseone-io/fusescope/issues/11)
- Deciders: FuseOne maintainers. Storage layout and schema are decisions that span several PRs.

## Context

ClickHouse keeps hot and warm data; retention deletes it afterwards. Teams need older logs, traces and metrics for audits and incident reviews without paying ClickHouse prices for them. The archive must use an open format readable without FuseScope, and it must be possible to load a slice back for analysis.

Facts that shape the design:

- **Retention today.** `/api/v1/settings/ttl` (traces, metrics) and `/api/v2/settings/ttl` (logs) issue `ALTER TABLE … ON CLUSTER … MODIFY TTL` on the local tables. They record each change in the `ttl_setting` SQL table. Retention can't be set from the config file.
- **Partitions are daily** in every bulk table, and all of them use `ttl_only_drop_parts=1`. Once its TTL passes, a whole day disappears at once. So day D must be fully archived before `D + retention`.
  - `logs_v2` partitions by `(day, _retention_days, _retention_days_cold)`, so one day can span several partitions.
- **Bulk tables to archive:**
  - Logs: `logs_v2` and `logs_v2_resource`.
  - Traces: `signoz_index_v3` and `traces_v3_resource`.
  - Metrics: `samples_v4`, `exp_hist` and `time_series_v4`.

  Aggregates (`samples_v4_agg_*`, `time_series_v4_6hrs/1day/1week`, `trace_summary`) are rebuilt from these and are not archived.
- **Topology.** Every table is local, with a `distributed_*` table over it in cluster `telemetrystore.clickhouse.cluster`.
- **No single-runner primitive.** The backend has no leader election or SQL lock. The default sharder owns every org on every replica.
- **Query routing.** Table names are constants in the logs and traces statement builders. Only metrics chooses tables at query time.
- **Constraints.** No new imports from `fusescope-otel-collector` ([ADR 0001](0001-agpl-collector-dependency.md)). Anything persisted works on SQLite and PostgreSQL.

## Decisions proposed

### 1. Format: Parquet files, written by ClickHouse

The backend issues `INSERT INTO FUNCTION s3(…, 'Parquet') SELECT … FROM distributed_<table> WHERE <day>`. ClickHouse does the reading and writing, and no row data passes through the backend.

- Parquet is readable by ClickHouse `s3()`, DuckDB, Trino, Spark and Athena.
- Writing Iceberg tables from ClickHouse is still experimental in 25.x, so it is out of scope for now. Hive-style paths keep a later Iceberg catalog over the same files possible.
- **Columns to verify in the first slice:** `JSON` and `Dynamic` columns (`resource`, `body_v2`, `body_promoted`) and `DateTime64(9)`. Each gets a round-trip test (export, then `s3()` read) before it ships.

### 2. Layout and idempotency

```
<prefix>/<signal>/<table>/date=YYYY-MM-DD/shard=<n>/<run-id>.parquet
<prefix>/<signal>/<table>/date=YYYY-MM-DD/_manifest.json
```

- The manifest is written last: row count per shard, ClickHouse schema version (migrator), run ID and time. It marks the day as complete.
- A re-run first checks for the manifest and skips the day if it exists. Otherwise it overwrites that day's files (`s3_truncate_on_insert`). The export is therefore idempotent and resumable per day and table.
- **Shards.** `PARTITION BY _shard_num` splits files per shard, but every row still flows through the initiator. That is acceptable for the first version. Export directly from each shard is the scaling step if it ever becomes the bottleneck.

### 3. Credentials: ClickHouse named collections

The backend references a named collection: bucket endpoint plus credentials, defined in ClickHouse by the chart or by an operator. It never puts keys in SQL text. The telemetry store hook logs queries at debug level, so inline credentials would leak into logs. S3, GCS (S3 API) and MinIO all work this way.

### 4. Policy and job state in the SQL store

- **`archive_policy`**, one row per org and signal: `enabled`, `after_days`, `named_collection`, `prefix`.
  - Settable through a new API and declarable in the config file, read-only in the UI like config-managed SSO domains.
  - Validation rejects `after_days` greater than `retention − 2 days`, so a day can't be deleted before it is exported.
- **`archive_run`**, one row per org, table and day: `status`, `rows`, `object_prefix`, `error`, timestamps. It records what was archived and where.
- **`archive_lease`**, a single row with an expiry. A replica takes it with a conditional update (`… WHERE expires_at < now`), which works on both stores. Only the holder runs exports. The lease is short (minutes) and renewed while working.

### 5. Job

A `factory.Service` checks once an hour. For each enabled policy it exports, oldest first, the days that are older than `after_days`, newer than the retention cut-off, and not yet `done`. Query limits from the telemetry store hook (`max_execution_time`, `max_bytes_to_read`) are overridden per export statement.

When a day comes within 24 h of its deletion without being archived, the job logs an error and emits a metric, so it can be alerted on.

### 6. Rehydration: separate tables, explicit read path

- **Where it goes.** A rehydration loads `s3()` data for a time range and filter into `rehydrated_<table>` tables, created by the migrator with the same columns and a short TTL. It never loads into the live tables.
  - Inserting into live tables only works for logs, which have a per-row `_retention_days`. It would also mix restored data with live data and skew usage reports.
- **How it is read.** The logs, traces and metrics statement builders gain a source option (live or rehydrated) that selects the table names. The resource filter builder already takes them as parameters.
- **In the UI.** The explorers show a "rehydrated data" source. That UI change waits until the frontend freeze ends.
- **Lifecycle.** A rehydration is a tracked job (`rehydration` table) with an owner, range, filter, row count and expiry, and the user can delete it early.
- **Collector dependency.** The `rehydrated_*` tables are schema, so they come from the collector's migrator. That is a change in the AGPL repo, under its own licence, with no new imports in the backend.

## Phases

Each phase is its own PR, tests first.

1. **Policy model:** `archive_policy`, `archive_run` and `archive_lease` migrations (SQLite and PostgreSQL), API and config file. No job yet.
2. **Logs export:** the job and lease, manifests and idempotency. Integration test against MinIO: export, re-run is a no-op, then read back with `s3()`.
3. **Traces and metrics export**, with the same test.
4. **Rehydration:** migrator tables, API, statement builder source option, integration test.
5. **UI:** retention settings and the explorer source, after the frontend freeze.

## Consequences

- **Operators** define a named collection in ClickHouse per destination. The Helm chart gains values for it.
- **The archive outlives FuseScope.** The files are plain Parquet in the operator's bucket.
- **Schema drift.** Archived days keep the columns they were written with. Rehydration inserts by column name, and the manifest's schema version flags days that need a mapping.
- **Cost.** Exporting reads each day once from ClickHouse, inside the operator's own cluster.

## Open questions

- Should archiving also cover `trace_summary` and `time_series_v4_*` to speed up rehydrated queries, at the cost of extra storage?
- Is per-org policy needed, or is one per deployment enough for now?
- Do we want an Iceberg catalog over the files, for Trino and Athena users, once ClickHouse writes are stable?
