# 0010 · The collector is the single ingress

- Status: proposed
- Issue: [#236](https://github.com/fuseone-io/fusescope/issues/236)
- Deciders: FuseOne maintainers. A new auth model for ingest, a move of the RUM gateway, and changes to the backend, the collector, the SDKs and the chart.
- Depends on: ADR 0009 ([#222](https://github.com/fuseone-io/fusescope/pull/222)), FuseScope collector distribution; every component here lives in `fusescope-collector` (Apache-2.0).
- Amends: [ADR 0003](0003-real-user-monitoring.md) decisions 3, 4 and 6. Related: ADR 0006 ([#200](https://github.com/fuseone-io/fusescope/pull/200)), ADR 0007 ([#207](https://github.com/fuseone-io/fusescope/pull/207)), ADR 0008 ([#214](https://github.com/fuseone-io/fusescope/pull/214)), [#178](https://github.com/fuseone-io/fusescope/issues/178), [#182](https://github.com/fuseone-io/fusescope/issues/182).

## Context

Telemetry reaches FuseScope through two front doors today, and neither authenticates every signal.

Code was read on `main` at `ef3cc1b09`, charts at `fusescope-charts` `main`.

- **The collector** receives OTLP. The chart exposes it through an ingress with no authenticator. `k8s-infra` agents send a `signoz-ingestion-key` header that nothing checks.
- **The backend** serves the RUM gateway (`pkg/modules/rumapplication/implrumapplication`) on its public HTTP port:
  - `POST /rum/v1/{traces,logs}`, OTLP/HTTP JSON or protobuf; the key in `FuseScope-RUM-Key` or `?fusescope_rum_key=`;
  - public `rum_pub_…` keys, SHA-256 hashed in `rum_application_key`, looked up per request with a 30 s cache;
  - CORS from the application's origins, or Android package names; token buckets per key (500/s, burst 1000) and per key and client IP (20/s, burst 60); 4 MiB body limit before and after gzip;
  - PII scrubbing, platform and application stamping, `event.name` copy and Android event normalisation, then a forward to `rum.collector_endpoint`;
  - a setup status kept in memory by whichever backend replica answered;
  - the browser bundle, unauthenticated, at `/rum/v1/sdk/browser/{version}/fusescope.min.js`.
- **Symbol uploads** go to the backend's management API: `POST /api/v1/rum/applications/{id}/sourcemaps` and `/mappings` (R8), with an editor or admin credential. They are CI uploads.
- **Ingestion keys** exist as a gateway interface, but the community build implements it with a no-op that returns 501.
- **OpAMP.** Collectors connect to the backend's OpAMP server on an internal port (4320), which pushes log pipelines, span mapping and LLM pricing.
- **Other ADRs point the same way.** ADR 0008 puts all profile and debug-file ingest on the collector behind an `ingestauth` extension fed over OpAMP, and leaves the RUM gateway as an open question. ADR 0006 proposes a synthetics gateway in the backend. ADR 0009 creates the Apache-2.0 collector where new ingest code goes.

Two front doors mean two places to rate-limit, two auth models, a backend that must be reachable from every browser and CI runner, and an API server that shares its process with untrusted, bursty traffic.

## Decision

### 1. Only the collector is exposed for ingestion

| Surface | Exposed to the internet | Who |
|---|---|---|
| `fusescope-collector` public listener: OTLP gRPC and HTTP, RUM, Pyroscope, artifact uploads | yes | SDKs, agents, browsers, apps, CI |
| `fusescope-collector` internal listener (ClusterIP) | no | in-cluster agents, the backend's own telemetry |
| backend UI and management API | operator's choice (VPN, SSO, public) | people, automation with API keys |
| backend internal listener: OpAMP (4320), artifact intake | no | collectors only |

The backend serves no ingest route on a public path from the release that moves RUM (§8). Anonymous, non-ingest routes that stay on the backend, such as public dashboards, are rate-limited on their own ([#178](https://github.com/fuseone-io/fusescope/issues/178)).

### 2. Ingestion keys for every signal

Managed in the backend, enforced in the collector. Built clean-room from this ADR and the OTel and OpAMP specs; never from SigNoz's enterprise gateway or `ee/` code.

| | Secret key | Public key |
|---|---|---|
| Format | `fs_ing_` + 20 random bytes, base32 | `rum_pub_` + 20 random bytes, base32 (unchanged) |
| For | servers, agents, collectors, CI | browsers and mobile apps; safe to ship in a bundle |
| Signals | any of `traces`, `metrics`, `logs`, `profiles`, `artifacts` | RUM traces and logs, on the RUM routes only |
| Bound to | an organisation | a RUM application: its origins or package names, platform and PII policy |
| Presented as | `Authorization: Bearer`, `signoz-ingestion-key`, `SigNoz-Api-Key`, Basic password (Pyroscope); gRPC metadata alike | `FuseScope-RUM-Key` or `?fusescope_rum_key=` |

- **Storage.** A new `ingestion_key` table on SQLite and PostgreSQL: org, name, kind, signals, expiry, status (`active`, `expiring`, `revoked`), rate limit, created and last-used. Only the SHA-256 of a key is stored, which is enough for 160 random bits; the key is shown once. RUM keys stay in `rum_application_key` and are published in the same snapshot.
- **Rotation** with an overlap (1 h, 24 h, 7 d), as RUM keys do today; revocation is immediate in the backend.
- **API and UI.** Settings → Ingestion keys, with the existing ingestion-key permissions; the community gateway implementation replaces the 501 no-op.

### 3. Distribution over OpAMP

- The backend sends each collector of the `ingress` role (ADR 0009 §5) a **snapshot**: a version, and for each usable key its hash, ID, org, kind, signals, expiry and limit, plus the RUM applications' origins, package names, platform and PII policy.
- It travels as an **OpAMP custom message** (`io.fuseone.fusescope.ingest.v1`), not in the remote config YAML, so a key change does not reload pipelines and no hash lands in the effective config the collector reports.
- A change in the backend pushes a full snapshot at once; a collector whose version is behind on its heartbeat gets one too, and every 5 minutes regardless. At 10 000 keys a snapshot is about 2 MB; deltas come only if that becomes a problem.
- **Latency.** Rotation and revocation reach every connected collector within 10 s p95. That is the bound on how long a revoked key keeps working.

### 4. `ingestauth` validates locally

A server authenticator extension in `fusescope-collector`, attached to every receiver on the public listener.

- **No per-request backend call.** It hashes the presented key and looks it up in memory; a request with a key of the wrong kind, a signal it does not allow or an expired key is refused.
- **It stamps `fusescope.ingest.key_id`** on every resource, overwriting any value the client sent, and puts the org in the request's auth data for processors and exporters. The payload never decides the org.
- **Per-key rate limits.** A token bucket per key in each replica. The backend knows how many ingress replicas are connected and sends each one its share of a key's limit. Over the limit: 429 with `Retry-After`, which OTLP exporters retry. Size limits stay per receiver.
- **Lost OpAMP connection.** The snapshot is cached on disk (hashes only) and keeps being used, so a backend outage never stops ingest. Its age is exported as a metric and shown in the UI. An optional `max_staleness` makes the collector refuse keyed requests with 503 past it; it has no default and stays off unless an operator sets it, so a revocation made during an outage takes effect when the connection returns.
- **Cold start without a snapshot.** In `enforce` mode, 503 with `Retry-After`; in the other modes, accept.

### 5. Rollout: permissive → warn → enforce

| Mode | Valid key | Missing or invalid key |
|---|---|---|
| `permissive` | accepted, stamped | accepted, counted by reason |
| `warn` | accepted, stamped | accepted, counted, sampled log, `FuseScope-Ingest-Warning` response header |
| `enforce` | accepted, stamped | 401 (missing or unknown), 403 (wrong signal, origin, kind) |

- The mode is set per listener in the chart. New installs: public listener `enforce`, internal listener `permissive`. Upgraded installs start `permissive`; `warn` becomes the upgrade default one release later, and `enforce` the release after, each announced in release notes.
- The UI lists unauthenticated sources (service, host, count) from the collector's counters, so operators can issue keys before enforcing.

### 6. The RUM gateway moves to the collector

A `rumreceiver` in `fusescope-collector` does what the backend gateway does today, with the same behaviour and tests, from the OpAMP snapshot:

- `POST /rum/v1/{traces,logs}`, same paths, headers, query parameter, encodings and body limits;
- CORS preflight and origin or package-name allowlist per application; per-key and per-client-IP buckets;
- PII scrubbing, stamping, `event.name` copy, Android normalisation; then into the collector's own pipelines, with no extra hop.

The backend gateway is our MIT code, so it is moved, not rewritten; it keeps its MIT notice in the Apache repo.

- **Setup status.** The receiver reports per application and key, every minute over OpAMP: last seen, SDK versions and refusals by reason. The backend aggregates across replicas, so the status no longer depends on which backend replica answered.
- **Browser bundle.** The receiver also serves `/rum/v1/sdk/browser/{version}/fusescope.min.js` and its map, embedded at build time, so an install that exposes only the collector can still serve the snippet. The CDN stays the default in the docs.
- **Mobile.** The Android SDK and its package-name rules are unchanged; only the base URL moves.

### 7. Symbol and artifact uploads go through the collector

Source maps, R8 mappings, dSYMs later, and ADR 0008's debug files all enter through one **`artifactreceiver`**, authenticated with a secret key that has the `artifacts` signal. It checks size limits and streams the file to the backend's **internal** artifact intake, which stores it in the artifact store and keeps quota, retention and read-time symbolication. The backend's management endpoints (list, delete, upload from the UI) stay on its API for people.

Why not keep CI uploads on the backend API, unexposed by default:

- CI runners (GitHub-hosted, GitLab SaaS) are on the internet. An unexposed backend API means self-hosted runners or a VPN for every customer, or exposing the backend anyway, which is what this ADR removes.
- Uploads today need an editor credential that can also read and change everything else. An `artifacts`-only ingestion key can do nothing but upload.
- Uploads are large and bursty at release time. They belong on the tier that scales out and has limits, not on the API server.
- ADR 0008 already chose this path for debug files; one receiver and one key model cover all artifacts.

The collector reaches the internal intake with a per-collector credential delivered over OpAMP and sends the key's org and application with each file; the intake accepts no other caller.

### 8. Migration from today's backend endpoints

There are no customers or users yet, so there is no compatibility period: RUM moves in one release.

- **One release.** The release that ships `rumreceiver` removes the backend's `/rum/v1/{traces,logs}` routes, and the one that ships `artifactreceiver` removes the public upload routes. The chart routes `/rum/v1/*` on the public host to the collector in the same release.
- **SDK configuration.** Setup screens and docs show the collector's ingestion URL (`global.ingestion_url`) as the SDK `endpoint`. `@fusescope/browser`, the Android SDK, the source map CLI and the Gradle plugin default to it.
- **Chart.** Values for the public and internal listeners, the auth mode, and the `/rum/v1` route; `signoz.rum.*` values are removed with the gateway.
- **Docs.** Setup guides point at the collector; ingestion keys and the auth modes are documented.

### 9. Multi-tenancy hook

The snapshot maps every key to an org, and the org travels in auth data through the pipeline. Today one org writes to one ClickHouse, so the org is not stored. When `fusescope-engine` arrives with tenant-native storage, the writer authenticates per org with a tenant token delivered over OpAMP; ingestion keys never reach storage.

## Relationship with other ADRs

- **ADR 0003 (RUM).** Decision 3 (gateway in the backend) is replaced by §6; decision 4 (public keys) becomes the public kind of §2; decision 6 (uploads through the API) is replaced by §7. The reasons 0003 gave for the backend are answered: keys and policies still live in the metastore and reach the collector over OpAMP; the new code is Apache-2.0, not AGPL (ADR 0009); symbolication stays in the backend. 0003 carries an amendment note.
- **ADR 0008 (profiling).** Its `ingestauth` is this one, and its open question is answered: keys cover every signal from the first release, in `permissive` mode. Its `debuginforeceiver` becomes the debug-file route of `artifactreceiver`.
- **ADR 0007 (cost).** Billing exports are pulled by the backend, not ingested, so nothing moves. `fusescope.ingest.key_id` lets the ingest meter, and later cost showback, split usage per key and team.
- **ADR 0006 (synthetics).** Runner results become ingest through the collector with a secret key scoped to the runner, instead of a backend gateway; 0006 is updated before it is accepted.
- **[#182](https://github.com/fuseone-io/fusescope/issues/182)** (RUM roadmap) tracks the SDK endpoint changes; **[#178](https://github.com/fuseone-io/fusescope/issues/178)** covers the anonymous routes that stay on the backend.

## Consequences

- One internet-facing ingest tier with one auth model, one place for limits and abuse monitoring.
- The backend can run fully private; its API no longer shares a process with untrusted traffic.
- Ingest keeps working through a backend outage, at the cost of revocations waiting for the OpAMP connection.
- RUM and uploads depend on the new collector (ADR 0009 phase 1) being deployed; there is no backend fallback.
- Every ingested resource carries the key that sent it, which supports per-key metering, debugging and abuse handling.

## Roadmap

Estimates in engineer-weeks. Phases 2–5 need ADR 0009 phases 0–1.

| Phase | Scope | Repos | Estimate | Exit criteria |
|---|---|---|---|---|
| **1 · Keys in the backend** | `ingestion_key` table (SQLite, PostgreSQL), API, Settings UI, permissions; community gateway implementation; OpAMP snapshot custom message, role targeting, heartbeat version | fusescope | 3 | keys created, rotated and revoked from the UI; a test agent receives each change within 10 s |
| **2 · `ingestauth`** | extension on every public receiver; disk cache; per-key buckets with replica shares; `fusescope.ingest.key_id`; modes and counters; chart listeners and modes | fusescope-collector-server, fusescope-charts | 3 | unknown keys refused in `enforce`; ingest continues with the backend down; revocation p95 ≤ 10 s on the demo |
| **3 · RUM in the collector** | `rumreceiver` moved from the backend gateway with its tests; status over OpAMP; bundle serving; chart routes `/rum/v1/*` to it; backend `/rum/v1/{traces,logs}` and `signoz.rum.*` removed in the same release | fusescope-collector-server, fusescope, fusescope-charts | 3 | the RUM e2e suite passes against the collector route; the backend has no RUM ingest route |
| **4 · Uploads in the collector** | `artifactreceiver` (source maps, R8, debug files); internal intake with collector credentials; CLI and Gradle plugin defaults | fusescope-collector-server, fusescope, fusescope-sdk, fusescope-sdk-android | 2–3 | a CI upload with an `artifacts` key retraces a crash; the backend upload routes are not on the public router |
| **5 · Cut-over** | SDK and docs endpoint defaults; `warn` then `enforce` defaults; ADR 0003 amendment finalised | fusescope, fusescope-sdk, fusescope-sdk-android, fusescope-charts, fusescope-docs | 1 | a default install exposes only the collector for ingest |

## Resolved decisions

| # | Question | Decision |
|---|---|---|
| 1 | Compatibility period for the backend RUM and upload routes | **none**: no customers yet, so the routes move to the collector in one release (§8) |
| 2 | Behaviour when OpAMP is lost | keep accepting with **cached keys**; `max_staleness` stays an optional knob with **no default** (§4) |

## Open questions

- Should the internal listener stay `permissive` by default for in-cluster agents, or require keys too?
- Merge `rum_application_key` into `ingestion_key`, or keep both tables behind one snapshot?
- Per-key limits as a share per replica, or a shared counter (for example Redis) when replicas are many and traffic uneven?
- Should the collector serve the browser bundle, or should self-hosted installs rely on the CDN and their own hosting?
