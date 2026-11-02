# 0006 · Synthetic monitoring

- Status: proposed
- Deciders: FuseOne maintainers. The scheduler, runners, runner keys, data model, alerting and UI span several PRs and two repos.
- Related: [ADR 0001](0001-agpl-collector-dependency.md) (no AGPL in the backend), [ADR 0002](0002-long-term-archive.md) (the lease this ADR reuses), [ADR 0003](0003-real-user-monitoring.md) (RUM gateway, keys, artifact store, data model), [ADR 0010](0010-single-ingress.md) (the collector is the single ingress; `fs_ing_` keys), [ADR 0009](0009-fusescope-collector.md) (Apache-2.0 `fusescope-collector`).

## Context

FuseScope sees what instrumented code reports. It doesn't notice when a public endpoint, a login flow or a certificate breaks while nobody is using it, or when traffic stops reaching the backend at all. Synthetic monitoring runs scripted requests and browser sessions on a schedule, from chosen locations, and alerts when they fail. Datadog, Grafana Cloud, Checkly and New Relic all sell it; SigNoz has nothing comparable.

Code was read on `main` at `ef3cc1b09`. Licences and products were checked on 2026-10-30.

### What exists

- **A distributed lease.** The archive (ADR 0002, PRs #160, #169, #172) runs one executor per signal across backend replicas: an `archive_lease` row (`signal`, `holder`, `epoch`, `expires_at`) and `runUnderLease` in `pkg/modules/archive/implarchive`, renewed every quarter of its 2-minute duration, whose context is cancelled when the lease is lost. The table is on `main`; the Go code is still on the open archive PRs.
- **A telemetry gateway.** The RUM gateway (`pkg/modules/rumapplication`) authenticates hashed public keys (`rum_pub_…`, SHA-256), rate-limits, stamps attributes and forwards OTLP/HTTP to the collector (`rum.collector_endpoint`) using upstream `pdata`. It forwards traces and logs only. ADR 0010 moves it to the collector.
- **An artifact store.** RUM source maps and R8 mappings live on the filesystem or object storage with metadata in the metastore (`sourcemapstorage.go`).
- **Alert rules** evaluate threshold conditions over metrics, traces and logs with a `for` window; they need no change to read new metrics.
- **No usable secret encryption.** `pkg/query-service/utils/encryption` is AES-CFB without authentication; it must not be reused for credentials.
- **Semantic conventions.** OTel has no synthetics namespace. `user_agent.synthetic.type` (`test` | `bot`, development) marks synthetic traffic on HTTP spans.
- **Dependencies already in `go.mod`** (indirect): `google/cel-go` (Apache-2.0), `miekg/dns` (BSD-3-Clause), `google.golang.org/grpc` (Apache-2.0), `x/crypto` (BSD-3-Clause), `collector/pdata` (Apache-2.0).

### Licences

The backend is MIT; its dependencies follow `CLAUDE.md` (MIT, BSD, ISC, Apache-2.0, BlueOak-1.0.0, or MPL-2.0 used unmodified). Verified from each project's `LICENSE` through the GitHub API:

| Project | Licence | What we may do |
|---|---|---|
| [k6](https://github.com/grafana/k6) (and [xk6-browser](https://github.com/grafana/xk6-browser), archived; [xk6-sm](https://github.com/grafana/xk6-sm)) | **AGPL-3.0** | learn from ideas and public docs only; never embed, link, ship or exec it |
| [Grafana synthetic-monitoring-agent](https://github.com/grafana/synthetic-monitoring-agent) | Apache-2.0 | study and reuse with attribution; but its scripted, browser and MultiHTTP checks execute the AGPL `sm-k6` binary, so we take nothing from that path |
| [Prometheus blackbox_exporter](https://github.com/prometheus/blackbox_exporter) (`prober`) | Apache-2.0 | allowed as a library; its `ProbeFn` reports through a Prometheus registry and its Go API is v0.x |
| [OTel `httpcheckreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/httpcheckreceiver) | Apache-2.0 | allowed; alpha, metrics only, configured statically in a collector |
| [Playwright](https://github.com/microsoft/playwright) | Apache-2.0 | run in the browser runner image |
| [goja](https://github.com/dop251/goja) / [sobek](https://github.com/grafana/sobek) (k6's fork) | MIT | allowed; not adopted (decision 5) |
| [Artillery](https://github.com/artilleryio/artillery) | MPL-2.0 | allowed only unmodified; a Node load tool, learn only |
| [Gatling](https://github.com/gatling/gatling) | Apache-2.0 (Enterprise is proprietary) | allowed, but a JVM load tool; learn only |
| [Checkly](https://github.com/checkly) | CLI, Pulumi provider, Helm charts Apache-2.0; Go SDK, GitHub Action, Playwright helpers MIT; runtime and backend closed | study the monitoring-as-code model |
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | MIT | prior art for monitor types, retries and status pages |
| [web-vitals](https://github.com/GoogleChrome/web-vitals) | Apache-2.0 | inject into browser runs |
| [pro-bing](https://github.com/prometheus-community/pro-bing) | MIT | ICMP in phase 4 |

### The market

| | Datadog | Grafana SM | Checkly | New Relic |
|---|---|---|---|---|
| Check types | API: HTTP, SSL, DNS, WebSocket, TCP, UDP, ICMP, gRPC; multistep API; browser; mobile; network path | Ping, HTTP, DNS, TCP, traceroute; MultiHTTP; k6 scripted; k6 browser | API, browser (Playwright), multistep, Playwright check suites, TCP, DNS, heartbeat, URL | ping, certificate check, broken links, simple browser, scripted browser, scripted API, step monitor |
| Runtime | in-house | Go probers + k6 | Node + Playwright | Node, Selenium-based Chrome/Firefox |
| Frequency | from 1 min | 10–3600 s for API checks; ≥ 60 s scripted and browser | `Frequency` constants (examples 5–30 min) | — |
| Private locations | container worker; pulls tests over HTTPS (polls every 2 s), outbound only; config encrypted with keys it never stores; optional block of reserved IPs | Apache-2.0 agent; gRPC stream of check changes; schedules locally; pushes Prometheus remote-write and Loki | `privateLocations` slugs | containerised job managers |
| Assertions | status, header, body (contains, regex, JSONPath, XPath, JSON Schema), body hash, response time, JS (Chai); ≤ 20 per test | per check type; MultiHTTP assertions and variables | builder: status, JSON body, text body, headers, response time; setup/teardown scripts | in script |
| Alerting | "any assertion fails for X minutes from any n of N locations"; fast retry X times after Y ms | per-check alerts (failures, latency, cert expiry) or PromQL rules | retry strategy (default single retry), degraded and max response time | NRQL alerts |
| Trace and RUM link | injects `x-datadog-*` and W3C `traceparent` with a backend-generated trace id, parent id 0, sampled; browser tests only for allowlisted URLs; each browser run is a RUM session linked both ways | — | `traceparent` / `tracestate` injected by default (`CHECKLY_TRACEPARENT`); results exportable as OTel traces | compares synthetic and real-user page loads |

Sources: [Datadog Synthetics](https://docs.datadoghq.com/synthetics/), [HTTP tests](https://docs.datadoghq.com/synthetics/api_tests/http_tests/), [APM](https://docs.datadoghq.com/synthetics/platform/apm/), [RUM](https://docs.datadoghq.com/synthetics/platform/rum/), [private locations](https://docs.datadoghq.com/synthetics/platform/private_locations/); [Grafana check types](https://grafana.com/docs/grafana-cloud/testing/synthetic-monitoring/create-checks/checks/), [agent architecture](https://github.com/grafana/synthetic-monitoring-agent/tree/main/docs/architecture); [Checkly ApiCheck](https://www.checklyhq.com/docs/constructs/api-check.md), [traces](https://www.checklyhq.com/docs/resolve/traces/); [New Relic monitor types](https://docs.newrelic.com/docs/synthetics/synthetic-monitoring/getting-started/types-synthetic-monitors/).

What the market converged on: declarative API checks with chained steps; browser checks as Playwright-style scripts; managed plus private locations, private ones pulling work outbound; fast retries; "n of N locations" alerting; and a trace id injected by the check so the run links to the backend trace.

## Goals

- Scheduled HTTP, API, browser and network checks from managed and private locations, alerting through the existing alert rules.
- Every run is OTel data in the existing tables and links to the backend trace and, for browser runs, to a RUM-shaped session.
- Licence-clean: our code and every dependency we link follow `CLAUDE.md`, and nothing AGPL ships anywhere. The runner images also carry unmodified third-party programs we don't link (the base image's userland and glibc, Chromium with its bundled components such as FFmpeg under LGPL), each with its notices and source offer (decision 10). This is an exception to `CLAUDE.md`'s licence rule for distributed images, and when this ADR is accepted the exception is written into `CLAUDE.md` in the same PR, as ADR 0002 did for its own.
- Safe on shared infrastructure: no tenant can reach internal networks or another tenant's secrets.

Non-goals: load and performance testing at k6 scale (one virtual user per run, no ramping, no throughput metrics); mobile app tests; network path and traceroute visualisation; public status pages (later, separate decision); a test recorder (later).

## Decisions

### 1. Architecture: a scheduler in the backend, runners that pull jobs

```
 backend replicas                                   runners (one location each)
 ┌───────────────────────────┐   claim / complete    ┌──────────────────────────────┐
 │ scheduler (under lease)   │◀──────────────────────│ supervisor (Go)               │
 │  └─ writes due jobs ──┐   │   HTTPS, runner key   │  ├─ HTTP/TCP/DNS/SSL/gRPC     │
 │ job API ◀── queue ◀───┘   │                       │  └─ browser worker (Node,     │
 │ status evaluator          │                       │      Playwright) per run      │
 └───────────────────────────┘                       │  egress proxy + IP policy     │
                                                     └──────────────┬───────────────┘
 fusescope-collector (ADR 0009, 0010)                               │
   ingestauth + run-token check ◀──── OTLP, runner key, run token ──┘
```

- **Scheduler.** One backend replica schedules, under a lease named `synthetics/scheduler`. The lease moves from `pkg/modules/archive` to a shared package, with a migration that renames `archive_lease` (migration 142, keyed by `signal`) to a generic `lease` table keyed by `name`; the archive keeps its names as values. This depends on the archive PRs that bring `runUnderLease` (#160, #169) merging first. Each tick (1 s) the scheduler writes a job for every check × location that is due. Jobs are unique on `(check_id, location, due_at)` and written insert-or-ignore inside a transaction that first checks the lease epoch, as ADR 0002 fences its commits, so a failover tick from the old and the new holder writes one job. Due times are offset by a hash of the check id within the interval, as the Grafana agent does, so checks don't fire together.
- **Queue in the metastore.** `synthetics_job` (check, location, trace id, due, deadline, status, claim holder and expiry) on SQLite and PostgreSQL. PostgreSQL claims with `FOR UPDATE SKIP LOCKED`; SQLite serialises writers. Completed jobs are pruned after a day; results live in ClickHouse. Design target for phase 1: 2 000 runs per minute per install, measured in its exit criteria.
- **Missed runs are skipped, not queued.** A job unclaimed past its deadline (the interval, or twice the timeout if shorter) expires and counts as `skipped` for that location, never as a failure. Let *W* be the job's worst-case run, `timeout × (retries + 1) + retries × retry_delay`. A claim expires 30 s after its last heartbeat, and heartbeats renew it while the run goes on, but **never past W + 30 s from the claim**: at W the supervisor kills the run and completes it as `error`, so a hung prober or browser worker can't hold a claim. An expired claim is re-queued once, **in place**: the same row gets a new claim id, run id, trace id and run token, and a new deadline measured from the re-queue (`min(interval, 2 × timeout)` from then), so the re-queue can always run. Completion is fenced by claim id, so a runner whose claim expired can't complete the job after another runner took it.
- **One run per claim, counted from completions.** A re-queued job gets a new run id, trace id and run token, so a runner whose claim expired reports under its own trace, which the UI marks `abandoned`. Run counts, durations and uptime (`check.runs`, `check.duration`) are emitted by the backend, never by runners, so a fenced-out runner can't double-count: `success`, `failure` and `error` from accepted completions, and `skipped` from the scheduler when a job expires unclaimed or its slot is skipped for overlap.
- **No overlap per check and location.** The scheduler doesn't write a job for a check × location while an earlier one is claimed; that slot counts as `skipped`. The evaluator orders results by `due_at`, so a late completion never replaces a newer result.
- **Runners pull.** A runner long-polls `POST /api/v1/synthetics/runner/jobs:claim` (outbound HTTPS only, as Datadog private locations do), runs the job, sends its telemetry to the collector and completes it with its outcome. A runner serves one location; a location can have many runners, which share its queue.
- **Status evaluator.** The evaluator (decision 7) runs every 10 s under the same `synthetics/scheduler` lease, so exactly one replica emits `fusescope.synthetics.check.status`.
- **Why the backend schedules** rather than runners scheduling themselves, as the Grafana agent does: alerts are evaluated in the backend, so runs without a backend help nobody; one schedule gives one place for limits, pause and on-demand runs; and runners stay stateless. The cost is that runs stop while every backend replica is down; an outage of the backend itself is for external monitoring.
- **One runner binary.** `fusescope-runner` (Go, MIT, in this repo under `cmd/runner`) is a supervisor that holds the runner key, claims jobs, runs HTTP, TCP, DNS, SSL and gRPC checks in-process, and hands browser jobs to a worker. Two images, as the Grafana agent ships:
  - `fusescope-runner`: Go only, small.
  - `fusescope-runner-browser`: the same binary plus Node, Playwright and Chromium.
- **Embedded runner.** The backend binary includes the same in-process probers as the location `local`, enabled by config, so a single-binary install runs API checks with no extra deployment. It never runs browser checks.
- **Locations.** Managed locations are runners FuseOne operates for FuseScope Cloud; self-hosted installs have `local` plus their private locations. A private location is created in the UI, which issues its first runner key, and deployed with the Helm chart or Docker.

### 2. Runner keys

- Runner keys are **secret ingestion keys** (`fs_ing_…`, ADR 0010) of a new **`runner` kind** (ADR 0010 §2 gains the kind; the snapshot already carries each key's kind), bound to one location through a backend table, `synthetics_location_key` (key id → location), which the backend's job API enforces. Each key has the `traces`, `metrics`, `logs` and `artifacts` signals: stored hashed, rotatable with an overlap window, pushed to collectors over OpAMP like every ingestion key.
- A key can claim only its location's jobs (checked by the backend's job API), complete only jobs it claimed, and send telemetry only for runs it holds: each claim returns a short-lived **run token** signed by the backend (run id, check, location, key id, the run's attributes, expiry), and the collector verifies it with a public key received over OpAMP. The token expires 10 minutes after the claim's expiry, covering artifact uploads and OTLP export retries; each heartbeat that renews the claim returns a renewed token.
- Runners heartbeat every 30 s, independent of check intervals: each long-poll returns within 30 s and the runner calls again, and a running job renews its claim on the same timer. A location whose runners all missed 3 heartbeats (90 s) is `offline`, raises its own alert, and its checks show "no data" for it rather than failures.

### 3. Data model: every run is OTel data

Results are sent as OTLP to the **collector**, the single ingress (ADR 0010); the backend has no synthetics ingest route. `ingestauth` authenticates the runner key, and a run-token check in `fusescope-collector` (Apache-2.0, ADR 0009) refuses a payload whose token is missing, expired or issued to another key, and sets resource and check attributes from the token (never from the runner). The collector **requires** a valid run token on every payload of a `runner`-kind key, so a runner key can't send untokenised data; on payloads of every other key it drops `fusescope.synthetics.*` attributes, so no other key can forge synthetics results. The backend's own synthetics metrics (check status, failing locations, and the run counters, decision 7) go to the collector's internal listener with a backend `fs_ing_` key that has the `metrics` signal and no location, which the check doesn't apply to. The embedded `local` runner sends to the collector's internal listener (ADR 0010 §1) with an `fs_ing_` key of the location `local` that the backend creates, rotates and publishes over OpAMP like any other key, plus a run token per job, so its telemetry is accepted when that listener runs `enforce`. Spans, logs and metrics land in the existing tables; the only schema change is the two materialized columns below.

| Concept | Signal | Content |
|---|---|---|
| Run | trace; root span `synthetics.run` | the scheduler generates the trace id per job, so the UI links a run to its trace before data arrives |
| Step / request | child span per step, `CLIENT` spans per request; `httptrace` phases (DNS, connect, TLS, first byte, transfer) as child spans | `http.*`, `url.*`, `server.address`, `user_agent.synthetic.type` = `test`, assertion results as span events |
| Backend link | W3C `traceparent` on every request of an API check, and on requests to allowlisted origins in browser checks, sampled flag `01`; the request span is the parent of the server's span | |
| Retry | each attempt is a child of the run span; only the last attempt counts | `fusescope.synthetics.attempt` |
| Failure | log record, `event.name` = `fusescope.synthetics.failure` | failed assertion, expected and actual (truncated, scrubbed), error type |
| Metrics | per run, per location; `check.runs` and `check.duration` emitted by the backend from completions (decision 1), the others by the runner | `fusescope.synthetics.check.duration` (histogram, s), `fusescope.synthetics.check.runs` (counter; `fusescope.synthetics.result` = `success` / `failure` / `error` / `skipped`), `fusescope.synthetics.step.duration`, `fusescope.synthetics.tls.cert.expiry` (s until expiry) |
| Check status | metric emitted by the backend (decision 7), per check | `fusescope.synthetics.check.status` (1 up, 0 down), `fusescope.synthetics.check.failing_locations` |
| Browser run | the run trace plus a RUM-shaped session: `session.id` = run id, `view` spans, `browser.web_vital` logs (LCP, CLS, FCP, TTFB; INP when a step interacts), errors as `exception` logs, `fusescope.rum.platform` = `web` | screenshots, Playwright trace and HAR as artifacts, referenced by `fusescope.synthetics.artifact.ids` |

Attributes: `fusescope.synthetics.check.id`, `.check.name`, `.check.type`, `.location`, `.run.id`, `.step.index`, `.step.name`, `.trigger` (`schedule` / `manual` / `ci`). Resource: `service.name` = `fusescope-synthetics`. Our names live under `fusescope.synthetics.*`, as RUM's under `fusescope.rum.*`; standard names are used where they exist. `check.id` and `location` get materialized columns and indexes on the traces and logs tables through a migration in the Apache-2.0 migrator (`fusescope-collector-server`, phase 1); nothing changes the schema at runtime. This is the one telemetry schema change of this ADR.

- **RUM sessions of the tested app.** When the page runs `@fusescope/browser`, the runner sets `window.__FUSESCOPE_SYNTHETICS__ = { runId, checkId }`; the SDK then stamps `fusescope.synthetics.run.id` and `user_agent.synthetic.type` = `test`, and the RUM screens hide synthetic sessions by default with a link to the run.
- **Artifacts** go through the collector's `artifactreceiver` (ADR 0010 §7) with the runner key and the run token, into the RUM artifact store under the kind `synthetics`, with their own retention (default 30 days) and size limits. HAR files drop `Authorization`, `Cookie` and `Set-Cookie` values.

### 4. Check types and assertions

- **HTTP / API** (phase 1). Method, URL, headers, body, basic or bearer auth from secrets, TLS options, redirect policy. Assertions are declarative: status, response time, header, body contains / regex, JSONPath, certificate expiry. Advanced assertions are [CEL](https://github.com/google/cel-go) expressions over `response`, with a cost limit: CEL is non-Turing-complete, already a transitive dependency, and blackbox_exporter uses it for the same purpose.
- **Multistep API** (phase 2). Up to 10 steps sharing a cookie jar. A step extracts variables (JSONPath, header, regex, CEL) that later steps use as `{{ vars.name }}`; `{{ secrets.name }}` and built-ins (`uuid`, `timestamp`) are available everywhere. Substitution only; no logic.
- **Browser** (phase 3). A Playwright test file (`*.spec.ts`), each `test.step()` a span. The `request` fixture covers scripted API checks that outgrow multistep.
- **TCP, DNS, SSL, gRPC health, ICMP** (phase 4). Our own probers on `net`, `crypto/tls`, `miekg/dns`, the gRPC health protocol and `pro-bing`.
- **Probers are ours.** blackbox_exporter's and the Grafana agent's Apache-2.0 probers are the reference for semantics and edge cases, and code may be adapted with attribution in `NOTICE`. They aren't imported: their API reports into a Prometheus registry, while we need spans per phase, injected `traceparent`, multistep state and our dialer (decision 6).

### 5. Scripting: declarative first, Playwright for scripts, no goja

- Declarative checks cover most API monitoring and run safely on shared runners.
- Scripts are Playwright tests in the browser runner. Playwright is Apache-2.0, is what Checkly uses, and users already write it for end-to-end tests, so a check can be a test they already have.
- **goja is licence-clean (MIT) but not adopted.** We would own a JS API surface (k6's is AGPL and can't be copied), and goja has no memory limit, only interruption, so a hostile script can exhaust a shared runner. Playwright scripts run in a worker process we can cap and kill. Revisit only if users need JS in API checks without a browser image.

### 6. Limits and isolation

- **Runs are isolated.** A browser run gets a fresh browser context in a worker process started by the supervisor, with a cgroup memory and CPU cap, a non-root user and a read-only root filesystem. The worker never sees the runner key; it receives the job and returns results to the supervisor. On FuseScope Cloud each browser run uses an ephemeral container.
- **Egress is the security boundary** (SSRF). Checks send user-chosen requests from inside our infrastructure, so nothing a tenant writes may reach the runner's own host, the cluster, a cloud metadata service or another tenant. Five layers, each sufficient on its own for the common cases:
  1. **One dialer.** Every connection, from the in-process probers (HTTP, TCP, DNS, SSL, gRPC, ICMP) and from Chromium, goes through one Go dialer. It resolves the name itself, checks **every** resolved address, and connects to the address it checked (TLS keeps the host name for SNI and verification), so DNS rebinding and a redirect to a new host can't escape. Each redirect hop is checked again. Hosts written as unusual IPv4 literals (decimal `2130706433`, octal, hex, short forms such as `127.1`) are either refused as invalid or resolved by the system resolver like any name, and then the resolved address is checked; safety comes from checking the resolved address, never from parsing the literal. The SSRF suite tests both outcomes for each form.
  2. **Denied ranges on shared runners** (`local` and managed locations): loopback (`127.0.0.0/8`, `::1`); unspecified and "this network" (`0.0.0.0/8`, `::`); RFC 1918; link-local (`169.254.0.0/16`, `fe80::/10`), which holds the metadata services of AWS, GCP, Azure, Oracle and DigitalOcean at `169.254.169.254` and ECS task metadata at `169.254.170.2`; CGNAT `100.64.0.0/10`, which holds Alibaba's `100.100.100.200`; ULA `fc00::/7`, which holds AWS's IPv6 metadata `fd00:ec2::254`; site-local `fec0::/10`; `192.0.0.0/24`, benchmarking `198.18.0.0/15`, reserved `240.0.0.0/4`, broadcast, and multicast (`224.0.0.0/4`, `ff00::/8`). Addresses that embed IPv4 (IPv4-mapped `::ffff:0:0/96`, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`, Teredo `2001::/32`) are checked by their embedded IPv4 too. The runner also denies its cluster's pod and service CIDRs and node addresses from config, since a cluster may use non-private ranges. SMTP ports (25, 465, 587) are refused, so a check can't send mail. The operator, never a tenant, can add allowed CIDRs and host names.
  3. **Chromium has no route of its own.** The browser worker runs in its own network namespace (an ephemeral container on Cloud) whose only reachable address is the supervisor's egress proxy; everything else is dropped by the namespace's firewall, and on Kubernetes by a deny-all egress `NetworkPolicy` that allows only the proxy. Chromium is launched with `--proxy-server` pointing at that proxy and `--proxy-bypass-list=<-loopback>` (by default it never proxies `localhost`), the `WebRtcIPHandlingPolicy` set to `disable_non_proxied_udp`, QUIC off, DNS-over-HTTPS off, and downloads and file system access denied. Navigations other than `http`, `https`, `ws` and `wss` (`file:`, `chrome:`, `data:`, `javascript:` top-level, `blob:` downloads) are refused.
  4. **Nothing to steal on the runner.** Runner pods mount no service account token (`automountServiceAccountToken: false`) and get no cloud identity (no IRSA, Workload Identity or instance role); managed nodes enforce IMDSv2 with a hop limit of 1 (AWS) and block the metadata address at the node firewall, as defence in depth behind layer 2. The worker never sees the runner key or secrets other than its own job's.
  5. **The embedded `local` runner** runs in the backend process, next to its database credentials and any cloud identity, so it always uses the shared-runner deny list, which also covers the backend's own ports (loopback) and its ClickHouse, metastore and OpAMP addresses (private ranges). It never runs browser checks, and an admin can turn it off; installs with untrusted users should run checks only from separate runner pods.
  - **Private locations** exist to reach internal networks, so they allow private ranges with an operator allow and deny list. They still deny loopback and link-local (metadata) by default; the operator must allow them explicitly.
  - **Tests.** The dialer and the browser worker get an SSRF suite in CI: each denied range, IPv4-in-IPv6 forms, decimal and octal literals, redirects to internal addresses, DNS rebinding with a TTL-0 resolver, `localhost` and WebRTC from Chromium, and a metadata endpoint stub; phase 1 and phase 3 exit criteria require it green.
- **Caps** (configurable per install, defaults): minimum frequency 60 s (10 s allowed for self-hosted API checks); timeout ≤ 60 s for API checks and ≤ 120 s for browser checks; 1 MiB of response body read for assertions; 10 redirects; 10 steps; 256 KiB scripts; per-org limits on checks and runs per minute; per-runner concurrency.

### 7. Alerting: a check status, then the existing rules

"Failing from N of M locations" needs a per-location result and then a count across locations, which a single threshold rule can't express. The backend therefore evaluates check status itself:

- **Retries happen on the runner.** A failed run is retried in the same location up to `retries` times (default 1, max 3) after `retry_delay` (default 5 s); only the final attempt counts.
- **Per check, the backend** keeps each location's latest final result (from job completions) and emits `fusescope.synthetics.check.status` = 0 when at least N of the M locations that reported within the **reporting window** failed. The window is `2 × max(interval, W + retry_delay)`, with W the worst-case run (decision 1), and a location with a run in progress counts toward M with its last result, so a slow failing check that completes less often than its interval never drops out of M. Skipped and offline locations don't count toward M, and N is capped at M: the effective threshold is `min(N, M)` (default N = 2), so a check whose other locations went offline still goes down when the remaining one fails. With M = 0 the status is not emitted and the check shows "no data".
- **Alerts are ordinary threshold rules** on that metric with a `for` window ("down for 3 minutes"). Creating a check creates its rule, which the user can edit or delete; latency and certificate-expiry rules are optional presets on the per-location metrics.
- **Notifications** carry links to the check, the failing run and its backend trace.

### 8. Secrets

- Org-scoped secrets, referenced as `{{ secrets.name }}`, write-only through the API: never returned, logged or rendered.
- Stored with AES-256-GCM under a key-encryption key from config (`synthetics.secrets.key`, with a key id so it can be rotated), not with the existing AES-CFB helper.
- Resolved when a job is claimed and sent over TLS in the claim response; never stored in the job row. Private locations may register a public key, and then secrets are sealed to it (NaCl box, `x/crypto`) so only that location can read them.
- The runner redacts secrets before sending (the collector never holds secret values), in span attributes, logs, assertion output, HAR and error messages: each value **and its derived forms**, namely base64 (alone and as `user:password` for basic auth), URL encoding, JSON escaping and hex, is replaced with `***`. `Authorization`, `Proxy-Authorization`, `Cookie` and `Set-Cookie` headers are dropped wholesale, as are request headers, query parameters and body fields that reference a secret, and an assertion's actual value is redacted if any secret form appears in it. Screenshots can't be scrubbed; Playwright's `mask` hides marked elements, and the docs say so.

### 9. UI: a "Synthetics" section

| Screen | Contents |
|---|---|
| Checks | list with type, status, uptime % and p95 duration over the range, locations, frequency, last run; filters by tag, type and status |
| Check detail | uptime timeline per location (up / down / skipped / no data), duration chart by location, recent runs, alert rule and its state, edit, run now |
| Run | waterfall of steps and requests with timing phases, assertions with expected and actual, link to the backend trace and logs |
| Browser run | steps with a screenshot each, Web Vitals, console errors, network waterfall from the HAR, Playwright trace download |
| Locations | managed and private locations, runners and heartbeats, keys, network policy, setup snippets |
| Secrets | names, last used, who changed them; values never shown |

New screens get Claude Design boards before they are implemented.

### 10. Licence posture

| Piece | Where it runs | Licence |
|---|---|---|
| Scheduler, job API, run tokens, status evaluator, in-process probers | backend binary | MIT, our code; deps `cel-go`, `miekg/dns`, `grpc`, `pdata`, `x/crypto` (Apache-2.0, BSD-3-Clause), `pro-bing` (MIT, phase 4) |
| `fusescope-runner` | separate image | MIT, same Go packages |
| Run-token check | `fusescope-collector` | Apache-2.0, our code (ADR 0009) |
| Browser worker | `fusescope-runner-browser` image, separate process | our worker MIT; Playwright, web-vitals Apache-2.0; Node MIT; Chromium BSD-3-Clause with its bundled third-party licences, attributed in the image |
| k6, xk6-browser, xk6-sm | nowhere | AGPL-3.0, learn-only |

k6 is AGPL-3.0. Linking it would make the backend AGPL, and shipping it in a runner image, even as a separate binary as the Grafana agent does, would put an AGPL component in every private location we distribute and make us answer for its source offer. We don't need it: Playwright covers scripts and our probers cover the rest. We read k6's public docs for ideas (checks and thresholds, one-iteration-per-run, browser API shape) and copy nothing. Both images get an SBOM and a licence scan in CI. Our code and the Go and Node packages we link must pass the `CLAUDE.md` list. The OS packages of the base image (`debian:bookworm-slim` for the browser image, distroless static for `fusescope-runner`) and Chromium's bundled components are listed as named exceptions: unmodified, not linked by our code, with their notices and the upstream source offers in the image. Anything AGPL fails the scan everywhere.

## Roadmap

Each phase ships behind a feature flag and ends with docs and an e2e test.

| Phase | Scope | Repos | Exit criteria |
|---|---|---|---|
| **1 · HTTP checks and alerts** | shared lease package; scheduler and job queue; embedded `local` runner; HTTP checks with declarative and CEL assertions; retries; run tokens and the collector run-token check (needs ADR 0010 `ingestauth`); `traceparent` injection; check status and generated alert rule; secrets; Checks, Check detail and Run screens; SSRF dialer | `fusescope`, `fusescope-collector-server`, `fusescope-charts` | an HTTP check on SQLite and PostgreSQL fails, alerts within interval + (retries + 1) × timeout + retries × retry_delay + status evaluation period + `for`, and its run opens the backend trace; 2 000 runs/min sustained on one PostgreSQL install; the SSRF suite (decision 6) is green |
| **2 · Multistep and private locations** | multistep API checks with variables; `fusescope-runner` binary and image; locations, runner keys, heartbeats; Helm chart; sealed secrets for private locations; Locations screen | `fusescope`, `fusescope-charts` | a private runner in a kind cluster reaches a service the backend can't, with a key that can't claim another location's jobs |
| **3 · Browser checks** | `fusescope-runner-browser` image; Playwright worker with steps, screenshots, HAR, trace, Web Vitals; egress proxy; RUM-shaped session; SDK hook for synthetic sessions; Browser run screen | `fusescope`, `fusescope-charts`, `fusescope-sdk` | a Playwright login check runs from a private location, links to the backend trace, and its session is hidden from RUM by default; the browser SSRF suite (`localhost`, WebRTC, metadata stub) is green; image licence scan green |
| **4 · Network checks** | TCP, DNS, SSL, gRPC health, ICMP; certificate expiry preset | `fusescope` | each type has golden tests against local servers and an alert preset |
| **5 · CI triggers** | `POST /api/v1/synthetics/runs` for a set of checks with overrides (base URL, variables); CLI and GitHub Action that wait and fail the pipeline; checks as code from files | `fusescope`, new `fusescope-synthetics-action` or the existing CLI | a pull request pipeline runs checks against a preview URL and fails on a broken step |

## Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | New direct dependencies (`cel-go`, `miekg/dns` promoted from indirect; `pro-bing`; Playwright in the image) | accept with this ADR; each is MIT, BSD or Apache-2.0 |
| 2 | Default "N of M" and retries | N = 2, capped at M; one retry after 5 s |
| 3 | Where the browser worker code lives | in this repo next to `cmd/runner`, so one release versions the supervisor and the worker |
| 4 | Licence of the runner images | MIT for our code, like the backend; third-party licences in the image |
| 5 | Minimum frequency on FuseScope Cloud | 60 s for API, 5 min for browser, until runner costs are measured |
| 6 | Queue in the metastore vs. a broker | metastore; revisit if phase 1 measures it below 2 000 runs/min |
| 7 | JS for API checks without a browser image (goja) | no, until users ask; Playwright's `request` fixture covers it |

## Consequences

- A new component to release and secure: runner images and run tokens. Runner keys and ingest limits are the collector's (ADR 0010), so the backend gains no internet-facing ingest path.
- The backend issues outbound requests chosen by users, so the dialer policy is security-critical and gets its own tests and review.
- Results reuse the traces, logs and metrics query engine, so dashboards, explorers and alert rules work on synthetic data without new query code.
- Synthetic traffic reaches customers' services; it is marked with `user_agent.synthetic.type` and a `FuseScope-Synthetics` user agent so it can be filtered.
