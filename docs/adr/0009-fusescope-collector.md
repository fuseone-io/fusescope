# 0009 · FuseScope collector: our own Apache-2.0 distribution

- Status: proposed; amended 2026-11-01: ClickHouse exporters are written before the storage gate (§2), naming (§1)
- Issue: [#230](https://github.com/fuseone-io/fusescope/issues/230)
- Deciders: FuseOne maintainers. A new repo, its licence, the chart topology and a multi-quarter migration off the AGPL fork.
- Related: [ADR 0001](0001-agpl-collector-dependency.md) (backend links no collector code), [ADR 0003](0003-real-user-monitoring.md) (RUM), ADR 0007 (cost, [#207](https://github.com/fuseone-io/fusescope/pull/207)), ADR 0008 (profiling, [#214](https://github.com/fuseone-io/fusescope/pull/214)), ADR 0010 (single ingress), [fusescope-otel-collector#3](https://github.com/fuseone-io/fusescope-otel-collector/issues/3) (OTel upgrade).

## Context

`fuseone-io/fusescope-otel-collector` is a fork of `signoz-otel-collector`, AGPL-3.0, on `otelcol` v0.144.0. Most of its code is SigNoz contributors' work, so we cannot relicense it. Two problems follow:

- **Everything we add to it is AGPL forever.** ADRs 0007 and 0008 put new work there (cost migrations, profile receivers, an ingestion-auth extension, a profiles exporter), and ADR 0010 adds the RUM gateway and ingestion keys. Each would be born AGPL and stay so, whatever we decide later.
- **Upgrading OTel is a fork rebase.** The fork vendors SigNoz components against one `otelcol` line; moving past v0.144.0 ([fusescope-otel-collector#3](https://github.com/fuseone-io/fusescope-otel-collector/issues/3)) means porting them to every changed API.

ADR 0001 made the backend binary MIT-only and left the collector as a separate AGPL program, noting that an AGPL-free collector would be "a clean-room rewrite … built as an OCB distribution on contrib … a future ADR". This is that ADR.

Facts, from the fork's `go.mod`, component directories and config only (no source was read):

- **Our own components** (SigNoz-derived): exporters `clickhouselogsexporter`, `clickhousetracesexporter`, `metadataexporter`, `signozclickhousemeter`, `signozclickhousemetrics`, `signozkafkaexporter`; processors `signozllmpricingprocessor`, `signozlogsnormalizerprocessor`, `signozlogspipelineprocessor`, `signozspanmapperprocessor`, `signozspanmetricsprocessor`, `signoztailsampler`, `signoztransformprocessor`; receivers `clickhousesystemtablesreceiver`, `httplogreceiver`, `signozawsfirehosereceiver`, `signozkafkareceiver`; connector `signozmeterconnector`; a copy of `healthcheckextension`; the schema migrator (`cmd/signozschemamigrator`); an in-process OpAMP client (`opamp/`, `signozcol/`).
- **Everything else is upstream contrib** (Apache-2.0), linked as modules: about 130 receivers, processors, exporters, connectors and extensions, including `tailsamplingprocessor`, `transformprocessor`, `kafkaexporter`/`kafkareceiver`, `awsfirehosereceiver`, `pprofreceiver`, `opampcustommessages`.
- **What the backend relies on** is a contract, not code: the ClickHouse schema (`signoz_traces`, `signoz_logs`, `signoz_metrics`, `signoz_metadata`, `signoz_meter`, `signoz_analytics`, `signoz_audit`) read with our own SQL and descriptors, and the collector config the backend pushes over OpAMP (`pkg/query-service/app/opamp`, port 4320): processors `signozlogspipeline/pipeline_*`, `signozlogsnormalizer`, `signozspanmapper` and `signozllmpricing` for the `log_pipelines`, `span_attr_mapping` and `llm_pricing` features.
- **We already have clean-room specs of two processors.** ADR 0001 phase 3 built MIT, in-process simulators of the logs pipeline and span mapper processors on contrib `pkg/stanza`, and the `simulatorcontract` suite keeps them identical to the fork on a golden corpus. `schemacontract` compares our descriptors with the tables the migrator creates.
- **ClickHouse may not be the long-term store.** `fusescope-engine`, an experimental Rust/DataFusion replacement that is tenant-native, aims at about 90 % of ClickHouse performance. Whether it ships decides whether the ClickHouse exporters are worth rewriting.

## Decision

### 1. A new distribution, `fusescope-collector`, Apache-2.0

- **Naming.** The product, binary and image are `fusescope-collector`; its repository is `fuseone-io/fusescope-collector-server`. Elsewhere in the ADRs, `fusescope-collector` means the distribution and `fusescope-collector-server` the repo.
- An **OCB distribution** (`builder-config.yaml`) of upstream core and contrib at one pinned release, plus our own components under `receiver/`, `processor/`, `exporter/`, `extension/` and `connector/`, each its own Go module. Upgrading OTel is a version bump in the manifest and a fix-up of our components, not a rebase.
- **Every new collector component is written there**, never in the fork: `ingestauth`, the RUM receiver, the artifact upload receiver (ADR 0010), `pyroscopereceiver`, `debuginforeceiver` and `clickhouseprofilesexporter` (ADR 0008), and anything later. The fork takes only security fixes and what keeps it running until it is retired.
- **New databases get an Apache-2.0 migrator** (decided) in the same repo, starting with `signoz_profiles` (ADR 0008) and `fusescope_costs` (ADR 0007). It keeps the bookkeeping the backend already reads (`schema_migrations_v2` per database), so ADR 0007's schema check works unchanged. Existing databases stay with the fork's migrator until step 4.
- Apache-2.0, not MIT, to match upstream OTel and our SDK distributions (ADR 0003), and for its patent grant. Contrib code is linked as modules; any file we vendor keeps its header and is listed in `NOTICE`.

### 2. Strangler migration

The fork keeps writing ClickHouse while the new distribution takes over everything in front of it.

1. **Ingress tier.** The new distribution is deployed in front of the fork and is the only collector exposed. It terminates OTLP, RUM and profile ingest, authenticates keys and applies limits (ADR 0010), and forwards OTLP/gRPC to the fork, which is internal only.
2. **Replace SigNoz components one by one.** First by config: the fork already bundles contrib's tail sampling, transform and Kafka components, so pipelines switch to them before any code moves. Then processors move to the new tier, as contrib components or clean-room rewrites (table below), until the fork runs `otlp → batch → ClickHouse exporters` and nothing else.
3. **ClickHouse exporters early, storage decision later.** The ClickHouse exporters are rewritten clean-room against the schema contract now, not after the storage gate, so an existing SigNoz or FuseScope installation can leave the fork without migrating data. Traces and logs already write the same rows as the fork on every table of the parity suite (`fusescope-collector-server` `test/parity`); metrics follow. The storage gate decides the long-term store only: if `fusescope-engine` wins, the distribution adds an engine exporter, dual-writes during the migration, and keeps ClickHouse for installs that stay on it. The migrator for existing databases still moves last.
4. **Retire the fork.** It shrinks to the migrator, or disappears. When nothing of it ships, ADR 0001 is amended (below).

### 3. Component inventory

| Component | Does | Target | Step |
|---|---|---|---|
| `signoztailsampler` | tail sampling | contrib `tailsamplingprocessor` (with `loadbalancingexporter` by trace ID across replicas) | 2 |
| `signoztransformprocessor` | OTTL transforms | contrib `transformprocessor` | 2 |
| `signozkafkaexporter`, `signozkafkareceiver` | Kafka buffering | contrib `kafkaexporter`, `kafkareceiver` | 2 |
| `signozawsfirehosereceiver` | Firehose ingest | contrib `awsfirehosereceiver` | 2 |
| `httplogreceiver` | generic HTTP logs | contrib `webhookeventreceiver`, else drop | 2 |
| `healthcheckextension` (copy) | health endpoint | contrib `healthcheckv2extension` | 1 |
| OpAMP client (`opamp/`, `signozcol/`) | remote config from the backend | contrib OpAMP supervisor + `opampextension`; own client only if the spike fails (§5) | 1 |
| `signozlogspipelineprocessor` | log pipelines pushed over OpAMP | **rewrite** on contrib `pkg/stanza`, from our MIT simulator and the golden corpus | 2 |
| `signozspanmapperprocessor` | span attribute mapping | **rewrite**, from our MIT simulator | 2 |
| `signozlogsnormalizerprocessor` | log normalisation in pushed config | contrib `transformprocessor` if OTTL reproduces the corpus, else **rewrite** | 2 |
| `signozllmpricingprocessor` | LLM token cost on spans | **rewrite**, from the `llm_pricing` rule format the backend owns | 2 |
| `signozspanmetricsprocessor` | APM metrics from spans | contrib `spanmetricsconnector` if the backend's APM queries read its output, else **rewrite** as a connector | 2 |
| `signozmeterconnector` | ingest meter (`signoz.meter.*`) | contrib `countconnector`/`sumconnector` if they produce the meter series, else **rewrite** | 2 |
| `clickhousesystemtablesreceiver` | ClickHouse query log scrape | **rewrite** (small) or drop; decided with users of it | 2 |
| `clickhousetracesexporter`, `clickhouselogsexporter`, `signozclickhousemetrics`, `signozclickhousemeter`, `metadataexporter` | ClickHouse writes | **rewrite** clean-room (traces and logs done); engine exporter added after the storage gate | 2 |
| schema migrator | DDL for existing databases | **rewrite** or engine migrations, after the storage gate | 3 |
| `pkg/collectorsimulator` and the backend-only helpers | previews | drop: the backend has its own since ADR 0001 | 1 |

Component type names the backend writes into pushed config (`signozlogspipeline`, `signozspanmapper`, `signozllmpricing`, `signozlogsnormalizer`) are kept by the rewrites, so OpAMP config works against either collector; they are internal contracts, renamed only deliberately.

### 4. Clean-room rules

- Implementers work from the **backend's contracts** (reader SQL, our schema descriptors, the config our OpAMP server generates), **OTel specs**, contrib code, and **public docs**. Nobody writing a component reads the fork's or SigNoz's collector source.
- **Behaviour is specified by corpora**, as in ADR 0001: inputs, the fork's observed output, and a contract test that requires the rewrite to match. A difference becomes a new corpus case, never a look at the fork's code.
- Our MIT code (the backend simulators, the RUM gateway) may be moved into the Apache repo with its MIT notice kept.
- Commits of rewrites state that no collector source was read or copied; the `license-guard` agent reviews each PR. A CI check fails if `go list -deps` contains `fusescope-otel-collector` or `signoz-otel-collector`, or a module whose licence is not on the allowlist.

### 5. OpAMP compatibility

- The backend's OpAMP server (opamp-go, Apache-2.0) keeps working unchanged for the fork, and must work for the new distribution before step 2 moves any pushed processor.
- Phase 0 spikes the contrib **OpAMP supervisor**, which applies remote config and restarts the collector, against our server: the backend merges features into the effective config the agent reports, so it must round-trip. If it does not, we write an in-process client from the OpAMP spec.
- **Roles.** Each collector reports `fusescope.collector.role` (`ingress`, `writer`) in its agent description. The backend pushes log pipelines, span mapping and LLM pricing to the role that runs them: the fork until step 2 moves them, the new tier after. Log pipelines must never be applied twice or skipped during the switch; the switch is one backend setting, tested end to end.
- Key snapshots and RUM application config (ADR 0010) use OpAMP custom messages, which only the new distribution understands.

### 6. Schema parity

The main risk. Before any exporter rewrite ships:

- **Dual-write contract test.** The same OTLP corpus goes through the fork and the rewrite into two databases on one ClickHouse. The backend's integration suites (query range v5, traces, logs, metrics, APM, filter suggestions) run against both and must return the same results; `schemacontract` compares the DDL.
- **Shadow mode in production-like load.** The rewrite runs beside the fork on the demo, writing a shadow database, and a job diffs row counts and query results per hour before the switch.
- The integration suite takes the collector image as a parameter, so every backend PR can run against both.

### 7. Deployment

- **Chart, two tiers** while the fork exists: `fusescope-collector` as a stateless Deployment with HPA, the only collector behind the ingress or load balancer; the fork as an internal Deployment (ClusterIP) receiving OTLP/gRPC from it. Tail sampling needs trace affinity, so it runs behind a `loadbalancingexporter` keyed by trace ID.
- **Single tier** after step 4: one `fusescope-collector` Deployment; the gateway/writer split stays available by config for large installs.
- `k8s-infra` agents keep contrib images; they send to the ingress tier, or its internal listener inside the cluster (ADR 0010).
- Docker Compose and the devenv get the same two services.

### 8. Versioning and release

- Own semver from `v0.1.0`; each release records the core and contrib versions it is built from in its notes, image labels and `--version`. We follow upstream minors, at most monthly, and skip none for longer than a quarter.
- Multi-arch images on GHCR `ghcr.io/fuseone-io/fusescope-collector`, signed with cosign keyless and attested with build provenance, SPDX SBOMs on the GitHub release, like the backend's `release.yaml`.
- CI: OCB build, unit tests per component, `go-licenses` against the allowlist, `govulncheck`, and the backend integration suites against the built image.

### 9. Licence and NOTICE

- `LICENSE` Apache-2.0; `NOTICE` lists the distribution's upstream modules (OpenTelemetry Collector core and contrib) and any vendored file.
- Dependency allowlist: Apache-2.0, MIT, BSD, ISC, and **MPL-2.0 as an unmodified third-party dependency only** (contrib pulls in a few HashiCorp libraries): never vendored, copied or patched into our files, attributed in `NOTICE`, its source available from the public upstream module. This is the repo-wide policy (`CLAUDE.md`).
- No GPL, AGPL, LGPL, SSPL, BUSL (HashiCorp products after 2023), Commons-Clause or Elastic-licensed module, ever. The fork, and the AGPL Pyroscope server (ADR 0008), are never imported.

### 10. Effect on ADR 0001

- Until step 4 the fork still ships, so ADR 0001's scope stands: the backend links no collector code, and the collector we ship includes an AGPL program.
- When the fork's last component is retired, nothing we ship is AGPL. ADR 0001 is then amended: its "collector stays AGPL-3.0" consequence and the README's note about the separate AGPL collector are removed, and `make agpl-check` widens to forbid the fork in every repo. Its decision, an MIT-only backend binary, stays.
- If the fork shrinks to the migrator only, ADR 0001 is amended to say so: the only AGPL artefact is a run-once migration job.

## Resolved decisions

| # | Question | Decision |
|---|---|---|
| 1 | Who owns the schema of new databases (`signoz_profiles`, `fusescope_costs`) | the **Apache-2.0 migrator** in `fusescope-collector`; ADRs 0007 and 0008 follow |
| 2 | MPL-2.0 libraries pulled in by contrib | **allowed** as unmodified third-party dependencies only, attributed in `NOTICE` (§9) |

## Alternatives considered

| Option | Why rejected |
|---|---|
| Keep extending the fork | Every new line is AGPL forever; each OTel upgrade is a rebase of SigNoz components; buyers that reject AGPL still meet it at ingest. |
| Fork upstream `otelcol-contrib` wholesale | Same rebase problem on a larger tree, a much bigger image and attack surface, and hundreds of components we do not test. OCB gives a curated distribution without a fork. |
| Grafana Alloy (Apache-2.0) | Single-vendor governance, its own config language and fleet management; no OpAMP; our pushed pipelines would need a second config model. |
| Vector (MPL-2.0), Fluent Bit (Apache-2.0) | Not OTel collector components: no OTLP profiles, no OpAMP, logs-first, and our Go components would need porting. |
| Rewrite everything at once | Puts schema parity, log pipelines and OpAMP at risk in one release. |
| New ingest logic in the backend (as RUM did) | Contradicts ADR 0010: the backend is not an ingest surface. |

## Consequences

- No new AGPL code from today. ADR 0008's collector components and ADR 0007's cost migrations land in the Apache repo instead of the fork; both ADRs are updated to say so.
- OTel upgrades become routine; [fusescope-otel-collector#3](https://github.com/fuseone-io/fusescope-otel-collector/issues/3) is needed only for what still runs in the fork, since profiling starts on the new distribution.
- Two collectors to build, release and operate until step 4, and one more network hop on ingest.
- The fork shrinks to the migrator once its exporters and processors are replaced, whatever the storage gate decides. It is frozen except for security fixes.
- ClickHouse exporters may coexist with an engine exporter for a long time if both stores stay supported.
- `schemacontract`, `simulatorcontract` and the dual-write suite become the guard of the telemetry schema across collectors.

## Roadmap

Estimates in engineer-weeks, for one engineer familiar with the codebase.

| Phase | Scope | Repos | Estimate | Exit criteria |
|---|---|---|---|---|
| **0 · Bootstrap** | repo, OCB manifest of the components we use, CI, release (images, SBOM, cosign, provenance), `NOTICE`, licence and fork-import guards; OpAMP supervisor spike against the backend | fusescope-collector-server, fusescope (docs) | 2 | a signed release image that forwards OTLP; the supervisor receives and applies a config pushed by our OpAMP server |
| **1 · Ingress tier** | two-tier chart, Compose and devenv; health, memory limiter, size limits; contrib bearer/basic auth until `ingestauth` (ADR 0010) lands; `fusescope.collector.role`; integration suites parameterised by collector image | fusescope-collector-server, fusescope-charts, fusescope | 2–3 | the demo ingests through the new tier with the fork internal only; no ingest regression in the integration suites |
| **2a · Config swaps** | fork pipelines switch to the contrib tail sampling, transform, Kafka and Firehose components it already bundles; drop `httplogreceiver` or replace it | fusescope-charts, fusescope (pushed config) | 1–2 | demo and integration suites green on contrib components |
| **2b · Processor rewrites** | logs pipeline, span mapper, logs normaliser, LLM pricing, span metrics, meter; contract tests per component; OpAMP role switch moves pushed features to the new tier | fusescope-collector-server, fusescope | 8–10 | `simulatorcontract` and APM, meter and LLM cost suites pass against the new tier; the fork runs only ClickHouse exporters |
| **2c · ClickHouse exporters** | clean-room exporters for traces, logs, metrics and the ingest meter; parity suite against the fork on every table, in CI | fusescope-collector-server | traces and logs done; metrics 2–3 | parity identical for every signal |
| **3 · Storage gate** | decision on `fusescope-engine`; then an engine exporter with dual-write, and the clean-room migrator for existing databases with a shadow run | fusescope-collector-server, fusescope | gate; then engine exporter and migrator | dual-write suite identical for every signal; a shadow week on the demo with no diff |
| **4 · Retire the fork** | single-tier chart; archive `fusescope-otel-collector` or keep only the migrator; amend ADR 0001 | fusescope-charts, fusescope, fusescope-otel-collector | 1–2 | no AGPL image in the chart's default install |

## Open questions

- Keep the `signoz*` component type names in pushed config, or rename them with a backend change and a compatibility period?
- OpAMP: contrib supervisor (an extra process per pod) or an in-process client like the fork's?
- Criteria and date for the storage gate: what `fusescope-engine` must show, and by when.
- Which users depend on `clickhousesystemtablesreceiver` and `httplogreceiver`, and whether they can be dropped.
