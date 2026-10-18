# 0002 · Long-term archive to object storage

- Status: proposed
- Issue: [#11](https://github.com/fuseone-io/fusescope/issues/11)
- Deciders: FuseOne maintainers. Storage layout, retention semantics and schema span several PRs.

## Context

ClickHouse keeps hot and warm data and retention deletes it afterwards. Teams need older logs, traces and metrics for audits and incident reviews without keeping them in ClickHouse. The archive must be an open format readable without FuseScope, and slices of it must be loadable back for analysis.

Facts the design rests on. They were checked against the backend, migrator v0.145.0 (the version `go.mod` pins) and ClickHouse 25.12.5. Experiments E1–E5 are reproducible from [`0002-experiments/`](0002-experiments/).

- **Deletion is per part.** Bulk tables set `ttl_only_drop_parts=1`, so a part is dropped once all its rows are expired, during a TTL merge.
  - `merge_with_ttl_timeout` (4 h by default) is the *minimum* delay before repeating such a merge, not a bound on when deletion happens.
  - Expired rows stay queryable until their part is dropped.
- **Parts carry an ingestion order.** A part name is `<partition>_<min_block>_<max_block>_<level>`. Block numbers are allocated per partition, increasing, per shard (in Keeper for replicated tables). Parts are immutable.
  - **Merges** widen the block range of the part they produce (E5b).
  - **Late inserts** get new block numbers.
  - **In-progress inserts** commit later as their own parts, which may carry block numbers lower than parts already committed.
- **Partition-level operations are unsafe on replicas.** `MOVE PARTITION` and `DROP PARTITION` on a `ReplicatedMergeTree` remove the partition's whole block range. Issued on a replica that hasn't fetched a committed part, they destroyed that part on every replica (E4).
- **`DROP PART` by name is exact.** Issued on the same lagging replica, it removed only the named parts and left the unfetched one intact (E5).
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
| Data past retention is kept until archived, for at least `backstop_days` after insertion | The live TTL becomes ingestion-time based: `ingestion_column + retention + backstop` (§5) | The ingestion column exists and its clock is within minutes of real time | Tables without an ingestion column keep event-time TTL; late rows older than `retention + backstop` can expire before they are archived (§5, limitation) |
| Every loss is recorded | Every cycle stores a part inventory; a part that vanishes without being archived or merged into an archived part is marked `lost`, with its row count (§6) | The job ran at least once while the part existed | Parts created and expired between two runs leave no trace; only the job's downtime window is recorded |
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
  <signal>:
    enabled: true
    named_collection: <name>
    prefix: <path>
    backstop_days: 7
```

The API and UI show its status. Objects, manifests and state carry no organization. In a multi-org deployment, restored data is visible to every org that can query telemetry, like live telemetry today.

**Archiving happens when data leaves the hot store, at retention.** The earlier `after_days` (export before retention) is dropped. Recent partitions still merge, so part identity changes too often to archive them early.

### 2. Archive unit: one part

- **The cursor is the part itself:** `(table, shard, partition_id, min_block, max_block)`, plus its name and row count from `system.parts`. It is the same for every table, needs no ingestion column, and doesn't depend on clocks or commit order.
- **Every MergeTree table is archived this way,** including the resource tables and `signoz_error_index_v2`.
- **`trace_summary` is not archived.** It is rebuilt at restore from the restored spans, the same way its MV builds it.
- **Rollups and buffer tables are not archived:**
  - The `samples_v4_agg_*` and `time_series_v4_6hrs/1day/1week` rollups are reproducible from the raw tables.
  - The buffer tables hold only 25 h of data that has already flowed into the raw or reduced tables.

### 3. Export cycle

Each cycle, per table, per shard, for every partition whose days are past retention, at any age:

1. **Snapshot.** Read the active parts of the partition on every replica of the shard (`clusterAllReplicas(…, system.parts)`). Pick a replica that holds every part the others report. If none does, wait for replication, retry, and skip the partition this cycle if it is still incomplete.
2. **Select.** Candidates are the snapshot parts whose block range is not already contained in the published ranges of that shard and partition.
3. **Export.** The selected parts go out in one attempt, read on the chosen replica with `WHERE _part IN (<names>)`:
   - Objects are written to `…/table/shard=<n>/partition=<id>/attempt=<id>/<part-name>.parquet`, without the truncate setting, so a collision is an error.
   - The rows read back from each object must equal the part's `rows`. Parts are immutable, so this compares a stable set. If a part merges away during the read, the counts differ and the attempt is abandoned.
4. **Manifest.** A new key, never overwritten, lists for each part its name, range, rows, object key and size, plus the source columns and types and the migrator version.
5. **Commit.** One SQL transaction, fenced by the lease epoch:
   - The parts become `published` in `archive_part (table, shard, partition_id, min_block, max_block, part_name, rows, attempt_id, status)`.
   - Any published part whose range is contained in a newly published part becomes `superseded`. That happens when exported parts merged with later rows before being dropped.

**Related tables.** `logs_v2` with `logs_v2_resource`, and the trace tables, are exported in the same cycle but committed per table. Restores take only partitions that are complete in every table of the set (§7).

**Failures and leases** are handled as in the earlier revision:

- An unpublished attempt leaves orphan objects, which are collected after 24 h. The bucket needs a lifecycle rule for incomplete multipart uploads.
- A stale executor can't commit, and its queries are killed by `query_id`.

### 4. Deletion

After commit, the job drops the published parts that are still active, by name, with `ALTER TABLE <local> DROP PART '<name>'` on the shard. It drops a part only if its block range is contained in the union of published ranges.

- **A late insert between commit and drop** creates a new part with new block numbers. It isn't in the list, so it isn't dropped (E5), and the next cycle exports it.
- **A merge between commit and drop** that folds a published part together with an unexported one produces a wider range. That part isn't dropped; the next cycle exports it whole and marks the earlier part superseded.
- **A merge of published parts only** produces a range that is still covered, so it is dropped.
- **Losing the lease doesn't make deletion unsafe.** Drops only take parts that are already published, by anyone, so a stale executor that drops can only delete archived rows. The drop runs after the executor's own fenced commit has succeeded.
- **Prohibited:** `DROP PARTITION` and `MOVE PARTITION`, because of E4.

### 5. Retention backstop

When the archive is enabled for a signal, the backend rewrites the live TTL of its tables to `<ingestion column> + retention + backstop_days`. It keeps the delete expression shape the backend already issues (`SetTTL` / `SetTTLV2`), using `greatest` with the event-time expression so nothing expires earlier than today.

**Example:** retention 15 d, backstop 7 d, job down for 3 days. When it comes back, it exports and drops every partition past retention that is still present, including the days that are now 16–18 days old. They are covered because the TTL for them is ingestion time + 22 d.

**Limitation, until the schema dependency below lands.** `logs_v2_resource`, `traces_v3_resource` and `signoz_error_index_v2` have no ingestion column, so their TTL stays event-time + retention + backstop. A row for these tables that arrives already older than that can be dropped by TTL before a cycle sees it. It is recorded as lost only if an inventory saw it.

**Arrivals older than retention + backstop** in tables that do have an ingestion column are kept, because their TTL counts from insertion, and archived by the next cycle.

**Clocks.** For metrics, `inserted_at_unix_milli` comes from the collector's clock. A collector clock that is days off shifts that TTL accordingly. This is a stated premise.

### 6. Inventory, loss records and policy changes

**Inventory and loss.**

- Each cycle stores the snapshot from §3 in `archive_inventory`.
- A part from the previous inventory that is neither published, nor superseded, nor contained in a current part's range has disappeared. It is recorded as `lost`, with the rows it had.
- Job downtime is recorded as an interval. Loss inside that interval is reported as *possible*, never exact.
- An alert metric fires for `lost` parts, and for partitions past retention that still aren't archived after one backstop.

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

Unchanged from the earlier revision:

- `UUID` is exported as a string; `Dynamic` and `Variant` as `String`.
- `JSON` keeps the Parquet JSON type, with the custom encoder.
- `DateTime64(9)` stays nanosecond, plus `timestamp_unix_nano UInt64` for traces.
- DuckDB reads every exported table in the acceptance suite.
- Old segments are restored by explicit column mapping from their manifest. A migration that renames or retypes an archived column must ship a restore adapter, or restoring older segments fails as `incompatible`.

### 9. Restoration

As in the earlier revision, with these precisions:

- **Tables.** `rehydrated_<table>` tables, created by the migrator, have `PARTITION BY rehydration_id`, `TTL expires_at`, and the same engine family as the source. Replacing tables stay Replacing, with the same version column.
- **What is loaded.** Only maximal published parts are loaded (not superseded, and not contained in another published part's range), in block order, and only for partitions complete in every table of the signal's set.
  - `trace_summary` is rebuilt from the restored spans.
  - Metrics on a rehydration source use the raw and reduced tables for every range length, never the rollups.
- **Lifecycle.**
  - Retry, delete and expire use `DROP PARTITION <rehydration_id>`. That is safe there, because nothing else writes a restoration's partition.
  - Queries select one `rehydration_id`.
  - Creating or deleting a restoration requires Admin.

## Schema and ingestion dependencies

- **Migrator: `created_at` on tables without an ingestion column.** Add `created_at DateTime64(3) DEFAULT now64(3)` to `logs_v2_resource`, `traces_v3_resource` and `signoz_error_index_v2`. This closes the §5 limitation and must land before phase 2 claims it.
- **Migrator: `rehydrated_<table>` tables,** in phases 1, 3 and 4.
- **Collector: none required.** An age limit for metrics would only reduce how much late data the archive has to absorb.

## Phases and acceptance

Each phase is its own PR, tests first, with SQL state on SQLite and PostgreSQL.

1. **Logs, end to end, with deletion.** State tables, inventory, the export cycle, the backstop TTL, `DROP PART`, the rehydration tables and restore, the query source, and expiry and deletion.
2. **Logs resource-table hardening.** The migrator dependency and closing the §5 limitation.
3. **Traces:** the four tables, with `trace_summary` rebuilt.
4. **Metrics:** raw and reduced tables, Replacing semantics with `FINAL`, and table selection pinned for rehydration sources.
5. **UI**, after the frontend freeze.

**Executed.** E1–E5 in [`0002-experiments/`](0002-experiments/). These are single-shard experiments with no network delay, and their limitations are listed there.

**Planned acceptance tests** (integration, both stores, sharded and replicated ClickHouse):

1. A row committed after a snapshot, in the same partition, survives the drop and is archived next cycle.
2. An insert in flight during the snapshot, committing later with a lower block number, is archived next cycle.
3. A replica with stopped fetches is excluded from the snapshot, and its missing part is neither dropped nor lost.
4. A related resource table is exported and restored together with `logs_v2`, and a restore of an incomplete set is refused.
5. Job down for 3 days with retention 15 and backstop 7: days 16–18 are archived on return.
6. An arrival whose event time is older than retention + backstop:
   - kept and archived for `logs_v2`;
   - for resource tables, the documented limitation until phase 2.
7. A concurrent insert between commit and `DROP PART` is untouched.
8. Lease lost before the drop: the stale executor's commit fails, and its drop removes nothing unpublished.
9. A merge between commit and drop folding in a later part: no drop, then re-export with the earlier part superseded, and a restore without duplicates.
10. Several versions of one reduced bucket across segments, queried before merges: `FINAL` returns the latest, and ties go to the last inserted.
11. Overlapping restorations, retry, early deletion and expiry.
12. DuckDB reading every exported file.

## Open questions for maintainers

- The `backstop_days` default.
- Whether to accept the §5 limitation for resource tables in phase 1, or require the migrator change first.
- Admin-only restorations, or a grantable permission.
- Restored services and topology pages, which would need `top_level_operations` and the dependency graph.
- Archiving before retention, which needs a way to handle merge churn in recent partitions.
- Iceberg, once ClickHouse writes are stable.

## Evidence

- **Migrator** v0.145.0, `cmd/signozschemamigrator/schema_migrator`:
  - `logs_migrations.go`: `created_at` on `logs_v2`.
  - `traces_migrations.go`: `created_at` on `signoz_index_v3`; `trace_summary` MV.
  - `squashed_traces_migrations.go`: `signoz_error_index_v2` keyed on `timestamp`.
  - `metrics_migrations.go` 1008: reduced tables, `ReplacingMergeTree` with `computed_at DEFAULT now()`; `samples_v4_mv … reduced_fingerprint = 0`.
- **Exporters:**
  - `signozclickhousemetrics/exporter.go` writes `inserted_at_unix_milli`.
  - Logs and traces drop data older than 15 days.
- **Backend:**
  - `metricsstatementbuilder/statement_builder.go` reads the reduced tables with `FINAL`.
  - `WhichSamplesTableToUse` and `WhichTSTableToUse`.
  - `tracedetail` `GetTraceBounds` on `trace_summary`.
  - `SetTTL` / `SetTTLV2`.
- **ClickHouse:**
  - MergeTree TTL and settings (`ttl_only_drop_parts`, `merge_with_ttl_timeout`).
  - `ALTER … DROP PART` and partition manipulation.
  - The `s3` table function, named collections, the Parquet format.
  - E1–E5 (25.12.5.44).
