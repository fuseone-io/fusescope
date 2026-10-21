# 0003 · Real User Monitoring (RUM)

- Status: proposed
- Deciders: FuseOne maintainers. SDKs, ingestion, auth and storage span several PRs and repos.

## Context

FuseScope sees requests from the server inward. It doesn't see what users experience in the browser or the app: slow page loads, Web Vitals, JavaScript errors, crashes, or the session that led to a failing backend trace. Datadog RUM covers this for browsers and mobile platforms. SigNoz has no RUM product; its docs only show how to point the OpenTelemetry web SDK at it.

Facts the design rests on:

- **OpenTelemetry already covers the plumbing.**
  - `@opentelemetry/sdk-trace-web` has instrumentations for document load, fetch, XHR and user interaction.
  - It propagates W3C `traceparent` to the backend, so a browser span becomes the parent of the server trace.
  - It exports over OTLP/HTTP.
  - `opentelemetry-android` (donated by Splunk) already ships sessions, crashes, ANRs and app start; `opentelemetry-swift` is usable but thinner.
- **OpenTelemetry leaves RUM gaps on the web:**
  - no session manager (the `session.id` attribute is defined in semantic conventions, but generating, expiring and sharing it across tabs is left to the user);
  - no Web Vitals;
  - no global error capture (`window.onerror`, `unhandledrejection`);
  - no SPA view tracking;
  - no session-level sampling;
  - a heavy bundle when every instrumentation is included.
- **Grafana Faro was evaluated as a base and rejected.**
  - It is Apache-2.0 and active.
  - Its errors, events, vitals and sessions use Faro's own model.
  - Its OTLP transport is experimental, and the collector `faroreceiver` is alpha.
  - Governance is a single vendor.
  - It can still be studied as prior art and, with attribution, its Apache-2.0 code can be reused.
- **Licence trap.** `ua-parser-js` 2.x is AGPL-3.0 (1.x is MIT). Nothing we ship may depend on 2.x.
- **Ingestion keys are cloud-only today.** In the community build they return 501, so browser authentication needs new work.
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
| `@fusescope/browser` | `@opentelemetry/sdk-trace-web`, logs SDK, OTLP/HTTP exporters | session manager, error capture, Web Vitals (`web-vitals`, Apache-2.0), SPA views, session sampling, PII scrubbing, standard attributes |
| `@fusescope/browser-react` (later others) | `@fusescope/browser` | router integration, error boundary |
| `io.fusescope:android` | `opentelemetry-android` | standard attributes, defaults, symbol upload plugin |
| `FuseScopeKit` (SwiftPM) | `opentelemetry-swift` | session, crash, app start, standard attributes |

Rules:

- **Keep the distribution thin.** OpenTelemetry does the heavy lifting. When a module is generic (sessions, errors), we propose it upstream.
- **Budget the bundle.** The browser core targets **≤ 35 KB gzip**, with non-critical instrumentations loaded lazily. CI fails the build when the budget is exceeded.
- **Homologated, never mandatory.** Our distribution is the recommended, tested and signed path. Any OTLP client is accepted and ingestion never checks the SDK. The UI may show "SDK v1.4.0 · supported" or "SDK outdated" per application, but never blocks.

### 2. Data model

Signals map to existing OTel types, so nothing new is needed on the wire:

| RUM concept | OTel signal | Key attributes |
|---|---|---|
| Application | resource | `service.name`, `service.version`, `deployment.environment.name`, `fusescope.rum.platform` (`web`, `android`, `ios`, …) |
| Session | attribute on every span and log | `session.id`, `session.previous_id` |
| View (page or screen) | span `view` plus attributes | `url.path`, `fusescope.rum.view.route` (route template or screen name) |
| Resource / request | spans from the fetch, XHR and OkHttp instrumentations | `http.*`, `url.*`, child `traceparent` |
| Action | span from user interaction | `fusescope.rum.action.type`, target |
| Error / crash | log record (event) | `exception.type`, `exception.message`, `exception.stacktrace`, `fusescope.rum.error.source` |
| Web Vital / app vital | log record (event) | `event.name` = `rum.vital`, `fusescope.rum.vital.name` (`LCP`, `INP`, `CLS`, `TTFB`, `app_start`, `frozen_frame`, …), value, rating |
| Device and runtime | resource | `browser.*`, `user_agent.original`, `device.*`, `os.*` |

We use standard semantic-convention names wherever they exist. Our own names live under `fusescope.rum.*` and are documented, so an OTel client configured by hand can produce the same data.

### 3. Ingestion: a RUM gateway in the backend

Browsers and apps don't talk to the collector directly. The FuseScope backend exposes `POST /rum/v1/{traces,logs}`, which accepts OTLP/HTTP with JSON or protobuf bodies. It does the following, in order:

1. Authenticates the **public application key** (decision 4).
2. Applies **CORS** from the application's allowed origins.
3. Rate-limits per key and per client IP.
4. Scrubs PII according to the application's policy.
5. Stamps the platform and application attributes.
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
- `session.id`, `fusescope.rum.platform` and `fusescope.rum.view.route` are promoted to selected fields, which gives them their own materialized column for fast filters and grouping.
- **Rollups only when measured.** If the sessions list or vitals percentiles are too slow on realistic data, add `rum_sessions` and `rum_vitals_1m` aggregating MVs. They would be added in the collector migrator, the schema owner, as a separate decision.

### 6. Symbolication

- Customers upload artifacts per application and release: browser source maps, Android R8/ProGuard mappings, iOS dSYMs.
- Artifacts are uploaded through an API or CLI, and through bundler and Gradle plugins later.
- Stack traces are symbolicated **at read time** in the backend. Stored telemetry stays raw.
- Artifacts are stored on the filesystem or object storage, with metadata in the metastore.

### 7. Distribution

- **Official registries with provenance:** npm `@fusescope/*` with npm provenance (Sigstore), Maven Central, Swift Package Manager, and pub.dev later.
- **Release artifacts:** every release ships an SBOM, a licence scan (CI fails on GPL, AGPL or SSPL in the dependency tree) and a CVE scan.
- **Versioned, immutable CDN for the web snippet:** `…/browser/v1.4.0/fusescope.min.js`, with SRI hashes published in the docs.
- **The backend also serves the bundle it was released with** at `/rum/sdk/browser/v1.4.0.js`. Air-gapped and self-hosted users then never depend on an external CDN, and get the version that matches their server.
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
| **0 · Spike** (≈1 week) | `@fusescope/browser` prototype on HotROD's frontend; measure bundle size and query cost of the sessions list on traces/logs | bundle ≤ 35 KB gzip; sessions list p95 < 2 s on 7 days of demo data; this ADR accepted or amended |
| **1 · Web MVP** | browser distro 0.x on npm, RUM gateway, applications and keys, Setup and Applications screens, browser→backend trace link | a sample React app is visible end to end, including the trace link |
| **2 · Web complete** | Views, Errors and Sessions screens; source maps; RUM alerts (vitals and error-rate thresholds through existing alert rules); React router integration; CDN and backend-served bundle with SRI | a beginner can instrument an app from the docs alone |
| **3 · Android** | `io.fusescope:android` on Maven Central, crashes, ANRs, app start, R8 mappings | crash grouped and symbolicated in the Errors screen |
| **4 · iOS** | SwiftPM package, crashes, app start, dSYMs | same as Android |
| **5 · Cross-platform** | React Native, Flutter, as demand appears | — |
| **Later** | session replay, if accepted; rollup MVs, if phase 0 or 2 shows they are needed | — |

## Open decisions

| # | Question | Recommendation |
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
