# 0008 · Continuous profiling

- Status: proposed
- Issue: [#20](https://github.com/fuseone-io/fusescope/issues/20)
- Deciders: FuseOne maintainers. Ingest, ClickHouse schema ownership, symbolization and UI span several PRs and repos.

## Context

FuseScope shows that a service is slow, not which code makes it slow. Continuous profiling closes that gap: always-on, low-rate sampling of CPU, memory, locks and wall time, stored per service and linked to traces. Datadog, Grafana Pyroscope, Polar Signals and Elastic all sell it.

The OpenTelemetry profiles signal is the long-term wire format, but it is not stable. Waiting for it leaves us behind, while the formats it builds on, pprof above all, have been stable for years. This ADR adds profiling now, on pprof, and keeps OTLP profiles on a forward path.

Facts the design rests on, checked 2026-10-30. Licences were read from each project's `LICENSE` file or package manifest.

- **pprof is the lingua franca.** `google/pprof`'s `profile.proto` (Apache-2.0) is what Go's `runtime/pprof` (BSD-3) writes. Every profiler below either emits it or has a converter. It already carries what we need: sample types and units, period, a string table, deduplicated `Location`/`Function`/`Mapping`, and per-sample labels.
- **OTLP profiles are alpha.** Proto `opentelemetry/proto/profiles/v1development` (proto v1.11.1, 2026-09-29) reached Public Alpha in March 2026. The collector supports it behind the `service.profilesSupport` gate; the OTLP receiver and exporter are alpha for profiles. collector-contrib has a lossless pprof ↔ OTLP translator (`pkg/translator/pprof`) and an alpha `pprofreceiver` that scrapes remote `/debug/pprof` endpoints or accepts `POST /v1/pprof`. All Apache-2.0. The backend already depends indirectly on `pdata/pprofile`.
- **eBPF whole-host profiling exists and speaks OTLP.**
  - `opentelemetry-ebpf-profiler` (donated by Elastic) unwinds native, HotSpot, Python, Ruby, PHP, Node/V8, Perl, .NET and BEAM stacks with no instrumentation, at 20 Hz by default, within stated limits of ≤ 1 % CPU and 250 MB of memory. Interpreted frames are symbolized on the host; native frames are exported as build ID plus address and need server-side symbolization.
  - Its Go code is Apache-2.0, but **`support/ebpf` (the in-kernel programs) is GPL-2.0**. It ships as a separate program, the collector distribution `otelcol-ebpf-profiler`.
  - `parca-agent` (Apache-2.0) is now built on a fork of it, sends OTLP with `--remote-store-format=otlp`, and uploads debuginfo through Parca's `DebuginfoService` (Apache-2.0 proto), which `--debuginfo-upload-disable` turns off.
- **Grafana Pyroscope's server is AGPL-3.0, its protocol is not.** The `api/` Go module (`github.com/grafana/pyroscope/api`), with `push.v1.PusherService/Push` over Connect (labels plus raw pprof bytes per series), is Apache-2.0. The legacy `POST /ingest` (`name=app.cpu{k=v}`, `from`, `until`, `format=pprof|jfr|folded|lines`) is publicly documented. Pyroscope's language SDKs and Grafana Alloy, which scrapes `/debug/pprof` and pushes, are Apache-2.0. Parca's server, protos and UI are Apache-2.0.
- **Prior art for ClickHouse storage.**
  - Coroot (Apache-2.0) keeps a `ReplacingMergeTree` of stacks keyed by `(ServiceName, Hash)`, with FNV-64a over the frame strings, and a `MergeTree` of samples `(ServiceName, Type, Start, End, Labels, StackHash, Value)`. Over 7 days for a few dozen services it holds 924 M samples in 6.19 GiB (≈ 7 B per sample) plus 932 MiB of stacks, and draws a 1-hour flame graph in 0.46 s.
  - collector-contrib's `clickhouseexporter` stores profiles denormalized (one row per sample with frame arrays) at development stability.
  - Pyroscope (Parquet plus a symbol database) and Elastic (deduplicated stack indices plus downsampled event indices, about 40 MB per core per day at 20 Hz) dedupe stacks the same way. qryn (AGPL) and Elastic (Elastic License) are cited for ideas only.
- **Size of the input.** Measured locally with a Go service at 100 Hz, gzipped pprof:

  | Workload | 15 s profile | 60 s profile |
  |---|---|---|
  | 2 busy cores | 34 KB | 69 KB |
  | 32 saturated cores | 103 KB | 231 KB |

  A heap profile is about 8 KB. A 2-core service pushing CPU every 15 s sends about 200 MB of raw pprof a day, before deduplication.
- **The frontend already draws a flame graph.** `pages/TraceDetailsV3/TraceFlamegraph` is a canvas renderer with its layout in a web worker, for traces.
- **Schema.** Telemetry tables are owned by the migrator in `fusescope-otel-collector` (AGPL-3.0). [ADR 0001](0001-agpl-collector-dependency.md) forbids backend imports from it, and the collector has no profiles exporter. ADR 0002 already makes one bounded exception: the backend owns the `rehydrated_*` DDL.
- **Auth.** Service accounts with API keys exist in the community build; ingestion keys are cloud-only. The RUM gateway ([ADR 0003](0003-real-user-monitoring.md)) has an artifact store for source maps and R8 mappings.

### Market

| | Datadog | Pyroscope | Polar Signals / Parca | Elastic Universal Profiling |
|---|---|---|---|---|
| Collection | language agents | SDKs, Alloy scrape, eBPF | eBPF agent, 19–20 Hz | eBPF agent, 20 Hz |
| Profile types | CPU, wall, alloc, heap, lock, I/O, exceptions | CPU, alloc, inuse, lock, block, goroutine, wall | CPU (on-CPU) | CPU (on-CPU) |
| Upload | every 60 s | every 15 s (Go, 100 Hz) | — | — |
| Trace link | code hotspots and endpoint profiling via span labels | span profiles via `span_id` labels | — | via APM correlation |
| Compare | comparison view | diff flame graph | compare view | differential flame graph, top functions |
| Symbols | in profile | in profile | debuginfod and upload | symbolizer service, debuginfod |
| Retention | 8 days | configurable | configurable | configurable |

Diff views, a flame graph with a top-functions table, and span links are table stakes. Code hotspots (CPU per span and endpoint) is the feature that ties profiling to APM.

## Goals

- Profiling on today's formats, with no wait for OTLP profiles to stabilise, and no lock-in: any pprof or OTLP profiles producer works.
- Profiles per service, type, labels and time, linked to traces and spans.
- Whole-host profiling without code changes, with native symbols.
- MIT backend and UI; separate-process agents permissive, or justified below.

Non-goals for now: profile-based alerting, continuous profiling of browsers and mobile apps, and storing raw pprof for download (a profile is rebuilt from storage on export).

## Decisions

### 1. Ingest surfaces

All under the backend, behind ingestion auth (decision 2), with size limits and per-key rate limits as in the RUM gateway. Every surface normalises to one internal model (decision 3) before anything is written.

| Surface | Wire | Who sends it | Phase |
|---|---|---|---|
| `POST /profiles/ingest` | Pyroscope-compatible legacy ingest: `format=pprof` (gzip protobuf, raw or multipart), `name=<service>.<type>{labels}`, `from`, `until`, `sampleRate`, `spyName` | Pyroscope SDKs (Go, Python, Ruby, .NET, Node, Rust) unchanged, `curl`, our own tooling | 1 |
| `POST /profiles/push.v1.PusherService/Push` | Connect, protos from the Apache-2.0 `pyroscope/api` module | Grafana Alloy `pyroscope.scrape` + `pyroscope.write` (pull of `/debug/pprof`), Pyroscope SDKs in push mode | 1 |
| `POST /profiles/v1development/profiles` | OTLP/HTTP profiles, protobuf | collector `otlphttp` exporter, contrib `pprofreceiver` (scrape), `otelcol-ebpf-profiler`, async-profiler OTLP | 2 |
| OTLP/gRPC `ProfilesService/Export` on a dedicated port | OTLP/gRPC profiles | `parca-agent --remote-store-format=otlp`, OTel collectors over gRPC | 2 |
| `parca.debuginfo.v1alpha1.DebuginfoService` on the same gRPC port | Parca debuginfo upload | `parca-agent` symbol upload, unchanged | 2 |
| `format=jfr` on `/profiles/ingest` | JFR, parsed with `grafana/jfr-parser` (Apache-2.0) | Pyroscope Java SDK (async-profiler) | 5 |

- **No Parca `ProfileStoreService`.** `parca-agent` already sends OTLP, so a second eBPF wire format buys nothing.
- **Pull is done by an agent, not the backend.** Scraping `/debug/pprof` needs service discovery, which Alloy and the collector already have. The docs ship a recipe for each. The backend stays push-only.
- **OTLP profiles on a forward path.** We follow upstream's `v1development` with the `pdata/pprofile` version the backend pins, and keep the conversion in one package. When the signal becomes beta or stable we add the stable path next to it and drop `v1development` one release later (phase 6). pprof surfaces stay.
- **Compatibility is clean-room.** The Pyroscope-compatible endpoints are written from the public HTTP API docs, the Apache-2.0 protos and requests captured from the Apache-2.0 SDKs. Nobody reads Pyroscope's AGPL server code. Integration tests use the real SDKs and Alloy as clients.

### 2. Ingestion auth

- Senders authenticate with a **service-account API key** that holds a new **`profiles:write`** permission. It is accepted as `SigNoz-Api-Key`, as `Authorization: Bearer <key>` (Pyroscope `AuthToken`, Alloy, parca-agent `--remote-store-bearer-token`, collector headers), or as the password of HTTP Basic (Pyroscope `BasicAuth`). gRPC reads the same values from metadata.
- The key decides the organisation; the payload cannot. Unauthenticated ingest is not offered.
- Limits per key: request size (16 MiB default, before and after gzip), requests per second, and samples per profile. Over a limit the response is 413 or 429, never a partial write.
- Cloud ingestion keys, when they exist in the community build, will be accepted too.

### 3. Storage in ClickHouse

**Model.** A profile is split into a dictionary (mappings, functions, locations and stacks, deduplicated) and a fact table of samples. A sample row is one stack's value for one series in one profile window.

**Tables** in a new database `fusescope_profiles`:

| Table | Engine | Key | Holds |
|---|---|---|---|
| `mappings` | ReplacingMergeTree(`last_seen`) | `(service_name, mapping_id)` | build ID, file name, memory range, whether it has symbols |
| `functions` | ReplacingMergeTree(`last_seen`) | `(service_name, function_id)` | name, system name, file name, start line |
| `locations` | ReplacingMergeTree(`last_seen`) | `(service_name, location_id)` | mapping ID, address, `Array(Tuple(function_id, line))` for inlined frames |
| `stacks` | ReplacingMergeTree(`last_seen`) | `(service_name, stack_id)` | `Array(UInt64)` of location IDs, leaf first |
| `samples` | MergeTree | `(service_name, profile_type, series_id, timestamp)` | timestamp, duration, `profile_type`, `sample_type`, `sample_unit`, `period_type`, `period`, `series_id`, `labels Map(LowCardinality(String), String)`, `trace_id`, `span_id`, `stack_id`, `value Int64` |
| `series` | ReplacingMergeTree(`last_seen`) | `(service_name, profile_type, series_id)` | the label set of each series, for label browsing and filter suggestions |
| `symbols` | ReplacingMergeTree(`resolved_at`) | `(build_id, address)` | native symbolization results (decision 4) |

- **IDs are content hashes** (64-bit xxh3) computed in the backend: a function from its fields, a location from its mapping and address or lines, a stack from its location IDs, a series from service, type and sorted labels. Identical rows from different profiles collapse in the Replacing tables, and the writer keeps an LRU of IDs it has written recently so dictionaries are not resent with every profile. Hashes are scoped by service; a collision costs a wrong frame in one service, not corruption.
- **Samples** are aggregated within a profile by `(series, labels, stack)` before insert. `samples` is `PARTITION BY toDate(timestamp)`, `ORDER BY (service_name, profile_type, series_id, timestamp)`, with a bloom-filter index on `span_id` and `trace_id` and `ttl_only_drop_parts=1`.
- **Labels.** Resource attributes (`service.name`, `service.version`, `deployment.environment.name`, `host.name`, `k8s.*`) and pprof sample labels go into `labels`. `span_id` and `trace_id` are lifted into columns, because their cardinality would explode series. A per-key cap on distinct label keys and values protects the series table; labels beyond it are dropped and counted.
- **Cumulative and gauge types.** Go's alloc, mutex and block profiles are cumulative since process start; SDKs and Alloy send deltas (`/debug/pprof/allocs?seconds=N`); the backend stores deltas only, and the scrape recipes request them. In-use heap is a gauge: queries average it over time instead of summing.
- **Retention.** Profiles become a fourth signal in the retention module and settings page, **7 days by default**. Dictionary tables expire by `last_seen` with a margin of one day over the samples, so a stack is never dropped while samples reference it. Cold storage ([ADR 0004](0004-cold-storage-on-object-storage.md)) and archive ([ADR 0002](0002-long-term-archive.md)) can add profiles later.
- **Rollups only when measured**, as for RUM. If a 24-hour flame graph misses its target (decision 5), add an aggregating `samples_1m` MV that drops labels and span IDs.

**Who writes.** The backend writes these tables directly, in batches (flush at 1 s or 50 000 rows, bounded memory, 429 when full). The collector has no profiles exporter, the contrib exporter's layout is denormalised and at development stability, and writing in the backend keeps new code out of the AGPL collector. The ingest module is stateless apart from the batch buffer and can become its own binary when volume requires it, like the RUM gateway.

**Who owns the DDL.** The backend, in a small versioned ClickHouse migrator of its own for `fusescope_profiles`. This is a second exception to the CLAUDE.md rule that the collector's migrator owns the telemetry schema (after ADR 0002's `rehydrated_*`), recorded there if accepted, with these bounds:

- The backend migrator creates and alters objects only in `fusescope_profiles`; one guard function refuses any other database.
- Its version table lives in that database. Migrations are idempotent, run `ON CLUSTER` with `Replicated*` engines and `Distributed` tables when a cluster is configured, as the collector's migrator does, and are written from the ClickHouse docs, not from the migrator source.
- Golden tests pin the DDL; integration tests run it on the single-node and cluster setups CI already has.
- Identifiers and literals built from input go through `pkg/clickhousesql`.

The alternative, profile tables in the collector's migrator, puts every profiles schema change behind an AGPL collector release and duplicates descriptors across repos for a signal only the backend writes and reads.

### 4. Symbolization

| Source | Symbols | Work |
|---|---|---|
| Go, Java (async-profiler, JFR), Python, Ruby, Node, .NET SDKs | in the profile | none |
| eBPF, interpreted frames (Python, Ruby, PHP, Node, HotSpot, .NET, BEAM, Perl) | symbolized on the host by the agent | none |
| eBPF and native profilers, native frames (C, C++, Rust, Go, the JVM itself) | build ID plus address | server side |

- **At read time, cached.** Native frames are stored raw. When a query meets unsymbolized locations among the stacks it returns, the symbolizer resolves them in a batch per build ID and writes the results to `symbols`, so each address is resolved once. Stored samples never change, and debuginfo uploaded later fixes earlier profiles too.
- **Sources, in order:** debuginfo uploaded by build ID, through `POST /api/v1/profiles/debuginfo/{build_id}`, a CLI, or parca-agent's `DebuginfoService`; then configured **debuginfod** servers (`/buildid/<id>/debuginfo` and `/executable`). The debuginfod client is ours; elfutils (GPL/LGPL) is not linked. Public debuginfod is **off by default**, because it sends build IDs out and fails air-gapped.
- **Parsing** uses Go's `debug/elf`, `debug/dwarf` and `debug/gosym` (BSD-3), with `.symtab` and `.dynsym` as a fallback when DWARF is stripped and `gopclntab` for Go binaries.
- **Artifacts reuse the RUM store.** The source map store becomes a shared artifact store, with a `debuginfo` kind keyed by build ID instead of release, under its own size limit (debuginfo is often hundreds of MB), quota and retention. A build ID absent from all sources shows the frame as `<module>+0x<offset>`, and the UI lists the missing build IDs.

### 5. Query and UI

**API.** One query module over `fusescope_profiles`:

- `profile types` and `label names/values` for a service and range;
- a **timeline**: the total value of a type over time;
- a **flame graph**: `sum(value)` (or `avg` for gauges) grouped by `stack_id` under the filters, stacks and locations fetched for the result, the tree built in the backend and pruned to a node budget (16 384 by default) with the remainder kept as "other";
- a **top table**: self and total per function;
- a **diff**: two selections (baseline and comparison; different ranges, label sets such as `service.version`, or both) built into one tree with both values per node, normalised by each side's total;
- **export** as pprof, rebuilt from storage, so `go tool pprof` and speedscope open it.

Targets: 1-hour flame graph for one service ≤ 1 s p95, 24 hours ≤ 3 s, on the phase 1 dataset.

**UI.** A **Profiles** section:

- **Explorer.** Service, profile type, label filter and time range; timeline on top (drag to select a range); flame graph and top table side by side, with search, focus on a frame and "sandwich" (callers and callees of a function).
- **Compare.** Two selections, a diff flame graph coloured by relative change, and a top table sorted by change.
- **Entry points.** A *Profiles* tab on the service page, and on spans that have one (decision 6).
- **Setup.** Service-account key, per-language snippets, the Alloy and collector scrape recipes, the eBPF agent DaemonSet, and debuginfo upload with missing build IDs.

**Flame graph component.** Our own canvas component, grown from the trace flame graph's renderer and worker. `@grafana/flamegraph` is Apache-2.0, but 13.3 requires React 19 and pulls `@grafana/ui` and Emotion, while the frontend is on React 18.2 with shadcn/ui and Tailwind. `d3-flame-graph` (Apache-2.0, SVG) is the fallback if the canvas work stalls. speedscope (MIT) is a standalone app; we support it through pprof export, not by embedding it. New screens get Claude Design boards first, as in the rest of the redesign.

### 6. Trace-to-profile links

- **Convention.** CPU and wall samples carry pprof labels `span_id` and `trace_id` of the **local root span** that was active, hex-encoded as in OTLP. Only those types carry them, because runtimes attach labels only where the sampled goroutine or thread is known.
- **Go.** `grafana/otel-profiling-go` (Apache-2.0) wraps the `TracerProvider` and calls `pprof.Do` with `span_id` and `trace_id` on each local root span; it also sets the span attribute `pyroscope.profile.id`. We document it with the Pyroscope Go SDK, and a plain `pprof.Do(ctx, pprof.Labels("span_id", …, "trace_id", …), …)` works the same.
- **Other runtimes.** Pyroscope's OTel integrations for Java, .NET, Python and Ruby set the same labels; phase 3 verifies each one's licence and wire output before we document it.
- **UI.** On a span whose service has CPU profiles: a *Profile* tab with the flame graph of samples where `span_id` is the span's local root and the time is within the span. The service page aggregates by endpoint through the local root span's name (code hotspots).
- **eBPF.** The agent sees no span context today. OTEP 4719 (process context) and OTEP 4947 (thread context, `otel_thread_ctx_v1`) are merged but have no shipped implementation, and profiler support is a work-in-progress PR. We adopt them when they ship; until then eBPF profiles link to traces by service, host and time only.

### 7. SDKs and agents we recommend

Consistent with our SDK policy: **use upstream, homologate, and add thin distros only where needed.** We publish no profiler of our own.

| Runtime | Recommended | Licence | Wire to FuseScope |
|---|---|---|---|
| Go | Pyroscope Go SDK (`grafana/pyroscope-go`) + `otel-profiling-go`; or Alloy/collector scraping `net/http/pprof` | Apache-2.0; BSD-3 | `/profiles/ingest`, Push |
| Java | Pyroscope Java SDK (async-profiler inside); or async-profiler's OTLP output | Apache-2.0 | JFR on `/profiles/ingest` (phase 5); OTLP |
| Python | Pyroscope Python SDK (`pyroscope-io`) | Apache-2.0 | `/profiles/ingest` |
| Node | `@pyroscope/nodejs` (built on `@datadog/pprof`) | Apache-2.0 | `/profiles/ingest` |
| .NET | `pyroscope-dotnet` | Apache-2.0 | `/profiles/ingest` |
| Ruby | Pyroscope Ruby gem; rbspy (MIT) for ad-hoc pprof | Apache-2.0 | `/profiles/ingest` |
| Rust | `pprof-rs` with the Pyroscope Rust SDK | Apache-2.0 | `/profiles/ingest` |
| Any, no code change | `otelcol-ebpf-profiler` or `parca-agent` as a DaemonSet | Apache-2.0, eBPF programs GPL-2.0 | OTLP |

- **Excluded:** Austin (GPL-3.0). py-spy (MIT) has no pprof output and stays an ad-hoc tool.
- **Homologation.** The SDK homologation matrix gains the profiler SDKs and agents above, with a sample app per language in `fusescope-sdk` CI that pushes to a real backend and checks the flame graph.
- **Distros only where they remove real friction.** The planned Java agent extension and `@fusescope/node` distro can enable profiling with FuseScope defaults (endpoint, key, `service.name` from the OTel resource, span labels on). That happens in phase 5, in those distros, not as separate profiling packages.

### 8. Overhead, sampling and cost

| | Target | Default |
|---|---|---|
| In-process SDKs | ≤ 1 % CPU at the default rate, ≤ 2 % with every type on | CPU at 100 Hz (Go and Pyroscope SDK default), alloc sampling at runtime default (Go: 512 KiB), mutex and block off unless enabled; upload every 15 s |
| JVM | ≤ 1 % with JFR `default.jfc`; `profile.jfc` measured at about 2 % | async-profiler CPU (itimer) at 100 Hz, alloc at 512 KiB |
| eBPF agent | ≤ 1 % CPU, ≤ 250 MB RSS per host | 20 Hz per CPU |
| Backend ingest | ≤ 1 core per 10 000 profiles/min, measured in phase 1 | — |

**Storage, estimated** from Coroot's ≈ 7 B per sample row plus about 15 % for dictionaries, and to be replaced by phase 1 measurements:

| Source | Raw input / day | Stored / day | 7-day retention |
|---|---|---|---|
| One 2-core Go instance, CPU every 15 s | ~200 MB pprof | ~40–60 MB | ~0.3–0.4 GB |
| Same, CPU + alloc + inuse + goroutine | ~260 MB | ~80–120 MB | ~0.6–0.8 GB |
| One 8-core host, eBPF at 20 Hz, busy | — | ~150–300 MB (Elastic reports ~40 MB per core) | ~1–2 GB |

The spread is the number of distinct stacks per window, which only a real workload pins down.

## Licence posture

| Component | Licence | How we use it |
|---|---|---|
| `google/pprof` (`profile` package) | Apache-2.0 | linked: parse, merge, export |
| Go `runtime/pprof`, `net/http/pprof`, `debug/elf`, `debug/dwarf`, `debug/gosym` | BSD-3 | stdlib |
| `go.opentelemetry.io/collector/pdata/pprofile`, contrib `pkg/translator/pprof` | Apache-2.0 | linked: OTLP profiles |
| `github.com/grafana/pyroscope/api` | Apache-2.0 | linked: Push protos only |
| Parca `proto/` (`DebuginfoService`) | Apache-2.0 | generated stubs, attributed in `NOTICE` |
| `grafana/jfr-parser` | Apache-2.0 | linked, phase 5 |
| `google.golang.org/grpc` | Apache-2.0 | linked: gRPC port |
| Pyroscope server | **AGPL-3.0** | not linked, not read; API reimplemented from docs and Apache-2.0 protos |
| `opentelemetry-ebpf-profiler` / `parca-agent` userspace | Apache-2.0 | separate process |
| their eBPF programs (`support/ebpf`) | **GPL-2.0** | separate process, loaded into the kernel by the agent |
| Pyroscope SDKs, Alloy, async-profiler, `@datadog/pprof`, `pprof-rs`, `otel-profiling-go` | Apache-2.0 | customer side |
| rbspy, py-spy, speedscope, `dotnet-trace` | MIT | customer side or docs |
| `d3-flame-graph`, `@grafana/flamegraph` | Apache-2.0 | not adopted (decision 5) |
| Austin | GPL-3.0 | excluded |
| elfutils / debuginfod | GPL/LGPL | not linked; HTTP protocol only |
| qryn (AGPL-3.0), Elastic (Elastic License) | — | ideas only, no code |

**Why the GPL-2.0 eBPF programs are acceptable.** They are not part of any FuseScope binary or image: they run inside the kernel, loaded by an agent that is a separate program talking to us over OTLP. Linux requires GPL-compatible eBPF programs for the helpers profilers need, so every eBPF profiler is in this position. The charts reference the upstream agent images and do not rebuild them, so the source offer is upstream's. If we ever ship our own agent image, it must carry the GPL-2.0 source offer for those objects. The guard against AGPL imports gains a rule refusing `github.com/grafana/pyroscope` packages other than `api/...`.

## Roadmap

Each phase ships behind a feature flag and ends with docs and integration or e2e tests on SQLite and PostgreSQL where it touches the metastore.

| Phase | Scope | Repos | Exit criteria |
|---|---|---|---|
| **1 · pprof MVP (Go)** | `fusescope_profiles` migrator and tables; `profiles:write`; `/profiles/ingest` (pprof) and Push; batched writer; retention signal; explorer with timeline, flame graph and top table; Alloy and collector scrape recipes; pprof export | backend, frontend, charts, docs | a Go service with the Pyroscope SDK and one scraped through Alloy appear in the explorer; 1 h flame graph ≤ 1 s p95; storage per instance measured and this ADR amended |
| **2 · eBPF and symbols** | OTLP/HTTP and OTLP/gRPC profiles; `DebuginfoService`; debuginfo upload API and CLI; debuginfod client; read-time symbolizer with `symbols`; shared artifact store; optional agent DaemonSet in charts | backend, charts, docs | `parca-agent` and `otelcol-ebpf-profiler` run unmodified on a kind cluster; a stripped C++ binary symbolizes from an upload and from debuginfod; overhead on the demo host ≤ 1 % |
| **3 · Trace links** | `span_id`/`trace_id` columns and filters; span *Profile* tab; code hotspots on the service page; Go guide with `otel-profiling-go`; licence and output check of the other runtimes' OTel integrations | backend, frontend, docs | from a HotROD trace, the span's CPU flame graph opens; hotspots per endpoint on the service page |
| **4 · Compare** | diff API and diff flame graph; compare by range, labels and `service.version` | backend, frontend | a regression injected between two versions of a sample app is the top changed frame |
| **5 · Other languages** | JFR ingest; guides for Java, Python, Node, .NET, Ruby; homologation matrix and CI sample apps; profiling in the Java and Node distros | backend, sdk, docs | each runtime's sample app shows CPU and alloc profiles in CI against a release build |
| **6 · OTLP profiles stable** | add the stable OTLP path, then drop `v1development` a release later; make OTLP the recommended wire where SDKs support it; adopt process and thread context for eBPF span links once shipped | backend, sdk, docs | upstream marks profiles beta or stable; a stable-OTLP producer works end to end |

## Consequences

- Profiling works now with SDKs and agents people already use, through two Pyroscope-compatible endpoints and OTLP, without forking any of them.
- The backend becomes a writer of telemetry, with its own batching and back-pressure, and the owner of one more ClickHouse database and its migrations.
- The Pyroscope-compatible API is a contract we keep: SDK upgrades are covered by the homologation CI.
- The artifact store grows from source maps to debuginfo, with larger files; its quota and object storage backend matter more.
- Following `v1development` means OTLP profiles may break on upstream proto bumps until stable; the conversion lives in one package to keep that cheap.

## Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | Backend owns the `fusescope_profiles` DDL, an exception to the schema rule | **accept**, within the bounds in decision 3, and update CLAUDE.md |
| 2 | The backend writes profiles to ClickHouse, rather than a collector exporter | **accept**; split into its own binary only when measured |
| 3 | Pyroscope-compatible endpoints as the main SDK path | **accept**; it is the widest set of maintained, permissive SDKs today |
| 4 | Parca `DebuginfoService` compatibility | **accept** in phase 2, so parca-agent uploads symbols unchanged |
| 5 | Public debuginfod | **off by default**, configurable upstreams |
| 6 | Flame graph: own canvas component vs `@grafana/flamegraph` | **own component**; revisit if the frontend moves to React 19 |
| 7 | Default retention | **7 days**, configurable per signal |
| 8 | eBPF agent in the charts | **optional DaemonSet, off by default**, using upstream images |

## Sources

- pprof: [google/pprof `profile.proto`](https://github.com/google/pprof/blob/main/proto/profile.proto), [LICENSE](https://github.com/google/pprof/blob/main/LICENSE); Go [`runtime/pprof`](https://pkg.go.dev/runtime/pprof), [`net/http/pprof`](https://pkg.go.dev/net/http/pprof).
- OTLP profiles: [`profiles/v1development`](https://github.com/open-telemetry/opentelemetry-proto/tree/main/opentelemetry/proto/profiles/v1development), [contrib `pprofreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/pprofreceiver), [contrib `pkg/translator/pprof`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/pkg/translator/pprof); OTEPs [4719](https://github.com/open-telemetry/opentelemetry-specification/pull/4719) and [4947](https://github.com/open-telemetry/opentelemetry-specification/pull/4947).
- eBPF: [opentelemetry-ebpf-profiler](https://github.com/open-telemetry/opentelemetry-ebpf-profiler) ([LICENSE](https://github.com/open-telemetry/opentelemetry-ebpf-profiler/blob/main/LICENSE), [`support/ebpf`](https://github.com/open-telemetry/opentelemetry-ebpf-profiler/tree/main/support/ebpf)), [parca-agent](https://github.com/parca-dev/parca-agent), [Parca](https://github.com/parca-dev/parca) and its [debuginfo proto](https://github.com/parca-dev/parca/tree/main/proto/parca/debuginfo/v1alpha1).
- Pyroscope: [server LICENSE (AGPL-3.0)](https://github.com/grafana/pyroscope/blob/main/LICENSE), [`api/` LICENSE (Apache-2.0)](https://github.com/grafana/pyroscope/blob/main/api/LICENSE), [HTTP ingest API](https://grafana.com/docs/pyroscope/latest/reference-server-api/), [span profiles](https://grafana.com/docs/pyroscope/latest/configure-client/trace-span-profiles/), [pyroscope-go](https://github.com/grafana/pyroscope-go), [otel-profiling-go](https://github.com/grafana/otel-profiling-go), [Alloy `pyroscope.scrape`](https://grafana.com/docs/alloy/latest/reference/components/pyroscope/pyroscope.scrape/), [jfr-parser](https://github.com/grafana/jfr-parser), [`@grafana/flamegraph`](https://www.npmjs.com/package/@grafana/flamegraph).
- Profilers: [async-profiler](https://github.com/async-profiler/async-profiler), [py-spy](https://github.com/benfred/py-spy), [Austin](https://github.com/P403n1x87/austin), [pprof-nodejs](https://github.com/DataDog/pprof-nodejs), [pyroscope-dotnet](https://github.com/grafana/pyroscope-dotnet), [rbspy](https://github.com/rbspy/rbspy), [pprof-rs](https://github.com/tikv/pprof-rs); UI: [speedscope](https://github.com/jlfwong/speedscope), [d3-flame-graph](https://github.com/spiermar/d3-flame-graph).
- Storage: [Coroot](https://github.com/coroot/coroot), [collector-contrib `clickhouseexporter`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter), [debuginfod](https://sourceware.org/elfutils/Debuginfod.html).
- Market: [Datadog Continuous Profiler](https://docs.datadoghq.com/profiler/), [Grafana Pyroscope](https://grafana.com/docs/pyroscope/latest/), [Polar Signals](https://www.polarsignals.com/docs), [Elastic Universal Profiling](https://www.elastic.co/guide/en/observability/current/universal-profiling.html).
