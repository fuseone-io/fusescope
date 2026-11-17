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
  `service.name`, and already aggregates `p99(duration_nano)`, `count()` and
  `countIf(status_code = 2)`. The `use_span_metrics` feature is disabled by
  default; Watchdog therefore reads traces, not span metrics.
- **A signal-independent scorer.** `anomaly.Score` predicts each timestamp with
  the median of its seasonal peers and scales residuals by `1.4826 × MAD`. Scores
  saturate at ±100. A prediction needs at least two matching seasons, while a
  series needs at least ten valid residuals to estimate dispersion.
- **A bounded evaluator.** `anomalyquerier.Evaluator` shares a process-wide
  semaphore and enforces `max_series` and `max_points`. Its public `Evaluate`
  path, however, discovers a target through `anomaly.FindTarget`, which currently
  accepts only a metrics builder with one aggregation.
- **Exception groups.** `distributed_signoz_error_index_v2` groups exceptions by
  `groupID = md5(service || type || message)`. Its default retention is 15 days,
  and `ListErrors` already returns `min(timestamp)` and `max(timestamp)` per group.
- **Background-service conventions.** Long-running work implements
  `factory.Service`, owns a ticker and stop context, and enumerates only the
  organizations returned by `organization.Getter.ListByOwnedKeyRange`. The early
  return in `pkg/query-service/rules/manager.go` is a known counterexample: one
  empty organization must not stop processing later organizations.
- **A lease-shaped precedent.** Migration 142 created `archive_lease`. The generic
  `runUnderLease` implementation is not on `main`; ADR 0006 already says it must
  become a shared package.
- **Alert delivery.** `alertmanager.PutAlerts` accepts generated alerts and
  `SetNotificationConfig` can route a stable `ruleId` through organization
  policies with `UsePolicy`.
- **UI building blocks.** Services and the service overview use the new
  shadcn/Tailwind stack. `StatusBadge`, `SideSheet`, and the anomaly-series helpers
  already exist. The uPlot anomaly band is still private to
  `AnomalyAlertEvaluationView`.

### Prior art and clean-room boundary

Only public product documentation and statistical literature inform this design:

- Datadog documents Watchdog as requiring no setup, using expected-behavior
  baselines, scanning APM error rate, latency and request rate, filtering low-volume
  services, and surfacing anomalies on service pages:
  [overview](https://docs.datadoghq.com/watchdog/),
  [alert coverage](https://docs.datadoghq.com/watchdog/alerts/), and
  [service page](https://docs.datadoghq.com/tracing/services/service_page/).
- Monoscope's public documentation describes automatically discovered anomalies,
  an ongoing-anomalies view, and changes/errors alongside request, latency and error
  analytics:
  [getting started](https://monoscope.tech/docs/onboarding/) and
  [dashboard](https://monoscope.tech/docs/dashboard/dashboard-pages/dashboard/).
- Hochenbaum, Vallis and Kejariwal describe seasonal decomposition with robust
  median and MAD statistics in
  [Automatic Anomaly Detection in the Cloud Via Statistical Learning](https://arxiv.org/abs/1704.07706).

No Datadog implementation is available or needed. Monoscope is AGPL-3.0, so no
Monoscope source code is read, copied, translated or linked. SigNoz `ee/` and
`cmd/enterprise/` are proprietary and are also outside the boundary, including
their history. Implementation work is clean-room from this ADR, FuseScope's MIT
code, the public sources above and general statistical literature.

## Goals

- Detect material RED regressions for every observed service without per-service
  rule configuration.
- Detect a newly observed exception group for an established service.
- Keep cost bounded per organization and share anomaly-query admission limits with
  user-created anomaly alerts.
- Persist an issue that can be investigated, acknowledged, muted and resolved,
  instead of emitting an unstructured stream of alerts.
- Show service health in the Issues page, Services list, Home and service overview.
- Reuse existing notification channels and organization routing policies, with
  notifications off until an administrator enables them per detector.
- Work identically with SQLite and PostgreSQL metastores and with multiple backend
  replicas.

Non-goals for the first wave: new-operation detection, deployment correlation,
general log-pattern detection, root-cause analysis, per-organization sensitivity,
span-metrics support, a new notification channel, or an ML training service.

## Decisions

### 1. First-wave detectors

Watchdog has four fixed detector names. Names are persisted and are API values, so
they do not change after release.

| Detector | Series per service | Trigger | Absolute gate |
|---|---|---|---|
| `error_rate` | `countIf(status_code = 2) / count()` | score ≥ 4 above baseline and rate ≥ 1% | at least 50 requests and 10 errors in the 15-minute window |
| `latency_p99` | `p99(duration_nano)` | score ≥ 4 above baseline and p99 ≥ 1.2 × prediction | at least 50 requests in the window |
| `throughput_drop` | `count()` | score ≤ -4 and traffic ≤ 50% of prediction | predicted traffic at least 100 requests in the window |
| `new_exception` | exception `groupID` | the group's first observation in the seven-day detection horizon is in the current window | service has at least 24 hours of history |

The three RED detectors read only root or entry-point spans and group by the
materialized `service.name`. A missing or empty service name is ignored. The error
detector requests error and total counts as two aggregations in the same trace
query, constructs a ratio series in Go, and passes that series to `anomaly.Score`.
The latency request includes a count aggregation for its volume gate. This avoids a
formula language in the evaluator.

The current window has three complete five-minute buckets. A RED issue opens when
at least one bucket crosses the score and relative threshold and the aggregate
15-minute volume gate also passes. Evidence records the triggering bucket. Partial,
invalid, insufficient-baseline and missing-baseline outcomes never open or resolve
an issue; they are no-data evaluations, not clean evaluations.

The scorer remains the one implementation of seasonal prediction. Watchdog uses a
daily period and four earlier seasons. Its existing floors both apply: prediction
at a timestamp needs two seasons, and scale estimation needs ten residuals. With a
15-minute window and five-minute step, a complete run normally needs all four
seasons to provide the latter. A flat baseline still uses the scorer's bounded flat
score.

Thresholds are constants, documented next to detector tests. They are not exposed
as settings in the first wave. Absolute gates are deliberately layered over the
robust score so a statistically large movement in low-volume data does not become
an issue.

`new_exception` performs one bounded grouped read over a seven-day lookback. It
selects groups whose `min(timestamp)` is in the current window; "new" therefore
means new within that detection horizon, not forever. It uses the existing 15-day
exception table and never reads raw spans to reconstruct groups. The first
evaluation for an organization after a scheduler start is warm-up only. It records
an in-memory watermark for that lease session but opens no exception issue,
preventing startup from turning already-present groups into a burst of issues. A
restart or lease failover conservatively warms the organization again and may miss
one window; it cannot create a false issue from the hand-off. An exception issue
never auto-resolves; a user acknowledges or resolves it.

The first release stores severity but emits `warning` for every first-wave issue.
A calibrated `critical` mapping can be added without changing fingerprints or the
API.

### 2. Evaluation windows and bounded queries

The scheduler ticks every five minutes. For a tick at time `now`, the evaluation
end is `floor_5m(now - 2m)` and the start is 15 minutes earlier. The two-minute lag
lets trace ingestion settle, and the rounded boundary makes retries and lease
failover identify the same window.

Each RED detector makes one grouped query shape per organization, not one query per
service. The evaluator executes that shape for the current window and for four
daily `timeShift` baselines: five query-range calls per detector and organization.
Detectors run serially within an organization. Different organizations are also
visited serially in the first release so query cost is predictable.

`anomalyquerier.Evaluator` gains a low-level method conceptually shaped as:

```go
EvaluateSeries(
    ctx context.Context,
    orgID valuer.UUID,
    build func(shift time.Duration) *querybuildertypes.QueryRangeRequest,
    opts SeriesOptions,
) (*SeriesEvaluation, error)
```

It admits once with `Wait`, runs the current and four baseline requests, aligns
shifted timestamps to the current timeline, accounts for every materialized point,
and enforces the same `max_series` and `max_points` configuration as `Evaluate`.
It returns raw current and baseline series plus query metadata and warnings; it
does not choose a detector or call `anomaly.Score`. The existing public `Evaluate`
method and its metrics-builder validation stay unchanged.

Requests order services by current-window volume and use `max_series` as top-N.
The implementation requests one overflow sentinel when the query path supports it,
trims before scoring, and emits a warning and metric when more services exist.
Baseline windows use the selected current service names as a stable filter, so a
different historical top-N cannot silently replace the services being evaluated.
If the query backend cannot return the overflow sentinel and stable set in one
round trip, the detector may use one bounded discovery query; it must not issue a
query per service. A selected service absent from enough seasons produces
`missing_baseline`, not an anomaly.

Each detector gets `min(1 minute, evaluation interval)` to complete. Timeout,
query error and limit overflow are logged and metered for that detector and do not
stop the next detector or organization.

### 3. Persisted issues and settings

Migration 149 creates `watchdog_issue` and `watchdog_setting` on SQLite and
PostgreSQL.

`watchdog_issue` contains:

| Column | Meaning |
|---|---|
| `id`, `org_id` | stable issue identity and tenant |
| `detector`, `service`, `fingerprint` | detector scope; fingerprint is unique while active |
| `status` | `open`, `acknowledged`, `resolved`, or `muted` |
| `severity` | `warning` initially; `critical` is reserved |
| `first_seen`, `last_seen`, `resolved_at`, `muted_until` | user-visible lifecycle |
| `peak_score` | most extreme absolute score seen; null for a new exception |
| `clean_evaluations`, `last_evaluated_at` | idempotent three-window resolution state |
| `evidence` | versioned JSON with query, window, values, prediction, band and score |
| `created_at`, `updated_at` | audit timestamps |

The evidence object has a `version` from its first release. It stores only the
three current buckets, their aligned prediction/bounds, detector inputs, query
specification and warnings; it does not duplicate four days of baseline points.

The fingerprint is `detector + NUL + service`; `new_exception` appends
`NUL + groupID`. A partial unique index on `(org_id, fingerprint)` covers active
statuses (`open`, `acknowledged`, `muted`). A transition and the corresponding
window watermark update happen in one SQL transaction.

Lifecycle rules are:

1. The first anomalous window inserts an `open` issue.
2. A continuing anomaly updates `last_seen`, evidence and peak score, resets the
   clean count, and preserves an explicit acknowledgement.
3. A clean evaluation increments `clean_evaluations` once per distinct evaluation
   end. Three consecutive clean evaluations resolve a RED issue and set
   `resolved_at`. No-data and failed evaluations neither increment nor reset it.
4. A recurrence within one hour updates and reopens the most recent resolved issue;
   a later recurrence creates a new id. This prevents short flaps without merging
   separate incidents indefinitely.
5. Muting requires a future `muted_until`. While muted, detections update the
   evidence but do not reopen or notify. Once the time passes, an anomalous
   evaluation changes it to `open`; three clean evaluations may resolve it.
6. `new_exception` follows only user transitions after opening and never rule 3.

`watchdog_setting` has `(org_id, detector)` as its primary key plus `enabled`,
`notify`, `created_at` and `updated_at`. A missing row means `enabled=true` and
`notify=false`. The store validates detector names; rows cannot create arbitrary
detectors. Disabling a detector stops evaluations and does not resolve or delete
its existing issues.

Resolved issues are retained for 90 days and then deleted in bounded batches by
the Watchdog service. Active issues and settings are never removed by retention.

### 4. Generic SQL lease and runtime

Migration 150 creates the generic table `lease(name, holder, epoch, expires_at)`.
`pkg/lease` acquires and renews a named lease transactionally using database time,
not a process clock. Acquisition increments the fencing epoch. The holder renews
every quarter of the lease duration; a failed renewal, ownership mismatch or
expired row cancels the callback context. Release is best-effort and conditional
on holder and epoch.

Watchdog is a `factory.Service` registered with the other backend services. It runs
the scheduler under `watchdog/scheduler`, stops through context cancellation, and
enumerates `ListByOwnedKeyRange` on every cycle. An organization failure uses
`continue`, never `return`. The existing archive branch adopts `pkg/lease` when it
merges; this work does not copy its unmerged `runUnderLease`.

Issue writes are idempotent by fingerprint and evaluation end, which protects a
commit racing with lease loss. Notification labels are stable, so retrying an
Alertmanager update replaces the same alert rather than creating another logical
alert.

The global boolean feature `watchdog` is the kill switch for the service, routes
and UI. It is experimental and disabled by default until the demo calibration is
accepted. Per-detector `enabled` settings apply only after the global flag.

Instrumentation is:

- `fusescope.watchdog.evaluations{detector,outcome}` counter;
- `fusescope.watchdog.issues{detector,transition}` counter;
- `fusescope.watchdog.duration{detector}` histogram;
- structured warnings for top-N truncation and errors with organization and
  detector, but no evidence payload or exception message in logs.

Migration numbers 149 and 150 are reserved as above. Although the lease PR can be
reviewed first, migration 150 must not be released ahead of missing migration 149;
the two may land in dependency order or in the same release train.

### 5. Notifications are opt-in

No detector sends a notification while its setting has `notify=false`. When an
administrator first enables notification for a detector, the backend calls
`SetNotificationConfig(org, "watchdog:<detector>", UsePolicy=true)`. It uses no
new receiver or channel type.

Opening/reopening and resolving an issue call `PutAlerts` with stable
`ruleId = watchdog:<detector>`, labels `service`, `detector`, and `issue_id`, and a
`generatorURL` to `/issues?issue=<id>`. Resolution updates the same alert identity
with its end time. A muted issue does not notify. Acknowledgement is an issue
workflow action, not an Alertmanager resolution.

Failure to notify does not roll back an issue transition. It is logged and metered,
and an evaluator retry remains idempotent because the alert identity is stable.
The first wave has no notification outbox or exactly-once delivery guarantee; that
is preferable to making detection unavailable when Alertmanager is unavailable.

### 6. API, authorization and contract sync

The OpenAPI tag is `watchdog` and the routes are:

- `GET /api/v1/watchdog/issues`, paginated, with `status`, `service`, `detector`
  and time-range filters;
- `GET /api/v1/watchdog/issues/{id}`;
- `PATCH /api/v1/watchdog/issues/{id}` with `status` and `mutedUntil`;
- `GET /api/v1/watchdog/settings`;
- `PUT /api/v1/watchdog/settings/{detector}` with `enabled` and `notify`.

Viewers list and read issues and settings. Editors may acknowledge, resolve and
mute issues. Administrators may also change settings. Only detector code reopens
an issue; PATCH cannot set `open`. Tenant scope comes from the authenticated
organization, never a request field.

The API PR regenerates the OpenAPI specification and frontend client in separate
generated commits. The same contract is synchronized with read/get/update issue
tools in `fusescope-mcp-server`. The Terraform provider gains
`fusescope_watchdog_setting` if settings are intended as infrastructure state;
otherwise its PR is explicitly marked not affected. FuseScope docs gain a
Watchdog page in the same release train.

### 7. Product surfaces

Behind the `watchdog` flag:

- `/issues` appears as **Issues** in the Respond sidebar group. Its list filters
  by state, service, detector and time. A `SideSheet` shows the evidence series,
  prediction and band, the evaluation window, links to filtered traces and
  exceptions, and acknowledge, resolve and mute actions.
- `ServiceNameCell` and Home use the same `StatusBadge` component when a service
  has an active issue. The badge reflects the highest active severity and opens
  the filtered issues view.
- The service Overview adds an **Anomalies** panel beside `MonitorsPanel`, listing
  active and recent issues for that service.
- Settings adds one row per fixed detector, with **Detect** and **Notify** toggles.
  Notify remains off when detection is first enabled.
- `bandsPlugin`, its options and tooltip move from
  `AnomalyAlertEvaluationView` to
  `lib/uPlotLib/plugins/anomalyBands.ts`. Both anomaly alerts and issue detail use
  it; pure series helpers stay in `lib/uPlotLib/utils/anomalySeries.ts`.

The UI does not infer health from trace queries. It reads persisted issues so every
surface agrees and page loads do not multiply detector cost.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Create an anomaly rule for every service and signal | It grows persisted rules with service cardinality, still needs lifecycle/configuration, and does not provide a first-class issue. |
| Query span metrics | They are disabled by default and would make zero-configuration behavior depend on an optional pipeline. |
| One query per service | Cost grows with cardinality; grouped trace queries already provide all required RED inputs. |
| Extend the anomaly expression language with ratios first | Error count and request count can be fetched together and divided safely in Go; a formula language is a separate design. |
| Run a scheduler in every replica | Duplicate issues and notifications are correctness problems, not merely extra work. A SQL lease works for SQLite and PostgreSQL. |
| Notify by default | Zero-configuration detection must not unexpectedly page an organization. |
| Reuse user alert rules as issues | Rule state lacks acknowledgement, muting, evidence retention, reopen suppression and exception-group identity. |
| Read Monoscope or removed SigNoz enterprise code | Their licences and the repository clean-room rule prohibit it; public behavior is sufficient prior art. |

## Delivery plan

Every behavior-changing PR begins with a failing test. Generated OpenAPI and client
changes are isolated in their own commits.

| PR | Scope |
|---|---|
| 0 | This ADR: boundaries, detector semantics, limits, clean-room sources and open calibration questions. |
| 1 | `feat(lease)`: `pkg/lease`, generic lease migration 150, SQLite/PostgreSQL expiry and lease-loss tests. |
| 2 | `feat(watchdog)`: types, migration 149, store and pure lifecycle tests for open, update, resolve, reopen and mute. It lands before migration 150 is released. |
| 3 | `feat(anomaly)`: raw `EvaluateSeries` path with shared admission and limits for trace queries; public `Evaluate` unchanged. |
| 4 | `feat(watchdog)`: RED detectors and leased service; pytest seeded traces for error, latency and throughput changes. |
| 5 | `feat(watchdog)`: `new_exception`, history gate and warm-up. |
| 6 | `feat(watchdog)`: API, authorization, OpenAPI and opt-in Alertmanager notifications; MCP/Terraform/docs contract sync. |
| 7 | `feat(frontend)`: Issues page, settings and shared anomaly-band plugin. |
| 8 | `feat(frontend)`: Services/Home badges, service Overview panel and end-to-end coverage. |

PR numbers describe review units, not permission to release migrations out of
order. PRs 1 and 2 are coordinated so every released migration sequence is
contiguous.

## Verification and exit criteria

- `go test -race` passes for `pkg/lease`, `pkg/modules/watchdog` and
  `pkg/anomaly/...`; golangci-lint v2 is clean.
- Lease tests run two holders against SQLite and PostgreSQL and prove only one
  callback evaluates, expiry transfers ownership, and a lost holder's context is
  cancelled.
- Integration pytest runs on SQLite and PostgreSQL. It seeds four daily baselines
  plus current traces for an error spike, p99 regression and throughput drop, and
  an exception group. Each case opens exactly one issue; RED issues resolve only
  after three distinct clean windows.
- With default settings, WireMock receives no notification. With `notify=true`, it
  receives opening and resolution updates carrying the stable rule id and issue
  URL.
- Limit tests prove top-N truncation warns, no per-service query is emitted, and a
  missing baseline never opens or resolves an issue.
- Jest and Storybook cover list/detail/loading/error/empty states, actions,
  settings and the reusable band. Playwright covers an issue appearing in the
  Issues page, Services badge and service panel.
- After release, the demo shows issues for HotROD and the error generators.
  `system.query_log` is inspected for calls and bytes per cycle to validate the
  expected five windows per RED detector and organization.

## Consequences

- Services gain useful health signals without rule setup, while paging remains an
  explicit administrator choice.
- The metastore becomes the source of truth for anomaly workflow state. This adds
  retention and reconciliation work but makes all UI and API surfaces consistent.
- Query cost is bounded by organizations × detectors × five windows, not service
  count. Large organizations see top-N coverage and an explicit warning rather
  than an unbounded scan.
- Daily seasonality reacts to recurring traffic patterns but cannot model weekly
  behavior in the first release. New and sparse services intentionally return
  no-data until their baseline is sufficient.
- A generic lease becomes shared infrastructure. Its epoch and database-time
  semantics must remain stable for archive and synthetics adopters.
- Persisted detector names, fingerprints and evidence versions become contracts.
  Thresholds do not: calibration may change them between releases and is recorded
  in release notes.

## Open questions before detector implementation

1. **Threshold calibration.** Validate score 4, 1%/10 errors, 1.2× latency and 50%
   throughput drop on demo traffic before PR 4. If they produce material noise,
   change the constants and this ADR before exposing organization-level tuning.
2. **Resolved retention.** The proposal is 90 days. Confirm it against expected
   issue volume and metastore size before the cleanup job ships.
3. **Large organizations.** `max_series` is the first top-N. Measure the extra
   stable-service discovery call, if needed, and bytes scanned in the demo; do not
   introduce a second Watchdog-only cardinality setting without evidence.
4. **Critical severity.** Calibrate a critical mapping separately. Until then all
   automatic issues remain warnings rather than presenting an arbitrary severity.
