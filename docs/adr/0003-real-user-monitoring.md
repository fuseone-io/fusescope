# 0003 · Real User Monitoring (RUM)

- Status: accepted (2026-10-21; open decisions resolved as recommended); amended 2026-10-21 with the phase 0 spike, reproducible from [`0003-experiments/`](0003-experiments/)
- Deciders: FuseOne maintainers. SDKs, ingestion, auth and storage span several PRs and repos.

## Context

FuseScope sees requests from the server inward. It doesn't see what users experience in the browser or the app: slow page loads, Web Vitals, JavaScript errors, crashes, or the session that led to a failing backend trace. Datadog RUM covers this for browsers and mobile platforms. SigNoz has no RUM product; its docs only show how to point the OpenTelemetry web SDK at it.

Facts the design rests on:

- **OpenTelemetry already covers the plumbing.**
  - `@opentelemetry/sdk-trace-web` has instrumentations for document load, fetch, XHR and user interaction.
  - It propagates W3C `traceparent` to the backend, so a browser span becomes the parent of the server trace.
  - It exports over OTLP/HTTP.
  - `opentelemetry-android` (donated by Splunk) already ships sessions, crashes, ANRs and app start; `opentelemetry-swift` is usable but thinner.
- **OpenTelemetry now ships browser RUM pieces, still experimental** (checked 2026-10-21):
  - `open-telemetry/opentelemetry-browser` publishes `@opentelemetry/browser-sdk` 0.5 (session manager with inactivity and max duration, `localStorage` store, processors that add `session.id`) and `@opentelemetry/browser-instrumentation` 0.8 (errors, Web Vitals as `browser.web_vital` events, navigation, user actions, fetch, XHR, resource and navigation timing, all under `experimental/`).
  - OTel JS 3.0 (2026-10-20) merged `sdk-trace-base` and `sdk-trace-web` into `@opentelemetry/sdk-trace`, moved the Logs API into `@opentelemetry/api` 1.10 and made `@opentelemetry/sdk-logs` stable. The browser packages above still depend on the 2.12 / 0.223 line.
- **Gaps that remain on the web:**
  - the upstream session isn't shared across tabs after start, has no `session.previous_id` and no session-level sampling;
  - no PII scrubbing; `instrumentation-user-interaction` even names spans after the full URL, query and fragment included;
  - no route templates for views;
  - the OpenTelemetry SDK alone is 20 KB gzip (traces, logs, two OTLP/HTTP exporters).
- **Grafana Faro was evaluated as a base and rejected.**
  - It is Apache-2.0 and active.
  - Its errors, events, vitals and sessions use Faro's own model.
  - Its OTLP transport is experimental, and the collector `faroreceiver` is alpha.
  - Governance is a single vendor.
  - It can still be studied as prior art and, with attribution, its Apache-2.0 code can be reused.
- **Licence trap.** `ua-parser-js` 2.x is AGPL-3.0 (1.x is MIT). Nothing we ship may depend on 2.x.
- **Ingestion keys are cloud-only today.** In the community build they return 501, so browser authentication needs new work.
- **The logs exporter drops the log record's event name.** `logs_v2` has no column for it and it is not copied into attributes (migrator v0.145.0).
- **Schema.** Telemetry tables (`signoz_index_v3`, `logs_v2`, …) are owned by the migrator in `fusescope-otel-collector` (AGPL-3.0). [ADR 0001](0001-agpl-collector-dependency.md) forbids new backend imports from that repo.

## Goals

- Web first, mobile next, on **one platform-agnostic model**: the same applications, sessions, views, errors and screens, with the platform as an attribute.
- Every browser and app session links to backend traces.
- OTel-native end to end: no proprietary wire format, and any OTLP client works.
- Privacy by default: no PII collected unless the customer opts in, which matters for LGPD and GDPR.

Non-goals for now: session replay (see open decisions), product analytics (funnels and retention of user actions), and synthetic monitoring.

## Decisions

### 1. SDK: a thin FuseScope distribution over OpenTelemetry

We publish distributions, not new SDKs. Each one pins a tested set of upstream OpenTelemetry packages and adds only what is missing.

| Package | Base | Adds |
|---|---|---|
| `@fusescope/browser` | `@opentelemetry/sdk-trace`, `sdk-logs`, OTLP/HTTP exporters, `@opentelemetry/browser-sdk` and `browser-instrumentation` where they cover a module | cross-tab sessions with `session.previous_id`, session sampling, SPA view spans with route templates, PII scrubbing (attributes and span names), standard attributes |
| `@fusescope/browser-react` (later others) | `@fusescope/browser` | router integration, error boundary |
| `io.fuseone.fusescope:android` | `opentelemetry-android` | standard attributes, defaults, symbol upload plugin |
| `FuseScopeKit` (SwiftPM) | `opentelemetry-swift` | session, crash, app start, standard attributes |

Rules:

- **Keep the distribution thin.** OpenTelemetry does the heavy lifting. Upstream `opentelemetry-browser` modules replace ours as they stabilise; cross-tab sessions and session sampling are proposed there.
- **Follow one upstream line.** Every OpenTelemetry package comes from the same release line, so the bundle holds one SDK. Today that is 2.12 / 0.223, because the browser packages haven't moved to 3.0.
- **Budget the bundle.** The **default bundle** (core plus document load, fetch, XHR and user actions) stays **≤ 35 KB gzip**; the prototype measured 34.5 KB, of which the OpenTelemetry SDK is 20.3 KB, our modules plus `web-vitals` 5.7 KB and the four instrumentations 8.5 KB. Lazy loading saved 1.1 KB and is not used. CI fails the build when the budget is exceeded.
- **Sample whole sessions, and don't propagate unsampled ones.** An unsampled session sends no `traceparent`. With flags `00`, parent-based backend samplers would drop the server traces too.
- **Homologated, never mandatory.** Our distribution is the recommended, tested and signed path. Any OTLP client is accepted and ingestion never checks the SDK. The UI may show "SDK v1.4.0 · supported" or "SDK outdated" per application, but never blocks.

### 2. Data model

Signals map to existing OTel types, so nothing new is needed on the wire:

| RUM concept | OTel signal | Key attributes |
|---|---|---|
| Application | resource | `service.name`, `service.version`, `deployment.environment.name`, `fusescope.rum.platform` (`web`, `android`, `ios`, …) |
| Session | attribute on every span and log | `session.id`, `session.previous_id` |
| View (page or screen) | span `view` plus attributes | `url.path`, `fusescope.rum.view.route` (route template or screen name) |
| Resource / request | spans from the fetch, XHR and OkHttp instrumentations | `http.*`, `url.*`, child `traceparent` |
| Action | span from user interaction (log event with the upstream `user-action` instrumentation) | `fusescope.rum.action.type`, target |
| Error / crash | log record, `event.name` = `exception` | `exception.type`, `exception.message`, `exception.stacktrace`, `fusescope.rum.error.source` |
| Web Vital | log record, `event.name` = `browser.web_vital` | `browser.web_vital.name` (`lcp`, `inp`, `cls`, `fcp`, `ttfb`, lowercase as web-vitals reports them), `.value`, `.rating`; route of the page load |
| App vital | log record, `event.name` = `rum.vital` | `fusescope.rum.vital.name` (`app_start`, `frozen_frame`, …), value, rating |
| Device and runtime | resource | `browser.*`, `user_agent.original`, `device.*`, `os.*` |

We use standard semantic-convention names wherever they exist, including the experimental `browser.web_vital.*` that upstream instrumentation emits. Our own names live under `fusescope.rum.*` and are documented, so an OTel client configured by hand can produce the same data.

- **The event name is stored as the `event.name` attribute**, because storage drops the log record's own field. The SDK sets both; the gateway copies the field into the attribute for other clients.
- **Page-load vitals carry the route the page was loaded on.** `web-vitals` reports LCP, CLS and INP late, usually after SPA navigations.

### 3. Ingestion: a RUM gateway in the backend

Browsers and apps don't talk to the collector directly. The FuseScope backend exposes `POST /rum/v1/{traces,logs}`, which accepts OTLP/HTTP with JSON or protobuf bodies. It does the following, in order:

1. Authenticates the **public application key** (decision 4).
2. Applies **CORS** from the application's allowed origins.
3. Rate-limits per key and per client IP.
4. Scrubs PII according to the application's policy, in span names as well as attributes.
5. Stamps the platform and application attributes, and copies each log record's event name into `event.name`.
6. Forwards OTLP to the collector.

Why the backend and not the collector:

- keys, origins and policies live in the metastore and are managed from the UI;
- it keeps new logic out of the AGPL collector;
- symbolication (decision 6) needs the same registry.

The gateway uses upstream `go.opentelemetry.io/collector/pdata` (Apache-2.0), not `fusescope-otel-collector` packages. It is stateless and can later be split into its own binary if volume requires it.

### 4. Authentication: public application keys

- Each RUM application gets a **public, write-only key** (`rum_pub_…`) that is safe to ship in a bundle.
- The key only allows ingesting into that application, from its allowed origins (web) or bundle IDs (mobile), within its rate limit.
- Keys can be rotated with an overlap window.
- They are stored hashed. Applications and keys work on SQLite and PostgreSQL.

This is a new auth model, separate from user sessions, API keys and service accounts.

### 5. Storage: reuse traces and logs first

- RUM spans go to the traces tables and RUM events and errors to the logs tables, through the normal pipeline, with no schema change.
- `session.id`, `fusescope.rum.platform` and `fusescope.rum.view.route` are promoted to selected fields **when the first RUM application is created**, before data arrives. Promotion adds a `DEFAULT` column and a bloom-filter index; parts written earlier compute the column from the map and lose the map's index until rewritten, which made the session timeline 10× slower in phase 0.
- **Phase 0 measured no need for rollups.** On 7 days of 140 000 sessions for one app (7.7 M spans), the sessions list took 1.04 s p95 cold with `session.id` in the map and 0.45 s promoted; timeline, vitals p75 per route and error groups stayed ≤ 0.25 s. The list is a scan of the app's spans, so it would reach 2 s near 35 M spans in the range (about 90 000 sessions/day for one app, extrapolated).
- **Rollups only when measured.** Above that volume, add `rum_sessions` and `rum_vitals_1m` aggregating MVs. They would be added in the collector migrator, the schema owner, as a separate decision.
- The sessions list aggregates spans once and reads platform and version from the resource table for the rows it returns. A version that read them from the span resource map, and ran the aggregation twice through a CTE, took 2.7 s.

### 6. Symbolication

- Customers upload artifacts per application and release: browser source maps, Android R8/ProGuard mappings, iOS dSYMs.
- Artifacts are uploaded through an API or CLI, and through bundler and Gradle plugins later.
- Stack traces are symbolicated **at read time** in the backend. Stored telemetry stays raw.
- Artifacts are stored on the filesystem or object storage, with metadata in the metastore.

### 7. Distribution

- **Official registries with provenance:** npm `@fusescope/*` with npm provenance (Sigstore), Maven Central, Swift Package Manager, and pub.dev later.
- **Release artifacts:** every release ships an SBOM, a licence scan (CI fails on GPL, AGPL or SSPL in the dependency tree) and a CVE scan.
- **Versioned, immutable CDN for the web snippet:** `https://cdn.fuseone.io/browser/1.4.0/fusescope.min.js`, with SRI hashes published in the docs.
- **The backend also serves the bundle it was released with** at `/rum/v1/sdk/browser/1.4.0/fusescope.min.js`, with its source map next to it. Air-gapped and self-hosted users then never depend on an external CDN, and get the version that matches their server.
- **A compatibility matrix** of SDK versions against FuseScope server versions is kept in the docs.

### 8. Privacy defaults

- Query strings and fragments are dropped from URLs by default, with an allowlist.
- Inputs and user text are never captured.
- The client IP is used only for the rate limit and an optional country lookup. It is not stored.
- A `setUser()` call exists but is opt-in, with hashing available.
- A consent hook lets the SDK start only after the user agrees.

### 9. UI: a "Frontend" section

| Screen | Contents |
|---|---|
| Applications | per app and platform: sessions, error rate, vitals p75 with a good / needs-improvement / poor split, SDK version badge |
| Views | per route or screen: load time, vitals, errors, top slow resources |
| Errors | grouped by fingerprint (type + top symbolicated frames), first/last seen, affected sessions and releases; reuses Exceptions patterns |
| Sessions | list with filters; session timeline (views, actions, requests, errors) with a jump to backend traces |
| Setup | create an application, key, allowed origins, PII policy, snippet per platform, symbolication uploads |

New screens get Claude Design boards before they are implemented, like the rest of the redesign.

## Roadmap

Each phase ships behind a feature flag and ends with docs and an e2e test.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 · Spike** (done 2026-10-21) | `@fusescope/browser` prototype on HotROD's frontend; measure bundle size and query cost of the sessions list on traces/logs | bundle ≤ 35 KB gzip (34.5 KB); sessions list p95 < 2 s on 7 days of demo data (1.04 s, 0.45 s promoted); this ADR amended |
| **1 · Web MVP** | browser distro 0.x on npm, RUM gateway, applications and keys, Setup and Applications screens, browser→backend trace link | a sample React app is visible end to end, including the trace link |
| **2 · Web complete** | Views, Errors and Sessions screens; source maps; RUM alerts (vitals and error-rate thresholds through existing alert rules); React router integration; CDN and backend-served bundle with SRI | a beginner can instrument an app from the docs alone |
| **3 · Android** | `io.fuseone.fusescope:android` on Maven Central, crashes, ANRs, app start, R8 mappings | crash grouped and symbolicated in the Errors screen |
| **4 · iOS** | SwiftPM package, crashes, app start, dSYMs | same as Android |
| **5 · Cross-platform** | React Native, Flutter, as demand appears | — |
| **Later** | session replay, if accepted; rollup MVs, when an application nears 35 M spans per 7 days | — |

## Phase 3 decisions (Android)

Settled 2026-10-25, while building phase 3.

- **One repo per native platform:** `fuseone-io/fusescope-sdk-android` now, `fusescope-sdk-ios` for phase 4. JS stays in the `fusescope-sdk` monorepo.
- **Java and Kotlin first.** Uncaught exceptions, ANRs and app start ship in phase 3. The native-crash follow-up (#188, level 1) recovers `ApplicationExitInfo` on the next consented launch: exit metadata on API 30+, and bounded protobuf tombstone code frames on API 31+. It preserves the original session, release and sampling decision, exports source `native`, and groups by application library, relative program counter and build ID. No in-process signal handler is installed. Memory dumps, registers and log buffers are excluded. Native frames do not use R8 mappings; symbol-file uploads and ELF/DWARF symbolication remain deferred to level 2.
- **Applications.** An Android application has allowed package names instead of origins: exact (`com.example.shop`), sub-packages (`com.example.*`) or `*`. The gateway refuses a request when any resource's `app.package.name` is missing or not allowed, and refuses an `Origin` header, since an Android key never serves a browser.
- **Attributes.** No upstream semantic convention names the package, so we add `app.package.name`. `opentelemetry-android`'s screen attribute fits the view model once copied into the route.

| Signal | Attributes |
|---|---|
| Resource | `service.name`, `service.version` (the app's `versionName`, the release mappings are keyed by), `deployment.environment.name`, `app.package.name` (the `applicationId`), `telemetry.distro.name` = `io.fuseone.fusescope:android` with `telemetry.distro.version`; the gateway stamps `fusescope.rum.platform` = `android` |
| Crash | log record, `event.name` = `exception`, `exception.type` (class name), `exception.message`, `exception.stacktrace` (`printStackTrace` output), `fusescope.rum.error.source` = `crash` |
| ANR | the same with `exception.type` = `ANR`, `fusescope.rum.error.source` = `anr` and the main thread's stack |
| Screen | `app.screen.name` (upstream); the gateway copies it into `fusescope.rum.view.route` when unset |
| App start | `rum.vital` with `fusescope.rum.vital.name` = `app_start` (decision 2); upstream reports an `AppStart` span the distribution maps |

  The gateway also stores the upstream `app.crash` and `device.anr` events this way, so a plain `opentelemetry-android` app shows crashes and ANRs.
- **R8 mappings.** Uploaded to `POST /api/v1/rum/applications/{id}/mappings` and kept in the source map store with the kind `r8-mapping`, under the same limits, quota and retention. The parser is ours, written from the ProGuard and R8 format documentation. Stack traces are retraced at read time.
  - A release keeps one mapping per R8 map id (`pg_map_id`), so several builds of one release retrace. The id is the `map_id` the uploader gives, else the mapping's own `pg_map_id`; a given id must match it. A mapping without either is the release's single unkeyed mapping.
  - A trace is retraced with the mapping whose map id its frames name (`r8-map-id-<id>` as the source file), else the release's latest upload.
- **Grouping.** A JVM error groups by its deobfuscated type and the class and method of its top three in-app frames, across the thrown exception and then its causes; line numbers are left out. A release without its mapping groups on obfuscated frames until the mapping is uploaded.

## Resolved decisions

| # | Question | Decision |
|---|---|---|
| 1 | Licence of the SDK distributions | **Apache-2.0**, matching upstream OpenTelemetry and keeping its NOTICE; the backend and UI stay MIT |
| 2 | Public application keys as a new auth model (decision 4) | accept |
| 3 | Storage: reuse traces/logs vs. dedicated RUM tables | reuse first, rollups only if phase 0 measures the need |
| 4 | Session replay | out of scope until phase 2 ships; then a separate ADR covering storage cost, masking and the licence of the recording library |
| 5 | Mobile in the first release | design for it now (done in this ADR), build web first |
| 6 | Where the SDK repos live | one monorepo `fuseone-io/fusescope-sdk` for JS; native packages in `fusescope-sdk-android` and `fusescope-sdk-ios` |

## Consequences

- New public packages to maintain, release and secure per platform. This cost is accepted, kept down by staying thin over OpenTelemetry.
- A new ingestion path in the backend that is exposed to the internet. It needs rate limits, size limits and abuse monitoring from the first release.
- RUM queries reuse the traces and logs query engine, so filters, dashboards and alerts work on RUM data without new code.
- Customers who already use the OpenTelemetry web or mobile SDKs can send data to FuseScope today. They only need the documented attributes for the RUM screens to light up.
