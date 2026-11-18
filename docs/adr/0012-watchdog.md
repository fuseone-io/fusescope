# 0012 · Watchdog: zero-configuration service anomaly detection

- Status: proposed (2026-11-17)
- Issue: [#244](https://github.com/fuseone-io/fusescope/issues/244), phase 2
- Deciders: FuseOne maintainers. The detector runtime, metastore schema, alert routing,
  API, MCP contract and service UI span several PRs and repositories.
- Related: [ADR 0002](0002-long-term-archive.md) (the first SQL lease),
  [ADR 0006](0006-synthetic-monitoring.md) (the shared lease promised there), and
  anomaly alerts in v0.166.0.

## Context

Anomaly alert rules shipped in v0.166.0. They score a user-selected metric against
seasonal baselines, but somebody still has to choose every signal and write every
rule. FuseScope needs a zero-configuration path that continuously looks for service
problems and surfaces them where a user already investigates services.

Code was read on `main` at `2f5775806` (v0.166.0) on 2026-11-17.

### What exists

- **Service RED data.** The Services module builds query-builder v5 trace queries
  over `signoz_index_v3`, scoped to `isRoot OR isEntryPoint`, grouped by
  `service.name`, and aggregates `p99(duration_nano)`, `count()` and
  `countIf(status_code = 2)`. `use_span_metrics` is disabled by default, so
  Watchdog reads traces, not span metrics.
- **A signal-independent scorer.** `anomaly.Score` predicts each timestamp with the
  median of its seasonal peers and scales residuals by `1.4826 × MAD`. Scores
  saturate at ±100. A prediction needs two matching seasons and a series needs ten
  valid residuals. It iterates only the series present in the current window: a
  series absent from the current window is never scored.
- **A bounded evaluator.** `anomalyquerier.Evaluator` shares a process-wide
  semaphore and enforces `max_series` per window and `max_points` in total. Its
  public `Evaluate` discovers a target through `anomaly.FindTarget`, which accepts
  only a metrics builder with one aggregation.
- **Exception groups.** `distributed_signoz_error_index_v2` groups exceptions by
  `groupID = md5(service || type || message)`, keeps 15 days by default, and
  `ListErrors` already returns `min(timestamp)` and `max(timestamp)` per group.
- **Background-service conventions.** Long-running work implements
  `factory.Service`, owns a ticker and stop context, and enumerates the
  organizations returned by `organization.Getter.ListByOwnedKeyRange`. The early
  return in `pkg/query-service/rules/manager.go` is a counterexample: one empty
  organization must not stop later organizations.
- **A lease-shaped precedent.** Migration 142 created `archive_lease`. The generic
  `runUnderLease` is not on `main`; ADR 0006 says it must become a shared package.
- **Alert delivery.** `alertmanager.PutAlerts` accepts generated alerts and
  `SetNotificationConfig` routes a stable `ruleId` through organization policies
  with `UsePolicy`.
- **UI building blocks.** Services and the service overview use the shadcn/Tailwind
  stack. `StatusBadge`, `SideSheet` and the anomaly-series helpers exist. The uPlot
  anomaly band is private to `AnomalyAlertEvaluationView`.

### Prior art and clean-room boundary

Only public product documentation and statistical literature inform this design:

- Datadog documents Watchdog as requiring no setup, using expected-behavior
  baselines, scanning APM error rate, latency and request rate, filtering low-volume
  services, and surfacing anomalies on service pages:
  [overview](https://docs.datadoghq.com/watchdog/),
  [alert coverage](https://docs.datadoghq.com/watchdog/alerts/), and
  [service page](https://docs.datadoghq.com/tracing/services/service_page/).
- Monoscope's public documentation describes automatically discovered anomalies, an
  ongoing-anomalies view, and changes/errors alongside request, latency and error
  analytics: [getting started](https://monoscope.tech/docs/onboarding/) and
  [dashboard](https://monoscope.tech/docs/dashboard/dashboard-pages/dashboard/).
- Hochenbaum, Vallis and Kejariwal describe seasonal decomposition with robust median
  and MAD statistics in
  [Automatic Anomaly Detection in the Cloud Via Statistical Learning](https://arxiv.org/abs/1704.07706).

No Datadog implementation is available or needed. Monoscope is AGPL-3.0, so no
Monoscope source code is read, copied, translated or linked. SigNoz `ee/` and
`cmd/enterprise/` are proprietary and outside the boundary, including their history.
Implementation is clean-room from this ADR, FuseScope's MIT code, the public sources
above and general statistical literature.

## Goals

- Detect material RED regressions, including traffic that drops to zero, for every
  observed service without per-service configuration.
- Detect a newly observed exception group for an established service.
- Bound cost per organization, share admission with user anomaly alerts, and keep
  every organization evaluated even when some are slow.
- Persist issues that can be investigated, acknowledged, muted and resolved.
- Show service health in the Issues page, Services list, Home and service overview.
- Reuse notification channels and routing policies, off until an administrator
  enables them per detector.
- Work identically with SQLite and PostgreSQL and with multiple backend replicas.

Non-goals for the first wave: new-operation detection, deployment correlation,
log-pattern detection, root-cause analysis, per-organization sensitivity,
span-metrics support, a new notification channel, or an ML training service.

## Decisions

### 1. Cycle and windows

The scheduler ticks every five minutes. A tick evaluates the window ending at
`end = floor_5m(now - 2m)` and starting at `end - 15m`: three five-minute buckets.
The two-minute lag lets trace ingestion settle. Baselines are the same window shifted
by `k × 24h`, for `k` from 1 to 4. `end` identifies an evaluation, so retries and
lease failover evaluate the same window.

### 2. Stable per-organization cohort

The cohort is the set of services evaluated in one cycle for one organization. It is
fixed across the five windows and shared by the three RED detectors.

1. **Active services.** Every service with an active RED issue (`open`,
   `acknowledged` or `muted`) is in the cohort, with or without a baseline. An active
   service without an eligible baseline evaluates as no-data.
2. **Discovery.** For each baseline window `k`, one grouped trace query returns the
   three RED aggregations per service, ordered by `count()` descending and limited to
   `max_series`, the same per-response limit the evaluator enforces. The union of the
   four responses offers up to `4 × max_series` candidates. A service's predicted
   volume is the median of its `count()` across seasons.
3. **New candidates.** Candidates fill the cohort up to `max_series` services, active
   services included, ordered by predicted volume. A candidate needs an eligible
   baseline: the scorer needs ten residuals and the window has three buckets, so at
   least 10 of the 12 baseline buckets must have a value, which in practice means all
   four seasons. Current-window volume is never a selection criterion, so a service
   whose traffic fell stays selectable.
4. **Batches.** The cohort is evaluated in batches of at most `max_series` services.
   If active services alone exceed `max_series`, the excess forms extra batches; an
   active service is never dropped. The overflow emits a warning and
   `fusescope.watchdog.active_overflow`.
5. **Excluded services.** A service outside the cohort is not evaluated; for an
   existing issue that cycle is no-data.

`max_series` counts distinct services (label sets) per response, not the three
aggregation series of each service.

Cost per organization and cycle, in query-range calls:

```text
4   discovery (the four baseline windows; they are also the RED baselines)
+ 1 per batch (the current window, filtered to that batch)
+ 4 per batch that contains active services absent from discovery
    (baselines filtered to those services)
+ 1 new_exception
```

The common case, one batch and no active service missing from discovery, is six
calls. Verification inspects `system.query_log` against this formula.

### 3. First-wave detectors

Detector names are persisted API values and do not change after release.

| Detector | Series per service | Anomalous when | Eligible evaluation requires |
|---|---|---|---|
| `error_rate` | `countIf(status_code = 2) / count()` per bucket | 2 of 3 buckets have score ≥ 4 above baseline, rate ≥ 1% and rate ≥ 1.5 × prediction | ≥ 50 requests and ≥ 10 errors in the window; at least 2 of 3 buckets with outcome `scored` or `flat_baseline` |
| `latency_p99` | `p99(duration_nano)` | 2 of 3 buckets have score ≥ 4 above baseline and p99 ≥ 1.5 × prediction | ≥ 50 requests in the window; at least 2 of 3 buckets with outcome `scored` or `flat_baseline` |
| `throughput_drop` | `count()` | 2 of 3 buckets have score ≤ -4 and volume ≤ 50% of prediction | predicted volume ≥ 100 requests in the window; at least 2 of 3 buckets with outcome `scored` or `flat_baseline` |
| `new_exception` | exception `groupID` | the group is first seen after the organization's exception cursor | the service has at least 24 hours of history; the organization is past warm-up |

- **Zero traffic, `throughput_drop` only.** For every cohort service, each current
  bucket with no data, whether the whole service or an intermediate bucket, is filled
  with `0` before scoring. Only buckets wholly inside the lagged window are filled.
  Baselines never receive synthetic zeros; absence there stays `missing_baseline`.
- **Error rate and latency.** A missing current bucket is no-data. No rate or latency
  is invented.
- **Ratio.** The error detector reads error and total counts as two aggregations of
  the same query and builds the ratio series in Go before calling `anomaly.Score`.
  No formula language is added to the evaluator.
- **Persistence.** A bucket triggers only when it passes every gate of its row; the
  window is anomalous when at least two of its three buckets trigger. A single-bucket
  spike opens nothing.
- **Thresholds** are constants documented next to the detector tests. Every
  first-wave issue is `warning`; `critical` is reserved.
- **Provisional calibration.** On 2026-11-18 the detectors ran offline over 168
  windows of steady demo traffic with three seasons (the scorer's residual minimum
  lowered to 9 for the run only). With single-bucket triggers, 1.2 × latency and no
  error-rate ratio they opened 48 false issues in 14 hours: p99 over ~27 requests a
  bucket is close to the maximum, and a constant 18.6% error rate has a near-zero
  MAD. With the rows above they opened none, and still opened every injected
  incident: 3% and 5% error rates on a clean service, 18% → 30% errors, p99 × 1.6 and
  × 2, total silence, a 70% drop. Accepted losses: single-bucket spikes and 18% →
  25% errors (1.34 ×). Calibration is repeated with four seasons once demo retention
  allows it.
- **Retention.** Four seasons need trace retention of at least `4 × 24h + window +
  lag` (about 96h 17m), five days operationally. With less, every service is no-data.
- **Daily seasonality** with four seasons, as in anomaly alerts. A flat baseline uses
  the scorer's bounded flat score.

#### `new_exception` cursor

The 15-minute windows advance five minutes and overlap, so the detector keeps an
in-memory cursor per organization for the lease session:

```text
cursor = (firstSeen, groupID)
```

- One grouped read over a seven-day lookback (within the 15-day table) returns groups
  with `firstSeen ≤ end` that sort after the cursor lexicographically:
  `firstSeen > cursor.firstSeen OR (firstSeen = cursor.firstSeen AND groupID > cursor.groupID)`.
- Results are ordered by `firstSeen, groupID`, at most 100 groups plus one sentinel.
- Groups are processed in order. The cursor advances after each item processed
  successfully: the issue was persisted or idempotently updated, or the group was
  definitively discarded by the 24-hour history gate.
- The cursor stops before an item whose processing or persistence fails; the batch
  stops there and the next cycle resumes from the cursor. A failed query does not
  move it.
- Without overflow or failure the cursor moves to `(end, max)`. With overflow the
  detector emits a warning and `fusescope.watchdog.exception_overflow`, and the rest
  is processed in following cycles.
- **Warm-up.** The first evaluation of an organization in a lease session sets
  `cursor = (end, max)` and opens no issue, so already-present groups do not become a
  burst of issues. A restart or failover warms again and may miss one window; it
  cannot create a false issue.
- **History gate.** A service has 24 hours of history when it appears in at least one
  discovery baseline (`k ≥ 1`). No extra query is needed. A service absent from
  discovery is treated as having no history.
- An exception issue never auto-resolves.

### 4. Shared evaluation limits

`anomalyquerier` gains a low-level session; the public `Evaluate` is unchanged:

```go
s, err := evaluator.Admit(ctx, anomalyquerier.Wait) // one semaphore slot per organization and cycle
defer s.Close()
resp, err := s.Run(ctx, orgID, req)                  // per-window max_series, cumulative max_points
```

`Run` enforces `max_series` on each response and `max_points` on the session total,
and aligns shifted timestamps to the current timeline. Detectors build their series
(the error ratio, synthetic zeros) and call `anomaly.Score`. The semaphore is the one
anomaly rules and previews already use.

### 5. Fairness between organizations

- **Cycle deadline:** four minutes from the tick. When it passes, the cycle stops and
  the remaining organizations wait for the next cycle.
- **Round-robin cursor:** in memory for the lease session. The next cycle starts at
  the organization after the last one started, so every organization is visited in
  successive cycles even when no cycle completes. Failover restarts it.
- **Concurrency:** at most two organizations in parallel, each holding one session.
- **Per-organization budget:** `min(60s, time left in the cycle)`, shared by that
  organization's detectors.
- **Metrics:** `fusescope.watchdog.orgs{result=evaluated|skipped_deadline|error}` and
  `fusescope.watchdog.cycle_duration`.

An organization failure uses `continue`, never `return`.

### 6. Issues and lifecycle

Migration 150 creates `watchdog_issue` and `watchdog_setting` on SQLite and
PostgreSQL.

| Column | Meaning |
|---|---|
| `id`, `org_id` | identity and tenant |
| `detector`, `service`, `fingerprint` | scope; fingerprint unique while active |
| `status` | `open`, `acknowledged`, `resolved` or `muted` |
| `severity` | `warning`; `critical` reserved |
| `first_seen`, `last_seen`, `resolved_at`, `muted_until` | lifecycle |
| `peak_score` | most extreme absolute score; null for `new_exception` |
| `clean_evaluations`, `last_evaluated_at` | idempotent resolution state |
| `evidence` | versioned JSON: the three current buckets, aligned prediction and band, score, query and warnings; never the baseline points |
| `created_at`, `updated_at` | audit |

The fingerprint is the hex SHA-256 of `detector + NUL + service`; `new_exception`
appends `NUL + groupID` before hashing. PostgreSQL text cannot hold a NUL byte, and a
fixed length suits the index. The fingerprint is not decoded: `service` has its own
column and a `new_exception` evidence carries its `groupId`. A partial unique index on `(org_id, fingerprint)` covers the active
statuses. A transition and `last_evaluated_at` are written in one transaction.

Each evaluation of an issue is one of:

- **anomalous:** eligible and triggers;
- **clean:** eligible and does not trigger;
- **no-data:** outside the cohort, too few scored buckets, insufficient or missing
  baseline, below the volume gate, timeout, error, or organization skipped by the
  deadline.

Rules:

1. An anomalous evaluation without an active issue creates an `open` issue.
2. An anomalous evaluation with an active issue updates `last_seen`, evidence and peak
   score, resets `clean_evaluations` and keeps an explicit acknowledgement.
3. A clean evaluation increments `clean_evaluations` once per distinct `end`. Three
   consecutive clean evaluations resolve a RED issue.
4. No-data neither increments nor resets the counter.
5. A recurrence within one hour of resolution reopens the same issue; later, a new
   issue is created.
6. `muted` requires a future `muted_until`. Until then no evaluation changes the
   status or notifies: anomalous updates evidence and peak score and resets
   `clean_evaluations`; clean leaves the counter unchanged; no-data changes nothing.
   At the first evaluation after `muted_until`: anomalous sets `open` and notifies
   when enabled; clean increments the counter and sets `open`, resolving after three
   by rule 3; no-data sets `open` without notifying. No issue stays muted forever.
7. `new_exception` changes state only by user action after opening. It is never
   evaluated again, so each cycle sets an active `new_exception` issue whose
   `muted_until` has passed back to `open`, without notifying.

Resolved issues are deleted in bounded batches after 90 days. Active issues and
settings are never removed by retention.

`watchdog_setting` has `(org_id, detector)` as key plus `enabled` (default true),
`notify` (default false), `created_at` and `updated_at`. A missing row means the
defaults; the store rejects unknown detector names. Disabling a detector stops its
queries and does not resolve its issues; each cycle evaluates them as no-data, so an
expired mute still reopens them. The global boolean feature `watchdog`
(flagger) is the kill switch for the service, routes and UI, disabled by default until
calibration is accepted.

### 7. Generic SQL lease and runtime

Migration 149 creates `lease(name, holder, epoch, expires_at)`. `pkg/lease` acquires
and renews a named lease transactionally using database time. Acquisition increments
the fencing epoch; the holder renews every quarter of the duration; a failed renewal,
ownership mismatch or expiry cancels the callback context; release is conditional on
holder and epoch. The archive branch adopts `pkg/lease` when it merges.

Watchdog is a `factory.Service` running the scheduler under the lease
`watchdog/scheduler`, applying section 5. Issue writes are idempotent by fingerprint
and `end`. Logs carry organization and detector, never evidence payloads or exception
messages.

Migrations follow PR order: 149 (lease) in the lease PR, 150 (Watchdog) in the schema
PR.

### 8. Notifications are opt-in

No detector notifies while `notify=false`. When an administrator first enables it,
the backend calls `SetNotificationConfig(org, "watchdog:<detector>", UsePolicy=true)`.
Opening, reopening and resolving call `PutAlerts` with `ruleId =
watchdog:<detector>`, labels `service`, `detector` and `issue_id`, and `generatorURL`
`/issues?issue=<id>`. A muted issue does not notify; acknowledgement is not an
Alertmanager resolution. A delivery failure does not roll back the transition; it is
logged and metered. There is no outbox in the first wave.

### 9. API, authorization and contract sync

OpenAPI tag `watchdog`:

- `GET /api/v1/watchdog/issues`: paginated; `status`, `service`, `detector` and time
  filters.
- `GET /api/v1/watchdog/issues/{id}`.
- `PATCH /api/v1/watchdog/issues/{id}`: `status` (`acknowledged`, `resolved`,
  `muted`) and `mutedUntil`; `open` is refused.
- `GET /api/v1/watchdog/services/status`: batch status for badges. Active means
  `open`, `acknowledged` or `muted`. For each service with at least one active issue it
  returns `service`, `highestSeverity`, `activeCount`, `detectors[]` (unique, sorted)
  and `allMuted`. `services[]` accepts at most 200 names (400 above); without it the
  response is paginated (`limit` ≤ 200 and a cursor). The UI sends the visible page's
  services.
- `GET /api/v1/watchdog/settings` and `PUT /api/v1/watchdog/settings/{detector}`.

Viewers read issues, status and settings; editors acknowledge, resolve and mute;
administrators change settings. Tenant scope always comes from the authenticated
organization. The API PR regenerates the spec and client in separate commits and
syncs `fusescope-mcp-server` (list, get and update issue tools), the Terraform
provider (`fusescope_watchdog_setting`, or explicitly not affected) and the docs.

### 10. Product surfaces

Behind the `watchdog` flag:

- `/issues` as **Issues** in the Respond sidebar group: filters by state, service,
  detector and time; a `SideSheet` with the evidence series, prediction and band,
  links to filtered traces and exceptions, and acknowledge, resolve and mute.
- `ServiceNameCell` (Services and Home) shows a `StatusBadge` from
  `/watchdog/services/status` only: one call per page, never the paginated list or a
  call per service. `allMuted` renders a muted badge.
- The service Overview adds an **Anomalies** panel beside `MonitorsPanel`.
- Settings adds one row per detector with **Detect** and **Notify** toggles.
- `bandsPlugin`, its options and tooltip move to
  `lib/uPlotLib/plugins/anomalyBands.ts`, shared by anomaly alerts and issue detail.

The UI reads persisted issues, so every surface agrees and page loads add no detector
cost.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| An anomaly rule per service and signal | Rules grow with service cardinality, still need configuration, and give no first-class issue. |
| Span metrics | Disabled by default; zero-configuration behavior would depend on an optional pipeline. |
| One query per service | Cost grows with cardinality; grouped trace queries carry every RED input. |
| Top-N by current-window volume | Excludes exactly the services whose traffic dropped. |
| A ratio formula in the evaluator first | Two counts from one query divided in Go are enough; a formula language is a separate design. |
| A scheduler in every replica | Duplicate issues and notifications are correctness bugs. A SQL lease works on SQLite and PostgreSQL. |
| Serial organizations with per-detector timeouts | One slow organization can starve the rest; the deadline and round-robin cursor bound it. |
| Notify by default | Zero-configuration detection must not page an organization unexpectedly. |
| User alert rules as issues | Rule state has no acknowledgement, muting, evidence, reopen suppression or exception identity. |
| Reading Monoscope or removed SigNoz enterprise code | Licences and the clean-room rule forbid it; public behavior is enough prior art. |

## Delivery plan

Every behavior-changing PR begins with a failing test; generated OpenAPI and client
changes are separate commits.

| PR | Scope |
|---|---|
| 0 | This ADR. |
| 1 | `feat(lease)`: `pkg/lease`, migration 149, SQLite/PostgreSQL expiry and lease-loss tests. |
| 2 | `feat(watchdog)`: types, migration 150, store and pure lifecycle (eligibility, no-data, mute) tests. |
| 3 | `feat(anomaly)`: `Admit`/`Run` session with shared admission and limits for trace queries. |
| 4 | `feat(watchdog)`: cohort, RED detectors, synthetic zeros, leased service with deadline and round-robin. |
| 5 | `feat(watchdog)`: `new_exception` with cursor, history gate and warm-up. |
| 6 | `feat(watchdog)`: API including `/services/status`, authorization, OpenAPI, opt-in notifications; MCP, Terraform and docs sync. |
| 7 | `feat(frontend)`: Issues page, settings and shared band plugin. |
| 8 | `feat(frontend)`: badges from `/services/status`, Overview panel, end-to-end coverage. |

## Verification and exit criteria

- `go test -race` for `pkg/lease`, `pkg/modules/watchdog` and `pkg/anomaly/...`;
  golangci-lint v2 clean.
- **Zero:** a cohort service with no current spans opens `throughput_drop`; a missing
  intermediate bucket becomes 0 for throughput only; the same service opens neither
  `error_rate` nor `latency_p99`; a missing baseline never becomes zero.
- **Cohort:** an active service with zero current volume stays in the cohort; top-N
  uses the baseline median, not the current window; a candidate with 9 of 12 baseline
  buckets is excluded; an active service without a baseline is evaluated as no-data;
  active services above `max_series` form extra batches with a warning; `max_series`
  counts N services, not 3N series.
- **Resolution:** three clean evaluations with distinct `end` resolve; the same `end`
  counts once; timeout, deadline, exclusion and insufficient baseline neither
  increment nor reset; an anomalous evaluation resets.
- **Mute:** two clean evaluations before a mute plus an anomalous one during it do not
  let the first clean evaluation after expiry resolve; at expiry, anomalous opens and
  notifies, clean increments and opens, no-data opens silently.
- **Exception cursor:** a group seen during warm-up opens nothing in the next,
  overlapping cycle; 101 groups with the same `firstSeen` are processed over two
  cycles without loss or duplication; a persistence failure mid-batch does not advance
  the cursor past the previous item; an ineligible group at the start of an overflowing
  batch is discarded and the eligible ones after it open issues; a failed query does
  not move the cursor; a service absent from discovery opens no issue.
- **Fairness:** with slow fake organizations the deadline cuts the cycle and the next
  one starts at the following organization; every organization is visited over
  successive cycles; concurrency never exceeds two sessions.
- **Status:** several active detectors aggregate highest severity, count and
  `detectors[]`; a service with only muted issues has `allMuted`; resolved services
  are absent; 201 names return 400; the unfiltered response is paginated; the UI uses
  one request per page.
- **Lease:** two holders on SQLite and PostgreSQL; only one evaluates; expiry transfers
  ownership; a lost holder's context is cancelled.
- **Notifications:** with defaults WireMock receives nothing; with `notify=true` it
  receives opening and resolution with the stable rule id and issue URL.
- Integration pytest on SQLite and PostgreSQL seeds four daily baselines plus current
  traces for an error spike, p99 regression, a drop including total silence, and a new
  exception group: each opens exactly one issue, and RED issues resolve only after
  three eligible clean windows.
- Jest, Storybook and Playwright cover the Issues page, band, settings, badges and
  panel.
- After release, the demo shows issues for HotROD and the error generators, and
  `system.query_log` matches the cost formula in section 2.

## Consequences

- Services gain health signals without rule setup; paging stays an explicit choice.
- The metastore is the source of truth for anomaly workflow state, adding retention
  work but keeping every surface consistent.
- Query cost is bounded by organizations × batches, not service count, and every
  organization is visited even under load.
- Daily seasonality cannot model weekly patterns in the first release; new and sparse
  services return no-data until their baseline is sufficient.
- The generic lease becomes shared infrastructure; its epoch and database-time
  semantics must stay stable for archive and synthetics.
- Detector names, fingerprints and evidence versions are contracts; thresholds are
  not and may change between releases with release notes.

## Open questions before detector implementation

1. **Calibration.** Calibrated provisionally on three seasons of demo traffic (§3);
   repeat with four seasons and adjust the constants if they are noisy.
2. **Retention.** Confirm 90 days for resolved issues against expected volume.
3. **Critical severity.** Calibrate a critical mapping separately; until then every
   automatic issue is a warning.
