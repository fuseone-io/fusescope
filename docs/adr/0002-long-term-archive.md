# 0002 · Long-term archive to object storage

- Status: proposed
- Issue: [#11](https://github.com/fuseone-io/fusescope/issues/11)
- Deciders: FuseOne maintainers. Storage layout, retention semantics and schema span several PRs.

## Context

ClickHouse keeps hot and warm data and retention deletes it afterwards. Teams need older logs, traces and metrics for audits and incident reviews without keeping them in ClickHouse. The archive must be in an open format readable without FuseScope, and a slice of it must be loadable back for analysis.

Facts the design rests on, checked against the backend, migrator v0.145.0 (the version `go.mod` pins) and ClickHouse 25.12.5. Evidence is listed at the end.

- **Deletion is per part, not per day.** Bulk tables set `ttl_only_drop_parts=1`: a *part* is dropped once all its rows are expired, during a TTL merge (at most every `merge_with_ttl_timeout`, 4 h by default). A daily partition holds many parts. They disappear at different times, and expired rows stay queryable until their part goes. A part mixing expired and live rows keeps both.
- **Logs retention is per row.** `_retention_days` and `_retention_days_cold` are column defaults computed at insert from the retention rules, and they are part of the `logs_v2` partition key. One day spans several partitions, and a rule change affects only rows inserted afterwards.
- **Late data is normal.**
  - Logs and traces exporters accept rows up to `maxAllowedDataAgeDays` old, 15 days by default. That equals the default retention.
  - Metrics have no age limit.
  - So a day is never final when it ends, and "export day D once it is closed" can't work.
- **Insertion time is recorded.** `logs_v2` and `signoz_index_v3` have `created_at DEFAULT now64(3)`. The metrics tables have `inserted_at_unix_milli`, which has no default, so whether the exporter fills it must be verified before metrics are archived.
- **Restoring a signal takes more than its main table.**
  - **Logs:** `logs_v2` plus `logs_v2_resource`, which the resource filter reads.
  - **Traces:** `signoz_index_v3`, `traces_v3_resource`, `trace_summary` and `signoz_error_index_v2`.
    - Trace detail and every `trace_id`-filtered query start from `trace_summary`; without it they report "trace not found" or return empty.
    - The exceptions list reads `signoz_error_index_v2`, which the exporter writes directly.
    - Services, entry-point operations and the service map read MV-derived tables (`top_level_operations`, `dependency_graph_minutes_v2`).
  - **Metrics:** `samples_v4`, `exp_hist` and `time_series_v4`, plus, when metric reduction is on, `samples_v4_reduced_last_60s`, `samples_v4_reduced_sum_60s` and `time_series_v4_reduced`.
    - `samples_v4_mv` keeps only `reduced_fingerprint = 0`, so reduced series exist only in the reduced tables.
    - The querier picks rollups by range length: `samples_v4_agg_5m/30m` and `time_series_v4_6hrs/1day/1week`. Restored data must not depend on rollups that weren't restored.
- **Telemetry has no organization column.** Statement builders use the org ID only for flags and metadata, so telemetry is per deployment. The SQL state (`ttl_setting`) carries `org_id`, but the ALTERs it records are cluster-wide.
- **Writing to S3.**
  - An `s3()` insert refuses to overwrite an existing key unless `s3_truncate_on_insert` or `s3_create_new_file_on_insert` is set, and both act on the exact target key.
  - Multipart uploads become visible only on completion. An error or `KILL QUERY` aborts the upload; a server crash leaves an incomplete upload behind.
  - Writes to several keys aren't transactional.
- **Parquet in 25.12** (custom encoder, the default):
  - `JSON` is written as the Parquet JSON logical type, and DuckDB reads it as `JSON`.
  - `Dynamic` and `Variant` are rejected.
  - `UUID` is written in ClickHouse's internal byte order, so DuckDB reads a different value.
  - `DateTime64(9)` is written as `TIMESTAMP(NANOS)`. ClickHouse keeps the nanoseconds; DuckDB truncates them to microseconds.
  - Iceberg writes are still experimental (`allow_experimental_insert_into_iceberg`).

Constraints: no new imports from `fusescope-otel-collector` ([ADR 0001](0001-agpl-collector-dependency.md)), and every persisted state works on SQLite and PostgreSQL.

## Decisions

Kept from the first draft:

- Parquet as the format.
- Data moves only inside ClickHouse (`INSERT INTO FUNCTION s3`, `INSERT … SELECT FROM s3`).
- Credentials go through named collections.
- Restored data lives apart from the live tables.

### 1. Scope: one policy per deployment

The archive and its restorations cover the whole deployment, because the telemetry they copy has no organization. The policy is declared in the configuration file (`archive:` per signal: `enabled`, `after_days`, `named_collection`, `prefix`); the API and UI only show its status. Object paths, manifests and state carry no organization.

**Restriction recorded:** in a multi-org deployment, restored data is visible to every org that can query telemetry, exactly as live telemetry is today. Per-org archives would need an org dimension in the telemetry schema first.

### 2. Retention: deletion waits for the archive, with a backstop

When the archive is enabled for a signal, losing data because the job was down is not acceptable within a bounded window:

- **TTL becomes a backstop.** The ClickHouse TTL is set to `retention + backstop_days` (default 7).
- **The job deletes after confirmation.** Once data past retention is archived, the job removes it with `ALTER TABLE … DROP PARTITION`:
  - For logs, the partition key is `(day, _retention_days, _retention_days_cold)`, so a whole retention class of a day goes at once.
  - A partition is dropped only when the segments that cover it are published (§3) and its newest `created_at` is older than the late-data window.
  - Partition drops are exact. They don't wait for TTL merges.
- **Prolonged failure.** If the job can't archive before the backstop, TTL deletes the data. The job records the affected partitions as `lost` and emits a metric that is alertable from the moment a partition is past retention and still unarchived. Loss is therefore possible only after `backstop_days` of failure, and it is always recorded.
- **Lowering retention later.** The retention API refuses a new value that would make unarchived partitions eligible for deletion, unless the request sets `force`, which records the partitions as `lost`. Raising retention needs nothing.
- **Disabling the archive** restores the plain TTL.

`after_days` only sets when archiving starts. Data still in ClickHouse is exported incrementally, so the archive stays close to the live data.

### 3. Export: immutable segments by insertion time

The export unit is a **segment**: the rows of one table inserted in `[watermark_from, watermark_to)` (by `created_at`), grouped by event day.

- Each run exports, for every day still inside retention, the rows that arrived since the last published segment. Late rows therefore land in later segments, and no segment is ever rewritten.
- Rows written before `created_at` existed (default `0`) go into one initial backfill segment per day.
- **Scan cost.** Scanning every open day for new rows needs pruning on `created_at`. Phase 1 measures it; if it is too costly, a `minmax(created_at)` skip index is added in the migrator.

**Related tables share a segment group.** A group is one export window of a signal: `logs_v2` and `logs_v2_resource`, or the four trace tables. It is published or abandoned as a unit.

**Layout.** All objects are immutable, and written without `s3_truncate_on_insert`, so a key collision is an error, never an overwrite:

```
<prefix>/<signal>/<table>/date=YYYY-MM-DD/group=<group-id>/attempt=<attempt-id>/shard=<n>.parquet
<prefix>/_manifests/<group-id>/<attempt-id>.json
```

**Commit protocol.** Each step is idempotent:

1. **Take the lease.** `archive_lease` holds `epoch`, `holder` and `expires_at`. Taking it is a conditional update that increments `epoch`, and that number is the fencing token. It is renewed while working.
2. **Record the attempt.** Insert an `archive_attempt` row (`group_id`, `attempt_id`, `epoch`, status `writing`).
3. **Export.** Per table, one `INSERT INTO FUNCTION s3(<collection>, …) PARTITION BY _shard_num SELECT … FROM distributed_<table>` with `query_id = attempt_id`.
4. **Verify.** For each table and shard, the row count read back with `s3()` must equal the source count for the same window and shard.
5. **Write the manifest.** It is a new key, never overwritten, and lists the exact object keys, sizes and per-shard row counts, the window, the source columns and types (from `system.columns`), the migrator version and the epoch.
6. **Commit.** One SQL transaction marks the attempt `published` and records the group in `archive_segment`. The update applies only if `epoch` still equals the lease epoch, and `(table, day, window)` is unique among published segments.

**Publication is the SQL commit.** A manifest whose attempt isn't `published` in SQL is ignored. Restoration reads only the objects listed in the manifest of a published attempt.

**Failures:**

- **Before step 6.** The attempt stays `writing`. The next run starts a new attempt for the same window; the old one is abandoned.
- **Between steps 5 and 6.** The manifest is orphaned and the window is exported again under a new attempt. Nothing is duplicated, because only one attempt per window can commit.
- **Lease lost mid-query.** The ClickHouse query may keep writing, but only under its own attempt prefix, and its commit fails on the epoch check. The new holder kills it with `KILL QUERY WHERE query_id = <attempt_id>`.

**Cleanup.**

- The job deletes the prefixes and manifests of attempts that are not published and older than 24 h.
- The bucket must have an `AbortIncompleteMultipartUpload` lifecycle rule, because a ClickHouse crash leaves incomplete multipart uploads.

### 4. Format contract

- **Types:**
  - Columns are exported with their ClickHouse types, except `UUID` (exported as `toString`) and any `Dynamic` or `Variant` (exported as `String`). Phase 1 confirms which `Dynamic` paths the current schema can produce.
  - `JSON` columns keep the Parquet JSON type. The export forces `output_format_parquet_use_custom_encoder=1`, because the Arrow encoder rejects `JSON`.
  - `DateTime64(9)` stays nanosecond. Traces also get a `timestamp_unix_nano UInt64` column, so readers that stop at microseconds (DuckDB) keep full precision. Logs already store `timestamp` as `UInt64` nanoseconds.
- **Portability is tested outside ClickHouse.** The acceptance suite reads every exported table with DuckDB, checking row counts and sample values for JSON, maps, arrays and timestamps.
- **Old schemas.**
  - Restoring a segment builds an explicit column mapping from its manifest's source columns to the current rehydration table, and inserts with an explicit column list, so missing columns get the table defaults.
  - Files are read one segment at a time with the structure from its manifest, never inferred from a glob.
  - A migration that renames or retypes an archived column must ship a restore adapter, a SQL mapping keyed by migrator version. Without one, restoring an older segment fails with `incompatible` instead of loading wrong data.

### 5. Restoration (rehydration)

**Tables.** Restored data goes into `rehydrated_<table>` tables, created by the migrator:

- They have the same columns as the live table, plus `rehydration_id UUID` and `expires_at DateTime`.
- `PARTITION BY rehydration_id`, `ORDER BY (rehydration_id, <live order by>)`.
- `TTL expires_at`, so expiry follows the restoration's validity, not the events' timestamps.

**Which tables are restored:**

- **Logs:** `logs_v2` and `logs_v2_resource`.
- **Traces:** the four trace tables. `trace_summary` is rebuilt from the restored spans, so trace detail and `trace_id` filters work.
- **Metrics:** the raw and reduced tables listed in Context. Rollups are not restored.
- **Not supported on restored data:** services pages, entry-point operations and the service map.

**Lifecycle:**

- **States.** A `rehydration` row holds the signal, time range, filter, owner, `expires_at` and status: `pending`, `loading`, `ready`, `failed`, `expired` or `deleted`.
- **Loading.** The data comes only from published segments overlapping the range, with the filter applied in the `INSERT … SELECT`. A `rehydration_segment` ledger records what has been loaded.
- **Retry after failure.** `DROP PARTITION <rehydration_id>`, then load again from scratch, so a retry can't duplicate rows.
- **Isolation and duplicates.** Overlapping restorations have different IDs and never mix. Segments of a signal cover disjoint insertion windows, so no row is loaded twice within one restoration.
- **Deletion and expiry.** Early deletion and expiry both run `DROP PARTITION`, which is exact. TTL is only the backstop, and queries also filter on `expires_at > now()`.

**Querying.** The logs, traces and metrics statement builders gain a source:

- `live` (the default), or `rehydration` with one `rehydration_id`. Each query selects a single restoration, never "everything restored".
- On a rehydration source, metrics use the raw and reduced tables for every range length, never the rollups.

**Authorization:**

- Creating or deleting a restoration requires the Admin role, since it uses ClickHouse storage.
- Querying one requires the same read access as the signal's live data.
- Restorations are visible deployment-wide (§1).

## Phases and acceptance

Each phase is its own PR, tests first, with SQL state on SQLite and PostgreSQL.

1. **Logs, end to end.** State tables (`archive_lease`, `archive_attempt`, `archive_segment`, `rehydration`, `rehydration_segment`), the config-file policy, export, the rehydration tables (migrator), restore, the statement-builder source, expiry and deletion. Integration tests against S3-compatible storage cover:
   - export, then a re-run that publishes nothing new;
   - late rows after an export, landing in a new segment;
   - the job down past `after_days`, then catching up;
   - a lease lost mid-export: the stale attempt can't publish, and the new holder kills its query;
   - one shard or the resource table failing, so the group isn't published;
   - a crash between manifest and commit: re-exported once, no duplicates;
   - overlapping restorations queried independently;
   - restoration retry, early deletion and expiry;
   - DuckDB reading every exported file.
2. **Logs retention gating.** Backstop TTL, `DROP PARTITION` after confirmation, `lost` records and the alert metric, and the retention API guard and `force`.
3. **Traces.** The four tables, with `trace_summary` rebuilt on restore, the `timestamp_unix_nano` column, and the same scenarios.
4. **Metrics.** Raw and reduced tables, after verifying `inserted_at_unix_milli`. The rehydration source pins table selection, and the same scenarios apply.
5. **UI**, after the frontend freeze: archive status in the retention settings, the restoration list, and a source picker in the explorers.

## Consequences

- **Operators** define a named collection, using encrypted storage or the XML config, since named collections are plaintext on disk by default. They also add the multipart lifecycle rule to the bucket.
- **Storage.** ClickHouse keeps up to `backstop_days` beyond retention while the job is unhealthy.
- **The archive outlives FuseScope.** It is plain Parquet with self-describing manifests.
- **Schema changes.** A migration that renames or retypes an archived column needs a restore adapter.

## Open questions for maintainers

- The `backstop_days` default (7), and whether a signal may opt into a best-effort mode with no gating.
- Admin-only restoration, or a new permission that Editors can be granted.
- Whether restored traces need the services and topology pages in a later phase, which would mean rebuilding `top_level_operations` and `dependency_graph_minutes_v2`.
- An Iceberg catalog over the files, once ClickHouse writes are stable.

## Evidence

- **Migrator** v0.145.0, `cmd/signozschemamigrator/schema_migrator`:
  - `v2_squashed_logs_migration.go`: `logs_v2` partition key and `_retention_days`.
  - `traces_migrations.go`: `trace_summary` MV from `signoz_index_v3`, `created_at`.
  - `metrics_migrations.go` 1008: reduced tables; `samples_v4_mv … WHERE reduced_fingerprint = 0`.
  - `ttl_only_drop_parts` on the bulk tables.
- **Exporters** v0.145.0: `maxAllowedDataAgeDays` 15 for logs and traces; no age check for metrics.
- **Backend:**
  - `pkg/telemetryschema/metricstelemetryschema/const.go`: `WhichSamplesTableToUse`, `WhichTSTableToUse`.
  - `pkg/modules/tracedetail/impltracedetail/store.go`: `GetTraceBounds` on `trace_summary`.
  - `pkg/querier/builder_query.go`: `trace_id` window via `trace_summary`.
  - `pkg/query-service/app/clickhouseReader/reader.go`: `SetTTLV2`, `buildMultiIfExpression`.
  - Statement builders: org ID used only for flags and metadata.
- **ClickHouse 25.12.5, tested:**
  - `ttl_only_drop_parts` dropped only the fully expired part.
  - `s3()` refused existing keys, and `PARTITION BY` writes were per key.
  - Error and `KILL` aborted the multipart upload; SIGKILL left an incomplete one.
  - Parquet types as listed in Context.
  - DuckDB 1.5.6 read `JSON` correctly, truncated timestamps to microseconds and mis-read `UUID`.
- **ClickHouse docs:** the MergeTree TTL section, the `s3` table function, named collections and the Parquet format pages.
