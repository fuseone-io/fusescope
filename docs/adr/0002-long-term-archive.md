# 0002 · Long-term archive to object storage

- Status: proposed
- Issue: [#11](https://github.com/fuseone-io/fusescope/issues/11)
- Deciders: FuseOne maintainers. Storage layout, retention semantics and schema span several PRs.

## Context

ClickHouse keeps hot and warm data and retention deletes it afterwards. Teams need older logs, traces and metrics for audits and incident reviews without keeping them in ClickHouse. The archive must be an open format readable without FuseScope, and slices of it must be loadable back for analysis.

Facts the design rests on. They were checked against the backend, migrator and exporters v0.145.0 (the schema-migrator version the integration CI runs; since ADR 0001 phase 4 the backend no longer pins the collector in `go.mod`) and ClickHouse 25.12.5. Experiments E1–E8 are reproducible from [`0002-experiments/`](0002-experiments/).

- **Deletion is per part.** Bulk tables set `ttl_only_drop_parts=1`, so a part is dropped once all its rows are expired, during a TTL merge.
  - `merge_with_ttl_timeout` (4 h by default) is the *minimum* delay before repeating such a merge, not a bound on when deletion happens.
  - Expired rows stay queryable until their part is dropped.
- **Parts carry an ingestion order.** A part name is `<partition>_<min_block>_<max_block>_<level>`. Block numbers are allocated per partition, increasing, per shard (in Keeper for replicated tables). Parts are immutable.
  - **Merges** widen the block range of the part they produce (E5b).
  - **Late inserts** get new block numbers.
  - **In-progress inserts** commit later as their own parts. E7b and E7c did not observe one committing with a lower block number than parts already committed, but the window isn't proven absent, so correctness rests only on block-range arithmetic (§3), not on that order.
- **`partition_id` is opaque.** With custom logs retention it is `YYYYMMDD-<retention>-<cold>`, not a day. The day comes from `system.parts.min_date`.
- **Partition-level operations are unsafe on replicas.** `MOVE PARTITION` and `DROP PARTITION` on a `ReplicatedMergeTree` remove the partition's whole block range. Issued on a replica that hasn't fetched a committed part, they destroyed that part on every replica (E4).
- **`DROP PART` by name is exact.** Issued on the same lagging replica, it removed only the named parts and left the unfetched one intact (E5). Concurrent inserts into the partition were untouched (E7a). Dropping a name a merge already replaced fails with `NO_SUCH_DATA_PART` and changes nothing (E7a2).
- **Reads through a Distributed table pick a replica.** `_part IN (…)` through `distributed_*` returned 107 or 100 rows depending on which replica answered (E8).
- **Rewriting TTL doesn't reach existing parts.** The backend issues `MODIFY TTL … SETTINGS materialize_ttl_after_modify = 0`. Existing parts keep their old TTL info and expire under the old rule (E6b, E6c). `MATERIALIZE TTL` with `materialize_ttl_recalculate_only = 1` recalculates the TTL info without rewriting data (E6d).
- **Two code paths write the live TTL.** The settings page and API (`SetTTL` / `SetTTLV2`), and the default-retention reconciler (`retention.default.*`, #143), which calls the same functions for any signal without a `ttl_setting` row. Each issues the whole TTL clause, so a later call replaces whatever TTL was there.
- **Logs retention can be per row.** With custom retention, `_retention_days` is part of the partition key of `logs_v2` and `logs_v2_resource`, so every partition has a single retention, which can differ from the global one. Cold-storage rules (`TO VOLUME`) move whole parts between disks without renaming them.
- **Two exporters insert without a column list.** The traces exporter writes `traces_v3_resource` and `signoz_error_index_v2` with a bare `INSERT INTO <table>`. A new `DEFAULT` column breaks those inserts; a `MATERIALIZED` column doesn't (E6e).
- **Late data is normal.**
  - Logs and traces exporters accept rows up to `maxAllowedDataAgeDays` old, 15 days by default, which equals the default retention.
  - Metrics have no age limit.
- **Ingestion-time columns per table:**

  | Table | Ingestion-time column | Origin |
  |---|---|---|
  | `logs_v2`, `signoz_index_v3` | `created_at DateTime64(3) DEFAULT now64(3)` | ClickHouse server clock, at insert |
  | `samples_v4`, `exp_hist`, `time_series_v4`, `time_series_v4_reduced` | `inserted_at_unix_milli` | set by the metrics exporter, so the collector's clock |
  | `samples_v4_reduced_last_60s`, `_sum_60s` | `computed_at DateTime DEFAULT now()` | refresh time of the reduction MV, one-second resolution |
  | `logs_v2_resource`, `traces_v3_resource`, `trace_summary`, `signoz_error_index_v2` | none | `seen_at_ts_bucket_start`, `end` and `timestamp` are event-time |

- **What each signal needs to be restored:**
  - **Logs:** `logs_v2` and `logs_v2_resource`.
  - **Traces:** `signoz_index_v3`, `traces_v3_resource` and `signoz_error_index_v2`, plus `trace_summary`, which trace detail and every `trace_id` filter read.
  - **Metrics:** `samples_v4`, `exp_hist` and `time_series_v4`, plus, when reduction is on, `samples_v4_reduced_last_60s`, `samples_v4_reduced_sum_60s` and `time_series_v4_reduced`. The reduced tables are needed because `samples_v4_mv` keeps only `reduced_fingerprint = 0`.
  - The querier picks rollups by range length, and live queries read the reduced tables with `FINAL`.
- **Telemetry has no organization column.**
- **Writing to S3.** An `s3()` insert refuses to overwrite an existing key unless truncate or new-file settings are set. Multipart uploads are visible only once complete, and a server crash leaves incomplete uploads behind.
- **Parquet.** `JSON` is written as the JSON logical type. `Dynamic` and `Variant` are rejected. `UUID` is written in ClickHouse byte order, which DuckDB misreads. `DateTime64(9)` is nanosecond in ClickHouse, but DuckDB truncates it to microseconds.

Constraints: no new imports from `fusescope-otel-collector` ([ADR 0001](0001-agpl-collector-dependency.md)), and every persisted state works on SQLite and PostgreSQL.

## Guarantees

| Guarantee | Mechanism | Premises | When a premise fails |
|---|---|---|---|
| A row is never deleted by the archive job unless it is in a published archive segment | The job deletes only with `DROP PART <name>` of parts whose block range is covered by published segments (§4) | Part names and block ranges behave as in E5; no table mutations rewrite parts in place | A mutated part (new name, same range) is treated as changed and re-exported before its drop |
| Late, in-progress and lagging-replica rows are archived in a later cycle | They live in parts with block ranges that no published segment covers (§3) | Block numbers are unique per shard and partition | None found in this design |
| Data past retention is kept until archived, for at least `backstop_days` after insertion | The live TTL becomes ingestion-time based: `ingestion_column + retention + backstop`, and `MATERIALIZE TTL` (recalculate only) applies it to existing parts. Every TTL writer goes through one builder that adds the backstop (§5) | The ingestion column exists and its clock is within minutes of real time | Tables without an ingestion column keep event-time TTL; late rows older than `retention + backstop` can expire before they are archived (§5, limitation) |
| Every loss is recorded | Every cycle stores a part inventory; a part that vanishes without being archived or merged into an archived part is marked `lost`, with its row count (§6) | The job ran at least once while the part existed | Parts created and expired between two runs leave no trace; only the job's downtime window is recorded |
| A restoration loads only what was committed | SQL state, not the bucket, says which objects to load and how; each object is checked against the size, ETag and row count recorded at commit (§9) | The metastore is not writable by whoever can write the bucket | A modified, partial or replaced object fails the restoration as `corrupt` |
| A restoration returns each archived row exactly once | Restores read only maximal published parts per shard and partition (§3); Replacing tables are read with `FINAL`, in block order (§7) | Same as row 1 | — |

No time margin is used as proof of completeness anywhere.

## Decisions

Kept from the earlier revision:

- Parquet, with data moving only inside ClickHouse.
- Credentials through named collections.
- Immutable objects per attempt, and manifests listing the exact objects.
- Publication as a SQL commit fenced by the lease epoch.
- Deployment scope.
- `rehydration_id` and `expires_at`.
- DuckDB validation.

### 1. Scope and policy

One policy per deployment, declared in the configuration file:

```yaml
archive:
  limits:                # every export and restore query
    concurrency: 1       # queries at once, cycle-wide
    max_memory_usage: 2GiB
    max_threads: 4       # also max_insert_threads on restore
    row_group_rows: 100000
  <signal>:
    enabled: true
    named_collection: <name>
    prefix: <path>
    backstop_days: 7      # 2–30, and at least twice the cycle interval
restore:
  max_bytes_per_restoration: 50GiB   # Editor ceiling, in archived (Parquet) bytes
  admin_override: true               # Admin may exceed it, with confirmation
  max_active_restorations: 3
  max_total_bytes: 25%               # of the measured hot store, or a fixed size
  default_ttl: 7d
  max_ttl: 30d
```

The API and UI show its status. Objects, manifests and state carry no organization. In a multi-org deployment, restored data is visible to every org that can query telemetry, like live telemetry today.

**Archiving happens when data leaves the hot store, at retention.** The earlier `after_days` (export before retention) is dropped. Recent partitions still merge, so part identity changes too often to archive them early. This follows the tiered model of Splunk and Elastic, the products that guarantee nothing is deleted before it is archived. Deployments that need a durable copy from ingestion on (compliance) get it from the pipeline, with a fan-out exporter in the collector, as Datadog and Honeycomb do; that is outside this ADR.

### 2. Archive unit: one part

- **The cursor is the part itself:** `(table, shard, partition_id, min_block, max_block)`, plus its name and row count from `system.parts`. It is the same for every table, needs no ingestion column, and doesn't depend on clocks or commit order.
- **Every MergeTree table is archived this way,** including the resource tables and `signoz_error_index_v2`.
- **`trace_summary` is not archived.** It is rebuilt at restore from the restored spans, the same way its MV builds it.
- **Rollups and buffer tables are not archived:**
  - The `samples_v4_agg_*` and `time_series_v4_6hrs/1day/1week` rollups are reproducible from the raw tables.
  - The buffer tables hold only 25 h of data that has already flowed into the raw or reduced tables.

### 3. Export cycle

Each cycle, per table, per shard, for every partition whose days are past its retention, at any age. For logs with custom retention, a partition's retention is its own `_retention_days`, read from its rows by `_partition_id`, not the global one.

1. **Snapshot.** Read the active parts of the partition on every replica of the shard (`clusterAllReplicas(…, system.parts)`). Pick a replica whose active parts' block ranges cover the union of the ranges reported by all replicas. Coverage is by range, not by name: during a merge one replica can hold `1_5_1` while another still has `1_3_0` and `4_5_0`. If no replica covers the union, wait for replication, retry, and skip the partition this cycle if it is still not covered. Partitions are selected by `min_date` past retention, never by parsing `partition_id`.
2. **Select.** Candidates are the snapshot parts whose block range is not already contained in the published ranges of that shard and partition.
3. **Export.** The selected parts go out in one attempt, read on the chosen replica with `WHERE _part IN (<names>)`. The job connects directly to that replica (host and port from `system.clusters`) with `use_hedged_requests = 0`, and runs the `INSERT INTO FUNCTION s3(…) SELECT` there. It never reads through `distributed_*` (E8). The backend therefore needs network access and credentials to every replica, on the secure port with TLS when the cluster uses it; the chart and external-ClickHouse docs say so.
   - Objects are written to `…/<table>/day=YYYY-MM-DD/shard=<n>/partition=<id>/attempt=<id>/<part-name>.parquet` (Hive-style, `day` from `min_date`), without the truncate setting, so a collision is an error. Every file also carries `_shard` and `_part` columns, so external engines don't depend on the path.
   - The rows read back from each object must equal the part's `rows`. Parts are immutable, so this compares a stable set. If a part merges away during the read, the counts differ and the attempt is abandoned.
4. **Manifest.** A new key, never overwritten, lists for each part its name, range, rows, object key, size and ETag, plus the source columns and types, the column mapping, the `format_version` and the migrator version. It is for external readers; restores don't trust it (§9).
5. **Commit.** One SQL transaction, fenced by the lease epoch:
   - The parts become `published` in `archive_part (table, shard, partition_id, min_block, max_block, part_name, rows, object_key, bytes, etag, attempt_id, status)`.
   - The attempt's column mapping, `format_version` and the manifest's SHA-256 are stored in `archive_attempt`.
   - Any published part whose range is contained in a newly published part becomes `superseded`. That happens when exported parts merged with later rows before being dropped.

**Load on ClickHouse.** Small installs have run out of memory before, so every export runs with the `archive.limits` settings (`max_memory_usage`, `max_threads`, `output_format_parquet_row_group_size`), one partition per query, and at most `concurrency` archive queries at a time across the cycle. Restores insert under the same limits.

**Related tables.** `logs_v2` with `logs_v2_resource`, and the trace tables, are exported in the same cycle but committed per table. Restores take only partitions that are complete in every table of the set (§7).

**Failures and leases** are handled as in the earlier revision:

- An unpublished attempt leaves orphan objects, which are collected after 24 h. The bucket needs a lifecycle rule for incomplete multipart uploads.
- Objects are never overwritten, so the archive works on buckets with S3 Object Lock (WORM), unlike Datadog's archive retries or Splunk DDSS. On such buckets, failing to delete an orphan is logged, not treated as an error.
- A stale executor can't commit, and its queries are killed by `query_id`.

### 4. Deletion

After commit, the job drops the published parts that are still active, by name, with `ALTER TABLE <local> DROP PART '<name>'` on the shard. It drops a part only if its block range is contained in the union of published ranges.

- **A late insert between commit and drop** creates a new part with new block numbers. It isn't in the list, so it isn't dropped (E5), and the next cycle exports it.
- **A merge between commit and drop** that folds a published part together with an unexported one produces a wider range. That part isn't dropped; the next cycle exports it whole and marks the earlier part superseded.
- **A merge of published parts only** produces a range that is still covered, so it is dropped.
- **Losing the lease doesn't make deletion unsafe.** Drops only take parts that are already published, by anyone, so a stale executor that drops can only delete archived rows. The drop runs after the executor's own fenced commit has succeeded.
- **A name that no longer exists** (`NO_SUCH_DATA_PART`, E7a2) means the snapshot changed. The cycle takes a new snapshot; it isn't an error.
- **Prohibited:** `DROP PARTITION` and `MOVE PARTITION`, because of E4.

### 5. Retention backstop

When the archive is enabled for a signal, the backend rewrites the live TTL of its tables to `<ingestion column> + retention + backstop_days`. It keeps the delete expression shape the backend already issues (`SetTTL` / `SetTTLV2`), using `greatest` with the event-time expression so nothing expires earlier than today. It then runs `MATERIALIZE TTL` with `materialize_ttl_recalculate_only = 1` on every table of the signal; without it, parts that already exist would still expire under the old TTL (E6c). Existing parts get `created_at = now` for TTL purposes, so their life is extended until the job archives and drops them.

The backend uses an ingestion column only after finding it in `system.columns`, as it already does for `_retention_days`.

**One TTL builder.** The retention module has a single function that builds a table's TTL clause. While the archive is enabled for the signal, it always includes `ingestion column + retention + backstop`, with any active automatic extension, plus the existing cold-storage (`TO VOLUME`) rules. Every writer goes through it: the settings page and API, the default-retention reconciler, archive enable and disable, and the automatic extension. Without that, a retention change made after enabling would reissue the plain event-time TTL and remove the backstop. Enabling also records a `ttl_setting` row, so the reconciler sees the signal as configured.

**`MATERIALIZE TTL` load.** It is one background mutation per part, on every table of the signal. On enable, the backend runs it one table at a time, waits for the mutation in `system.mutations` before the next, and on large stores the operator can schedule the enable.

**Example:** retention 15 d, backstop 7 d, job down for 3 days. When it comes back, it exports and drops every partition past retention that is still present, including the days that are now 16–18 days old. They are covered because the TTL for them is ingestion time + 22 d.

**Limitation, until the schema dependency below lands.** `logs_v2_resource`, `traces_v3_resource` and `signoz_error_index_v2` have no ingestion column, so their TTL stays event-time + retention + backstop. A row for these tables that arrives already older than that can be dropped by TTL before a cycle sees it. It is recorded as lost only if an inventory saw it.

How likely: logs and traces exporters drop rows older than `max_allowed_data_age_days` (15 by default). While that is at most retention + backstop, such an arrival can't happen; it becomes possible only if an operator raises the exporter limit or lowers retention below it minus the backstop. When it happens, the main row survives (its table has an ingestion column) and only the resource row is missing. Restores rebuild missing resource rows of logs and traces from the main table's `resource_fingerprint` and `resources_string` (labels as sorted JSON, matching what the resource filter reads); error-index rows can't be rebuilt, since their IDs are computed by the exporter.

**Arrivals older than retention + backstop** in tables that do have an ingestion column are kept, because their TTL counts from insertion, and archived by the next cycle.

**Clocks.** For metrics, `inserted_at_unix_milli` comes from the collector's clock. A collector clock that is days off shifts that TTL accordingly. This is a stated premise.

**Automatic extension while archiving fails.** ClickHouse can't wait for an archive before deleting, as Elastic's `wait_for_snapshot` and Splunk's frozen step do, so the backstop emulates it.

- When the *critical* alert fires (a partition past retention and unarchived for half the backstop), the backend re-applies the TTL with a larger backstop, recalculate-only as above, in steps up to 30 days.
- At 30 days, only `force` or more disk remain. The cap exists because self-hosted disks are finite. Splunk warns that blocking without a cap eventually fills the disk.
- The extension is recorded and reverted to the configured backstop once the backlog is archived.

**Operator rule.** Keep `max_allowed_data_age_days` of the logs and traces exporters at most retention + backstop. The §5 limitation can only occur when that rule is broken.

### 6. Inventory, loss records and policy changes

**Inventory and loss.**

- Each cycle stores the snapshot from §3 in `archive_inventory`.
- A part from the previous inventory that is neither published, nor superseded, nor contained in a current part's range has disappeared. It is recorded as `lost`, with the rows it had.
- Job downtime is recorded as an interval. Loss inside that interval is reported as *possible*, never exact.
- Alerts: *warning* when a partition has been past retention and unarchived for one day, *critical* at half the backstop, and an immediate alert for `lost` parts.
- A metric counts rows inserted per cycle into partitions already past retention + backstop, for every archived table. For the resource tables it uses the main table's timestamp.
- The policy status shows **TTL extended** while §5's automatic extension is active, with the current backstop.
- The policy status and the retention settings say that live queries can return data older than retention until it is archived and dropped: up to retention + backstop, longer while extended. Otherwise "I set 7 days and see 12" becomes a support question.

**Policy changes.**

- **Enable:** apply the backstop TTL before the first cycle.
- **Lower retention:** more partitions become eligible for archiving, but nothing is deleted without being archived.
- **Raise retention:** nothing changes.
- **Disable:** refused while partitions past retention are unarchived, unless `force` is set. `force` restores the event-time TTL and records those partitions' inventoried parts as `lost`.
- **Change destination:** new segments go to the new destination. Existing manifests keep their own collection and prefix.

### 7. Reduced metrics and other Replacing tables

- **Physical rows vs logical rows.** Archived parts are physically disjoint, but tables using `ReplacingMergeTree` hold several physical rows per logical row until merges run:
  - `samples_v4_reduced_*`, `time_series_v4`, `time_series_v4_reduced` and the resource tables.
- **Reduced samples.** The logical key is the sorting key, `(env, temporality, metric_name, reduced_fingerprint, unix_milli)`, and the version is `computed_at`.
  - **Ties** (equal `computed_at`, at one-second resolution) go to the last inserted row (E3).
  - A bucket recomputed after its partition was archived lands in a later part and segment.
- **Restore order.** Restores load the parts of a shard and partition in block order, so "last inserted" means the same as in the source.
- **Queries before merges.** Restored Replacing tables are queried with `FINAL`, as the live querier already does for reduced samples, so results are correct before merges.
- **Revised statement.** The earlier "disjoint windows, so no duplicates" holds only for physical rows. Logical versions are resolved by version and block order.

### 8. Format contract

Exported files follow a type contract compatible with Iceberg v2, fixed before phase 1, because it can't change for files already written. No Iceberg metadata is written yet. Only Grafana Tempo publishes an open, typed Parquet schema; this follows it and the limits of ClickHouse's Iceberg writer.

| ClickHouse type | Exported as | Note |
|---|---|---|
| `UInt8/16/32` | `Int32` / `Int64` | lossless widening |
| `UInt64` | `Int64` | bit reinterpretation for hashes and IDs (`fingerprint`), `toInt64` for measures (`duration_nano`); the rule is recorded per column in the manifest so restores undo it |
| `FixedString`, `LowCardinality`, `Enum` | `String` | |
| `Bool` | `BOOLEAN` | the restriction is in ClickHouse's Iceberg writer, not the spec |
| `UUID` | `String` | DuckDB misreads ClickHouse's byte order |
| `Dynamic`, `Variant` | `String` | rejected by the Parquet writer |
| `JSON` | string with the Parquet JSON logical type | candidate for `variant` in Iceberg v3; custom encoder required |
| `DateTime64(9)` | `TIMESTAMP(NANOS)` plus a `*_unix_nano Int64` column | the `Int64` column is the portable one in Iceberg v2 |
| `Map(String, String)` | Parquet `MAP` | |

- **Format version.** Manifests carry a `format_version`. Release N restores segments written by format versions N and N-1, as Tempo keeps reading the previous block version. Older segments need a restore adapter, or fail as `incompatible`.
- **Old schemas.** Segments are restored by the explicit column mapping stored in SQL at commit (§3), not by the manifest's copy. A migration that renames or retypes an archived column must ship a restore adapter.
- **External readers** read through manifests, never by listing raw prefixes, because superseded objects (§3) stay in the bucket and duplicate rows. Each commit writes a new immutable index key per table listing the active objects, which the reader takes from the highest commit; a later Iceberg table can replace it. Superseded objects are deleted after `gc_superseded_days` (default 30) on buckets without Object Lock, and kept on WORM buckets.
- **Acceptance.** DuckDB and pyarrow (or Trino) read every exported table with the types above.

### 9. Restoration

As in the earlier revision, with these precisions:

- **Tables.** `rehydrated_<table>` tables have the live table's columns plus `rehydration_id` and `expires_at`, `PARTITION BY rehydration_id`, `TTL expires_at`, and the same engine family. Replacing tables stay Replacing, with the same version column.
  - **The backend creates them** (`CREATE TABLE IF NOT EXISTS … ON CLUSTER`). It derives the DDL from the live table's `system.tables.create_table_query`, so codecs, sorting key, settings and engine family carry over, then replaces partitioning and TTL and drops skip indexes and projections that don't apply. Before each restoration it adds any column the live table gained (`ADD COLUMN`, metadata only). The effective DDL is recorded in SQL per restoration.
  - Restoration tables are a read model of the query path, like Elastic's separate `restored-*` indices, and the reader adapts to the archive's version, as Loki and Tempo do. Owning them in the backend avoids a collector (AGPL) release for every schema change. It is an exception to the CLAUDE.md rule that the migrator owns the telemetry schema, recorded there if accepted, with these bounds:
    - The backend creates and drops only `rehydrated_*` tables. It never changes the columns of live tables; its existing writes to them stay limited to TTL and the `_retention_days` defaults.
    - Replicated restoration tables get a Keeper path unique per table, and are dropped with `DROP TABLE … SYNC` so no Keeper metadata is left behind.
    - The derivation keeps an explicit allowlist of clauses (columns with codecs, engine, `ORDER BY`, `PRIMARY KEY`, settings) and rebuilds the rest, rather than editing the DDL string. Projections, skip indexes and the live TTL are thus left out. Golden tests pin the result for every live table.
    - A guard in the one function that issues restoration DDL refuses any `CREATE` or `DROP` whose table name doesn't match `^rehydrated_`.
    - Restoration inputs (time range, `rehydration_id`) go through `pkg/clickhousesql` like every other identifier and literal.
  - **Privileges.** The default chart connects as `admin`, which can create tables. With an external ClickHouse, the operator must grant `CREATE TABLE` and `DROP TABLE` on the restoration tables. Without the grant, restorations are unavailable with an explicit error, and archiving still works.
- **Source of truth.** Restores read `archive_part` and `archive_attempt`, not the bucket manifest. Before loading, each object's size and ETag, or its row count from the Parquet footer, are compared with the commit. Any difference, or a manifest whose hash no longer matches, fails the restoration as `corrupt` instead of loading wrong data. This covers an object or manifest edited by anyone with bucket write access, and a partial or replaced object on a bucket without Object Lock.
- **What is loaded.** Only maximal published parts are loaded (not superseded, and not contained in another published part's range), in block order, and only for partitions complete in every table of the signal's set.
  - `trace_summary` is rebuilt from the restored spans.
  - Metrics on a rehydration source use the raw and reduced tables for every range length, never the rollups.
- **Lifecycle.**
  - Retry, delete and expire use `DROP PARTITION <rehydration_id>`. That is safe there, because nothing else writes a restoration's partition.
  - Queries select one `rehydration_id`.
  - **Authorization** uses two new kinds in the managed-role registry, mirroring Datadog's three log-archive permissions. Custom roles (#14) can later grant them.
    - `archive`: every role reads the status; enable, disable and `force` are Admin only.
    - `restoration`: Viewers read; Editors create and delete within the limits; Admins can exceed them and change the defaults.
  - **Limits** (`restore:` in §1), checked before a restoration starts. The manifest gives the exact archived bytes, rows and partitions of the requested range, so the "estimate" Datadog and Splunk offer is exact and free here. The API and UI show it, with the remaining budget, and refuse above the ceiling. Limits are in archived bytes rather than events, because the cost is the deployment's own disk, CPU and bucket egress.
  - Traces on a rehydration source don't support `isEntryPoint` or the services and topology pages, which read `top_level_operations` and `dependency_graph_minutes_v2`; such queries return an explicit error, never an empty result. No product regenerates derived data from restored events: Datadog, Tempo and Elastic compute it only at ingestion.
  - **Later**, two options, both outside phases 1–4:
    - derive RED metrics and topology at query time from `rehydrated_signoz_index_v3`, as ClickStack builds its service map from parent and child spans;
    - give the small live aggregates (`top_level_operations`, `dependency_graph_minutes_v2`, the metrics rollups) a longer retention than raw data, as Elastic (390 days) and Datadog (15 months) do. That would be its own ADR.

### 10. Archive lifecycle, erasure and transport

- **How long archives are kept** is the bucket's lifecycle rule (or Object Lock retention), set by the operator. The job never expires archived segments.
- **Data-subject erasure** (GDPR, LGPD) is out of scope. Erasing rows means rewriting the affected segments and their SQL state; on a bucket in Object Lock compliance mode it is impossible until the retention ends. Deployments that need it should not use compliance mode for these prefixes.
- **Encryption at rest** is the bucket's default encryption (SSE-S3 or SSE-KMS). **In transit**, the named collection's endpoint must be `https`; the backend refuses to enable a policy on a plain `http` endpoint unless `allow_insecure_endpoint` is set.

## Schema and ingestion dependencies

- **Migrator: `created_at` on tables without an ingestion column.** Add `created_at DateTime64(3) MATERIALIZED now64(3)` (not `DEFAULT`, because of the bare inserts, E6e) to `logs_v2_resource`, `traces_v3_resource` and `signoz_error_index_v2`. Metadata-only `ADD COLUMN` (E6a); deduplication of the Replacing resource tables is unaffected (E6f). `MATERIALIZED` columns are left out of `SELECT *`, so exports list columns explicitly (they already do, from the manifest). This closes the §5 limitation in phase 2.
- **Rehydration tables:** created by the backend (§9). CLAUDE.md records the exception.
- **Collector, phase 4:** `max_allowed_data_age_days` for the metrics exporter.
  - Default 30, the default metrics retention (`samples_v4` TTL `unix_milli + 2592000 s`). This follows the same rule as logs and traces, `max_allowed_data_age_days ≤ retention + backstop`; a 15-day default would drop points the store still keeps.
  - Points older than the limit are dropped and counted in the collector's own metrics, and points more than 10 minutes in the future are rejected. `0` disables the limit, for imports of historical data.
  - Today, points older than 30 days are already accepted and then deleted silently at the next TTL merge, so below the default nothing changes; above it the loss becomes explicit and counted.
  - Hosted metric backends accept hours (Mimir, Datadog, Chronosphere, 0–2 h by default). ClickHouse has no head block, so days are affordable.
  - The real cost of very old points is drift in computed rollups and archive churn: every late point creates a new part in an archived partition.
  - This is a collector change, not a backend import, so it is compatible with ADR 0001. The §6 metric calibrates it.

## Phases and acceptance

Each phase is its own PR, tests first, with SQL state on SQLite and PostgreSQL.

1. **Logs, end to end, with deletion.** State tables, inventory, the export cycle, the backstop TTL, `DROP PART`, the rehydration tables and restore, the query source, and expiry and deletion.
2. **Resource-table hardening.** The `MATERIALIZED created_at` migrator change and closing the §5 limitation; until then, phase 1 relies on the rebuild of missing resource rows.
3. **Traces:** the four tables, with `trace_summary` rebuilt.
4. **Metrics:** raw and reduced tables, Replacing semantics with `FINAL`, and table selection pinned for rehydration sources.
5. **UI**, after the frontend freeze.

**Executed.** E1–E8 in [`0002-experiments/`](0002-experiments/): single-shard experiments with no network delay; E8 uses two containers. Their limitations are listed there.

**Planned acceptance tests** (integration, both stores, sharded and replicated ClickHouse):

1. A row committed after a snapshot, in the same partition, survives the drop and is archived next cycle.
2. An insert in flight during the snapshot, committing later with a lower block number, is archived next cycle.
3. A replica with stopped fetches is excluded from the snapshot, and its missing part is neither dropped nor lost.
4. A related resource table is exported and restored together with `logs_v2`, and a restore of an incomplete set is refused.
5. Job down for 3 days with retention 15 and backstop 7: days 16–18 are archived on return. Job down for longer than half the backstop: the TTL is extended automatically and reverted after catching up.
6. An arrival whose event time is older than retention + backstop:
   - kept and archived for `logs_v2`;
   - for resource tables, the documented limitation until phase 2.
7. A concurrent insert between commit and `DROP PART` is untouched.
8. Lease lost before the drop: the stale executor's commit fails, and its drop removes nothing unpublished.
9. A merge between commit and drop folding in a later part: no drop, then re-export with the earlier part superseded, and a restore without duplicates.
10. Several versions of one reduced bucket across segments, queried before merges: `FINAL` returns the latest, and ties go to the last inserted.
11. Overlapping restorations, retry, early deletion and expiry.
12. DuckDB and pyarrow (or Trino) reading every exported file with the §8 types.
13. Enable with parts that already exist under the old TTL: nothing is deleted before it is archived (E6c).
14. The live table gains a column between two restorations: the second restoration works.
15. A `DROP PART` on a merged-away name leads to a new snapshot, not a failure.
16. The export of a lagging-replica partition reads the chosen replica directly and matches the snapshot's row counts.
17. A rehydrated trace query using `isEntryPoint` returns an explicit error.
18. Unit tests for the block-range coverage logic, including a part with a lower block number that appears after a higher one was published.
19. A restoration above the Editor ceiling is refused, shows the exact size, and an Admin can override it; the global budget and the concurrency limit are enforced.
20. A bucket with Object Lock: exports succeed, and orphan cleanup failures are logged without failing the cycle.
21. Phase 4: metrics older than `max_allowed_data_age_days` are dropped by the exporter and counted; with `0` they are accepted.
22. Restorations against an external ClickHouse user without `CREATE TABLE` fail with an explicit error, and archiving continues.
23. Archive enabled, then retention changed in the UI, then the reconciler and the automatic extension run: the backstop is still in `create_table_query`, and in existing parts after `MATERIALIZE TTL` (recalculate only).
24. An archived object replaced or truncated in the bucket, or a manifest edited: the restoration fails as `corrupt` and loads nothing.
25. Two replicas holding the same rows in differently named parts (one merged, one not): the snapshot picks a replica by range coverage and the partition is exported.
26. Logs with custom retention: partitions are selected by their own `_retention_days`; parts moved to the cold volume are exported and dropped.
27. Export and restore queries carry the `archive.limits` settings (checked in `system.query_log`), and no more than `concurrency` run at once.

## For the team to confirm

The decisions below are proposed from the market review in "Market references". Each one is reflected in the sections cited.

1. **The backend owns the `rehydrated_*` DDL** (§9), within the bounds listed there. It is an exception to CLAUDE.md's schema rule, and needs an update to CLAUDE.md. External ClickHouse installs need a `CREATE`/`DROP TABLE` grant for restorations.
2. **The Iceberg-v2-compatible type contract**, fixed before phase 1 (§8).
3. **Restoration limits in archived bytes,** with an Editor ceiling, Admin override, global budget, concurrency and TTL limits (§1, §9).
4. **`backstop_days` default 7 (2–30)**, with automatic extension up to 30 days while archiving fails (§5, §6).
5. **The resource-table limitation accepted in phase 1** with the rebuild fallback, closed in phase 2, plus the operator rule (§5).
6. **Services and topology out of scope** on restored traces; later, query-time derivation or longer retention for live aggregates in their own ADR (§9).
7. **Archiving at retention;** compliance copies via the pipeline; Object Lock compatible (§1, §3).
8. **Dropping metrics older than the metrics retention (default 30 days)** in the exporter, phase 4, configurable, with `0` disabling it for historical imports. It is a behaviour change for users who send old points, and needs a release note.
9. **Superseded objects:** an active-object index per commit for external readers, and their deletion after 30 days except on Object Lock buckets (§8).
10. **Archive expiry by bucket lifecycle, and erasure out of scope** (§10).

## Evidence

- **Migrator** v0.145.0, `cmd/signozschemamigrator/schema_migrator`:
  - `logs_migrations.go`: `created_at` on `logs_v2`.
  - `traces_migrations.go`: `created_at` on `signoz_index_v3`; `trace_summary` MV.
  - `squashed_traces_migrations.go`: `signoz_error_index_v2` keyed on `timestamp`.
  - `metrics_migrations.go` 1008: reduced tables, `ReplacingMergeTree` with `computed_at DEFAULT now()`; `samples_v4_mv … reduced_fingerprint = 0`.
- **Exporters:**
  - `signozclickhousemetrics/exporter.go` writes `inserted_at_unix_milli`.
  - Logs and traces drop data older than 15 days.
  - `clickhousetracesexporter/writer.go`: bare `INSERT INTO` for `signoz_error_index_v2` and `traces_v3_resource`.
- **Backend:**
  - `metricsstatementbuilder/statement_builder.go` reads the reduced tables with `FINAL`.
  - `WhichSamplesTableToUse` and `WhichTSTableToUse`.
  - `tracedetail` `GetTraceBounds` on `trace_summary`.
  - `SetTTL` / `SetTTLV2`, issuing `MODIFY TTL … materialize_ttl_after_modify = 0` in `clickhouseReader/reader.go`.
  - `implretention/defaults.go` and `clickhouseReader/retention_defaults.go`: the reconciler calls `SetTTL` / `SetTTLV2` when `HasTTLSetting` is false.
  - `SetTTLV2`: `_retention_days` in the logs TTL and `TO VOLUME` cold-storage rules.
  - `pkg/authz` and the managed-role registry for the new kinds.
- **ClickHouse:**
  - MergeTree TTL and settings (`ttl_only_drop_parts`, `merge_with_ttl_timeout`).
  - `ALTER … DROP PART` and partition manipulation.
  - The `s3` table function, named collections, the Parquet format.
  - E1–E8 (25.12.5.44).

## Market references

Public documentation consulted on 2026-10-24 for the decisions above (marketing pages used only for context).

- **Restoration and schema:**
  - Datadog: [rehydrating from archives](https://docs.datadoghq.com/logs/log_configuration/rehydrating/), [log archives](https://docs.datadoghq.com/logs/log_configuration/archives/).
  - Elastic: [searchable snapshots](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/searchable-snapshots), [reading older indices](https://www.elastic.co/docs/deploy-manage/upgrade/deployment-or-cluster/reading-indices-from-older-elasticsearch-versions).
  - Loki: [schema config](https://grafana.com/docs/loki/latest/operations/storage/schema/). Tempo: [Parquet blocks](https://grafana.com/docs/tempo/latest/configuration/parquet/), [Parquet schema](https://grafana.com/docs/tempo/latest/operations/schema/).
- **Types:**
  - ClickHouse [Iceberg engine limits](https://clickhouse.com/docs/engines/table-engines/integrations/iceberg) and [Parquet mapping](https://clickhouse.com/docs/interfaces/formats/Parquet).
  - [Iceberg spec](https://iceberg.apache.org/spec/).
  - Splunk [Federated Search for S3](https://help.splunk.com/en/splunk-cloud-platform/search/federated-search/10.4.2604/run-federated-searches-over-amazon-s3-datasets).
- **Restoration limits:**
  - Datadog [log-management permissions](https://docs.datadoghq.com/account_management/rbac/permissions/#log-management) and [maximum scan size](https://docs.datadoghq.com/logs/log_configuration/archives/#define-maximum-scan-size).
  - Splunk [DDAA](https://help.splunk.com/en/splunk-cloud-platform/administer/admin-manual/10.1.2507/manage-your-indexes-and-data-in-splunk-cloud-platform/store-expired-splunk-cloud-platform-data-in-a-splunk-managed-archive).
  - Loki [query limits](https://grafana.com/docs/loki/latest/configure/).
- **No deletion before archive:**
  - Elastic [`wait_for_snapshot`](https://www.elastic.co/docs/reference/elasticsearch/index-lifecycle-actions/ilm-wait-for-snapshot).
  - Splunk [`coldToFrozenScript`](https://docs.splunk.com/Documentation/Splunk/latest/Admin/Indexesconf).
  - Loki [retention delete delay](https://grafana.com/docs/loki/latest/operations/storage/retention/).
- **Late data:**
  - Datadog [log collection](https://docs.datadoghq.com/logs/log_collection/) (18 h).
  - Honeycomb [retention by ingestion](https://docs.honeycomb.io/get-started/manage-costs/how-honeycomb-calculates-usage.md).
  - Elastic [ILM](https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management/index-lifecycle).
- **Derived data:**
  - Datadog [trace metrics](https://docs.datadoghq.com/tracing/metrics/).
  - Elastic [APM data retention](https://www.elastic.co/docs/solutions/observability/apm/index-lifecycle-management).
  - ClickStack [service maps](https://clickhouse.com/docs/clickstack/service-maps.md).
- **Archive point and WORM:**
  - [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).
  - Loki and Tempo [architecture](https://grafana.com/docs/loki/latest/get-started/architecture/).
- **Late metrics:**
  - Mimir [runbooks](https://grafana.com/docs/mimir/latest/manage/mimir-runbooks/).
  - Datadog [historical metrics](https://docs.datadoghq.com/metrics/custom_metrics/historical_metrics/).
  - Chronosphere [metric limits](https://docs.chronosphere.io/administer/limits-licensing/limits/metric-limits).
  - VictoriaMetrics [`-maxBackfillAge`](https://docs.victoriametrics.com/victoriametrics/single-server-victoriametrics/).
