# 0008 · Continuous profiling

- Status: proposed; revised 2026-10-30 after review (ingest and storage moved to the collector, open decisions resolved); revised again 2026-10-30: collector work goes to the Apache-2.0 `fusescope-collector` and its migrator ([ADR 0009](0009-fusescope-collector.md)), ingestion auth follows [ADR 0010](0010-single-ingress.md)
- Issue: [#221](https://github.com/fuseone-io/fusescope/issues/221), which supersedes #20
- Deciders: FuseOne maintainers. Collector receivers and exporter, the ClickHouse schema, symbolization and UI span several PRs and repos.

## Context

FuseScope shows that a service is slow, not which code makes it slow. Continuous profiling closes that gap: always-on, low-rate sampling of CPU, memory, locks and wall time, stored per service and linked to traces. Datadog, Grafana Pyroscope, Polar Signals and Elastic all sell it.

The OpenTelemetry profiles signal is the long-term wire format, but it is not stable. Waiting for it leaves us behind, while the formats it builds on, pprof above all, have been stable for years. This ADR adds profiling now, on pprof, and keeps OTLP profiles on a forward path.

Facts the design rests on, checked 2026-10-30. Licences were read from each project's `LICENSE` file or package manifest.

- **pprof is the lingua franca.** `google/pprof`'s `profile.proto` (Apache-2.0) is what Go's `runtime/pprof` (BSD-3) writes. Every profiler below either emits it or has a converter. It already carries what we need: sample types and units, period, a string table, deduplicated `Location`/`Function`/`Mapping`, and per-sample labels.
- **OTLP profiles are alpha.** Proto `opentelemetry/proto/profiles/v1development` (proto v1.11.1, 2026-09-29) reached Public Alpha in March 2026. The collector supports it behind the `service.profilesSupport` gate; the OTLP receiver and exporter are alpha for profiles. collector-contrib has a lossless pprof ↔ OTLP translator (`pkg/translator/pprof`) and an alpha `pprofreceiver` that scrapes remote `/debug/pprof` endpoints or accepts `POST /v1/pprof`. All Apache-2.0.
- **eBPF whole-host profiling exists and speaks OTLP.**
  - `opentelemetry-ebpf-profiler` (donated by Elastic) unwinds native, HotSpot, Python, Ruby, PHP, Node/V8, Perl, .NET and BEAM stacks with no instrumentation, at 20 Hz by default, within stated limits of ≤ 1 % CPU and 250 MB of memory. Interpreted frames are named on the host; native frames are sent as build ID plus address and need server-side symbolization (decision 4).
  - Its Go code is Apache-2.0, but **`support/ebpf` (the in-kernel programs) is GPL-2.0**. It ships as a separate program, the collector distribution `otelcol-ebpf-profiler`.
  - `parca-agent` (Apache-2.0) is now built on a fork of it, sends OTLP with `--remote-store-format=otlp`, and uploads debug files through Parca's `DebuginfoService` (Apache-2.0 proto), which `--debuginfo-upload-disable` turns off.
- **Grafana Pyroscope's server is AGPL-3.0, its protocol is not.** The `api/` Go module (`github.com/grafana/pyroscope/api`), with `push.v1.PusherService/Push` over Connect (labels plus raw pprof bytes per series), is Apache-2.0. The legacy `POST /ingest` (`name=app.cpu{k=v}`, `from`, `until`, `format=pprof|jfr|folded|lines`) is publicly documented. Pyroscope's language SDKs and Grafana Alloy, which scrapes `/debug/pprof` and pushes, are Apache-2.0. collector-contrib has **no** Pyroscope receiver.
- **Our collector.** `fusescope-otel-collector` (AGPL-3.0) is on collector v0.144.0 and already includes contrib's `pprofreceiver`. It has ClickHouse exporters for logs, traces and metrics, none for profiles, and no ingestion auth: the chart exposes OTLP through an ingress with no authenticator. [ADR 0009](0009-fusescope-collector.md) moves all new collector work to an Apache-2.0 OCB distribution, `fusescope-collector`, in front of this fork. The collector already connects to the backend over OpAMP on an internal port (4320).
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
- **Schema.** Telemetry tables are owned by the collector's migrator. [ADR 0001](0001-agpl-collector-dependency.md) forbids backend imports from the collector; the backend reads telemetry with its own SQL and schema descriptors.

### Market

| | Datadog | Pyroscope | Polar Signals / Parca | Elastic Universal Profiling |
|---|---|---|---|---|
| Collection | language agents | SDKs, Alloy scrape, eBPF | eBPF agent | eBPF agent, 20 Hz |
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
- **Only the collector is exposed to the internet.** The backend stays internal: it reads ClickHouse and is never an ingest endpoint for profiles or debug files.
- MIT backend and UI; separate-process agents permissive, or justified below.

Non-goals for now: profile-based alerting, profiling of browsers and mobile apps, and storing raw pprof for download (a profile is rebuilt from storage on export).

## Architecture

```
 customer networks
   Pyroscope SDKs, Alloy ──── /ingest, Push ──────────────┐
   otelcol-ebpf-profiler ──── OTLP profiles ──────────────┤
   parca-agent ────────────── OTLP profiles, debug files ─┤
                                                          ▼
 exposed      fusescope-collector (Apache-2.0, ADR 0009)
              profiles listener (enforce): profilesreceiver, plus pprofreceiver scrapes
              → clickhouseprofilesexporter
                   │ rows                       │ debug files, internal port
                   ▼                            ▼
 internal     ClickHouse signoz_profiles   ◄── SQL ──  backend (MIT): query API, UI,
              (DDL: Apache migrator)                   read-time symbolizer, artifact store
                                                         │ ingestion keys over OpAMP → collector
                                                         └► debuginfod, outbound, off by default
```

## Decisions

### 1. Ingest: every surface is a collector receiver

All profile ingest terminates at the collector, behind ingestion auth (decision 2). Each receiver produces OTLP profiles (`pdata/pprofile`) into a `profiles` pipeline, with the `service.profilesSupport` gate on.

| Surface | Collector component | Who sends it | Phase |
|---|---|---|---|
| `POST /ingest` (Pyroscope legacy: `format=pprof`, raw or multipart; `name=<service>.<type>{labels}`, `from`, `until`, `sampleRate`, `spyName`) and `POST /push.v1.PusherService/Push` (Connect) | **new `profilesreceiver`** in `fusescope-collector`, on the profiles listener; converts with contrib `pkg/translator/pprof` | Pyroscope SDKs (Go, Python, Ruby, .NET, Node, Rust), Alloy `pyroscope.write` | 1 |
| scrape of `/debug/pprof` | contrib `pprofreceiver` (`remote` mode), included in the `fusescope-collector` build (the AGPL fork's copy is not used) | the collector itself, in cluster or as an agent | 1 |
| OTLP/HTTP and OTLP/gRPC profiles | `profilesreceiver`, which serves the OTLP profiles services on the profiles listener (upstream `otlpreceiver` isn't used for profiles) | `otelcol-ebpf-profiler`, `parca-agent --remote-store-format=otlp`, async-profiler OTLP, other collectors | 2 |
| `parca.debuginfo.v1alpha1.DebuginfoService` | `profilesreceiver`, on the same listener, streaming debug files to the backend's artifact intake through the code `artifactreceiver` uses (ADR 0010 §7, decision 4) | `parca-agent` | 2 |
| `format=jfr` on `/ingest` | `profilesreceiver`, with `grafana/jfr-parser` (Apache-2.0) | Pyroscope Java SDK (async-profiler) | 5 |

- **Pyroscope compatibility is the main SDK path.** Customers keep Pyroscope's Apache-2.0 SDKs and Alloy, unchanged, and point them at our collector's URL. We never run, link or copy the AGPL Pyroscope server: the receiver is written by us from the public HTTP API docs, the Apache-2.0 `api/` protos and requests captured from the real SDKs, which also serve as the receiver's test clients. Writing it that way keeps the option of offering it to contrib, which has none.
- **One profiles listener.** `profilesreceiver` serves Pyroscope, OTLP profiles and `DebuginfoService` on its own port, so `parca-agent` points one address and one key at it, and that listener has its own auth mode (decision 2). A collector server authenticator sees only headers, not which signal or service a request is for, so a mode can only be set per listener.
- **No Parca `ProfileStoreService`.** `parca-agent` already sends OTLP, so a second eBPF wire format buys nothing.
- **OTLP profiles on a forward path.** We follow upstream's `v1development` with the collector version we pin; `fusescope-collector` starts on a current upstream release, with the current proto and `pprofreceiver` modes. When the signal becomes beta or stable we take the stable path with the upgrade that brings it (phase 6). The Pyroscope surfaces stay.
- **Limits** per key in `profilesreceiver`: request size (16 MiB, before and after gzip) and samples per profile; scrapes through contrib `pprofreceiver` are bounded by the collector's memory limiter. Over a limit the response is 413 or 429, never a partial write. Checks that must cover every path, such as timestamp clamping (decision 3), live in `clickhouseprofilesexporter`.

### 2. Ingestion auth at the collector

Ingestion keys and `ingestauth` are specified for every signal by [ADR 0010](0010-single-ingress.md); this section is what profiling needs from them.

- **A new server authenticator extension, `ingestauth`**, in `fusescope-collector`, attached to the profile receivers first and available to every other receiver. It accepts an **ingestion key** as listed in ADR 0010 §2: `signoz-ingestion-key` (what `k8s-infra` agents send today), `SigNoz-Api-Key`, `Authorization: Bearer <key>` (Pyroscope `AuthToken`, Alloy, parca-agent `--remote-store-bearer-token`, OTLP exporter headers) or the password of HTTP Basic (Pyroscope `BasicAuth`); gRPC reads the same values from metadata.
- **Keys come from the backend over the internal OpAMP connection** the collector already opens (collector → backend, port 4320). The backend sends key hashes, their organisation, signals allowed, expiry and limits as an OpAMP custom message (ADR 0010); the extension compares a SHA-256 of the presented key, in memory. A key revoked in the UI stops working within ADR 0010 §3's bound (10 s p95), since keys travel as an OpAMP custom message, not as remote config. The backend accepts no inbound traffic from the internet for this.
- **The key decides the organisation and the allowed signals**; the payload cannot. The extension stamps the key ID and organisation into client metadata, and `ingestauth` adds `fusescope.ingest.key_id` to every resource (ADR 0010 §4); the profiles exporter excludes it from `labels`, so key rotation never splits series. As in ADR 0010 §9, one org writes to one ClickHouse, so profile rows store neither; the ingest meter records the key ID, and tenant-native storage comes with `fusescope-engine`.
- **Ingestion keys need a community implementation.** Today the gateway is a no-op and returns 501. Keys are managed in the backend (metastore, SQLite and PostgreSQL, stored hashed) with `profiles` as a signal; the existing ingestion-key and ingestion-limit permissions apply.
- **The profiles listener runs `enforce` from its first release.** Profiles have no existing clients to keep working, so ADR 0010 §5's permissive rollout, which upgraded installs follow on the shared OTLP listener, doesn't apply: a request to the profiles listener with a missing or invalid key is refused. Since profiles have their own listener, an upgraded install's shared OTLP listener can stay `permissive` for traces, metrics and logs. Until keys ship, the chart configures contrib's `bearertokenauth` or `basicauth` with a secret **on the profiles listener only**, so profile ingest is never unauthenticated on an exposed collector and other signals' clients are untouched.

### 3. Storage in ClickHouse, written by the collector

**Model.** A profile is split into a dictionary (mappings, functions, locations and stacks, deduplicated) and a fact table of samples. A sample row is one stack's value for one series in one profile window.

**Tables** in a new database `signoz_profiles`, created by the **Apache-2.0 migrator in `fusescope-collector`**, which owns new databases (ADR 0009). The backend creates and alters no tables; its one DDL is the retention `MODIFY TTL` it already runs for the other signals.

| Table | Engine | Key | Holds |
|---|---|---|---|
| `mappings` | ReplacingMergeTree(`last_seen`) | `(service_name, mapping_id)` | build ID, file name, whether it has symbols; no memory range, since locations are in file-offset space |
| `functions` | ReplacingMergeTree(`last_seen`) | `(service_name, function_id)` | name, system name, file name, start line |
| `locations` | ReplacingMergeTree(`last_seen`) | `(service_name, location_id)` | mapping ID, address, `Array(Tuple(function_id, line))` for inlined frames |
| `stacks` | ReplacingMergeTree(`last_seen`) | `(service_name, stack_id)` | `Array(UInt64)` of location IDs, leaf first |
| `samples` | MergeTree | `(service_name, profile_type, series_id, timestamp)` | timestamp, duration, `profile_type`, `sample_type`, `sample_unit`, `period_type`, `period`, `series_id`, `labels Map(LowCardinality(String), String)`, `trace_id`, `span_id`, `span_name LowCardinality(String)`, `stack_id`, `value Int64` |
| `series` | ReplacingMergeTree(`last_seen`) | `(service_name, profile_type, series_id)` | the label set of each series, for label browsing and filter suggestions |

Every table also holds `service_name LowCardinality(String)`, the first column of its key.

Plus `distributed_*` tables and replicated engines when a cluster is configured, as the migrator does for the other signals.

- **A new `clickhouseprofilesexporter`** in `fusescope-collector` writes them, batched like the existing exporters. contrib's `clickhouseexporter` profiles layout is denormalised and at development stability, so we don't use it.
- **IDs are content hashes** (64-bit xxh3) computed in the exporter: a function from its fields, a location from its mapping and **normalised** address or lines (for native frames, the ELF file offset `address − mapping.start + mapping.offset`, never the runtime address, which ASLR changes per process), a mapping from its build ID and file, never its memory range, a stack from its location IDs, a series from service, type and sorted labels. Identical rows collapse in the Replacing tables, and the exporter keeps an LRU of IDs it has written so dictionaries are not resent with every profile. The LRU is **expire-after-write** with a 24 h TTL (never expire-after-access), so a hot entry is written again at least daily and its `last_seen` advances. Dictionaries are inserted before the samples that reference them, and an ID enters the LRU only after its dictionary insert succeeds, so a failed batch is retried, not remembered. Hashes are scoped by service; a collision costs a wrong frame in one service, not corruption.
- **Samples** are aggregated within a profile by `(series, labels, stack, span_id, span_name, trace_id)` before insert, so samples of different spans stay separate rows. `samples` is `PARTITION BY toDate(timestamp)`, with a bloom-filter index on `span_id` and `trace_id` and `ttl_only_drop_parts=1`.
- **Labels.** Resource attributes (`service.name`, `service.version`, `deployment.environment.name`, `host.name`, `k8s.*`) and pprof sample labels go into `labels`. `span_id`, `span_name` and `trace_id` are lifted into columns (a `LowCardinality` `span_name`), because they would explode series; `fusescope.ingest.key_id` is dropped. A cap on distinct label keys and values per key protects the series table; labels beyond it are dropped and counted in the exporter's metrics. **Instance identity labels are never capped**: `service.name`, `service.instance.id`, `host.name`, `k8s.pod.uid` and `k8s.pod.name` always stay, so two instances never merge into one series and gauge sums across instances stay right; the cap applies to the other labels.
- **Cumulative and gauge types.** Go's alloc, mutex and block profiles are cumulative since process start; SDKs and Alloy send deltas (`/debug/pprof/allocs?seconds=N`), and the scrape recipes request them. A Go delta subtracts every sample type, `inuse_*` included, so the recipes and the receiver keep only `alloc_*` from a delta and fetch in-use heap separately without `seconds`. In-use heap is a gauge: queries take each series' last value per time bucket, sum across series, then average the buckets over the range (decision 5).
- **Retention.** Profiles become a fourth signal in the backend's retention settings, **7 days by default**, applied with `ALTER TABLE … MODIFY TTL` as for the others. Dictionary tables expire by `last_seen` plus the samples' TTL plus 2 days: one day for the exporter's LRU refresh and one of margin, so a stack is never dropped while samples reference it. Since `last_seen` is ingest time and samples expire by their own timestamp, `clickhouseprofilesexporter` clamps a sample's timestamp, whatever receiver it came through, to at most ingest time plus 10 minutes of clock skew (and refuse ones older than the retention), so a fast client clock can't make samples outlive their stacks.
- **Rollups only when measured**, as for RUM. If a 24-hour flame graph misses its target (decision 5), the migrator adds an aggregating `samples_1m` MV that drops labels and span IDs, **for delta types only**; gauges keep reading `samples`, because their per-series latest value needs `series_id`.
- **The backend reads profiles and writes nothing to these tables**; its only DDL is the retention TTL above. It holds its own descriptors of these tables, written from our SQL as ADR 0001 phase 1 did, and imports no collector package. The existing contract test, which compares descriptors with what the migrator creates, gains the profiles tables.

### 4. Symbolization

**The problem.** A flame graph needs function names. Where they come from depends on the profiler:

| Source | Names | What we do |
|---|---|---|
| Go, Java (async-profiler, JFR), Python, Ruby, Node, .NET SDKs | inside the profile | nothing |
| eBPF agent, interpreted code (Python, Ruby, PHP, Node, Java, .NET, BEAM, Perl) | named by the agent on the host | nothing |
| eBPF agent and native profilers, compiled code (C, C++, Rust, Go, the JVM itself, and system libraries such as libc and OpenSSL) | **not named**: only the binary's build ID and an address | symbolization, below |

A build ID is a hash the linker writes into every ELF binary. Production binaries are usually *stripped*: their function names were removed to save space, and kept, if at all, in a separate debug file. Without that debug file the flame graph shows `libssl.so.3+0x3a8f0` instead of `SSL_read`.

**Where it runs.** In the backend, **at read time**. Native frames are stored as build ID plus ELF file offset (decision 3), so frames dedupe across processes despite ASLR. Debug files are keyed by link-time virtual address, so the symbolizer first maps the offset to that address through the binary's program headers (the `PT_LOAD` segment's `p_vaddr − p_offset`, as pprof's `elfexec.GetBase` does), then looks it up. When a query returns stacks with such frames, the backend looks up the debug file for each build ID, resolves the addresses in a batch, and keeps the names in a **symbol index** per build ID: built once from the debug file (sorted address ranges to function, file and line), stored next to it in the artifact store, and held in an in-memory LRU. Nothing is written to ClickHouse. Stored samples never change, so a debug file uploaded later also fixes earlier profiles: an upload, or a successful debuginfod fetch, for a build ID clears that build ID's row in `debuginfo_lookup` at once, so every replica sees it. Parsing uses Go's `debug/elf`, `debug/dwarf` and `debug/gosym` (BSD-3). Without any debug file, the frame keeps its `module+0xoffset` form and the UI lists the missing build IDs.

**Where debug files come from.** Two sources, tried in order:

1. **Upload, for the customer's own binaries.** Only the customer has the debug files of what they build. They send them in, by build ID:
   - **Parca's `DebuginfoService`.** `parca-agent` already finds the binaries running on each host, asks the server whether it has a build ID, and if not, uploads the binary or its debug file. Implementing that service means symbols arrive with no extra step. Direction: agent → collector. `parca-agent` sends profiles and debug files to **one** gRPC address with one bearer token, so `profilesreceiver` serves both on the profiles listener (decision 1): `DebuginfoService` for debug files and the OTLP profiles service. Debug file uploads never enter a pipeline, where `ingestauth` checks signals (ADR 0010 §4), so `profilesreceiver` checks the key's `artifacts` signal itself before accepting one. The key needs both the `profiles` and `artifacts` signals; the setup page issues such a key for parca-agent. Without it, customers upload with our CLI or HTTP API in their CI, or see unnamed native frames.
   - **CLI and HTTP upload** (`fusescope debuginfo upload <file>`), for CI pipelines and for agents other than parca-agent.

   The CLI and HTTP upload is a route of the collector's **`artifactreceiver`** (ADR 0010 §7), the receiver for every other artifact upload; `DebuginfoService` streams with its code. Both require a key with the `artifacts` signal and stream the file to the backend's **internal** artifact intake, authenticating with the per-collector credential it gets over OpAMP; no ingress routes that listener. The backend stores it in the **artifact store** shared with RUM source maps and R8 mappings, as a `debuginfo` kind keyed by build ID, with its own size limit (debug files are often hundreds of MB), quota and retention. So uploads, like profiles, enter only through the collector, and the files live where the backend's symbolizer reads them.
2. **debuginfod, for distro packages.** Linux distributions publish debug files for their packages (libc, OpenSSL, the kernel, the JVM) on *debuginfod* servers. A client asks `GET <server>/buildid/<id>/debuginfo` and gets the file. That names system-library frames nobody uploaded.
   - Direction: **outbound**, backend → server, at read time, when a build ID is missing from the store. Fetched files are cached in the artifact store. Lookup state is shared by every backend replica: a metastore table `debuginfo_lookup` (build ID, status, checked at) holds misses and a fetch claim with an expiry (5 minutes, renewed while the fetch streams), so one replica fetches a build ID and the others wait for its result; a claim past its expiry, left by a replica that crashed or restarted, is taken by the next replica that needs the build ID; the in-memory LRU holds only symbol indexes that exist. Fetches are **asynchronous**: a query never waits on debuginfod; frames without a symbol index show their `module+0xoffset` with a "symbolizing" marker and resolve on a later query. One fetch per build ID runs at a time, and misses (404) are recorded in `debuginfo_lookup` for 24 h, so private binaries debuginfod never has cost one request a day, not one per query. Our client is written over HTTP; elfutils (GPL/LGPL) is not linked.
   - **Off by default.** Every request sends a build ID outside, which reveals which binaries and versions the customer runs, and it fails air-gapped. An admin can enable it, with the public servers (`debuginfod.elfutils.org` federates the distros) or an internal debuginfod mirror. Without it, system-library frames stay unnamed unless someone uploads their debug files.

### 5. Query and UI

**API.** One backend query module over `signoz_profiles`. It reads with SQL; the backend then symbolizes native frames (decision 4), merges frames by function, and only then prunes and builds the top table, in that order:

- `profile types` and `label names/values` for a service and range;
- a **timeline**: the total value of a type over time, summed across series per bucket; for gauges, each series' last value in the bucket, then summed across series;
- a **flame graph**: `sum(value)` grouped by `stack_id` under the filters, or for gauges: per series and bucket, the **latest profile** (its `max(timestamp)`) and only that profile's stacks, so a stack freed before the latest snapshot counts zero; then summed across series per stack and bucket, then averaged over **all** buckets in the range, a bucket where the stack is absent counting as zero. The result is the total heap per stack, independent of how many instances report and of the bucket width; stacks and locations fetched for the result, the tree built in the backend **after** read-time symbolization, so native frames at different addresses of one function merge into one node, and only then pruned to a node budget (16 384 by default) with the remainder kept as "other";
- a **top table**: self and total per function, grouped by the symbolized name, not by address;
- a **diff**: two selections (baseline and comparison; different ranges, label sets such as `service.version`, or both) built into one tree with both values per node, normalised by each side's total;
- **export** as pprof, rebuilt from storage with `google/pprof`'s `profile` package, so `go tool pprof` and speedscope open it. Mappings are emitted in file-offset space (`start` 0, `offset` 0, `limit` the file size), matching the stored location addresses, so every frame falls inside its mapping.

Targets: 1-hour flame graph for one service ≤ 1 s p95, 24 hours ≤ 3 s, on the phase 1 dataset.

**UI.** A **Profiles** section:

- **Explorer.** Service, profile type, label filter and time range; timeline on top (drag to select a range); flame graph and top table side by side, with search, focus on a frame and "sandwich" (callers and callees of a function).
- **Compare.** Two selections, a diff flame graph coloured by relative change, and a top table sorted by change.
- **Entry points.** A *Profiles* tab on the service page, and on spans that have one (decision 6).
- **Setup.** Ingestion key, per-language snippets pointing at the collector, the Alloy and collector scrape recipes, the eBPF agent DaemonSet, and debug file upload with missing build IDs.

**Flame graph component.** Our own canvas component, grown from the trace flame graph's renderer and worker. `@grafana/flamegraph` is Apache-2.0, but 13.3 requires React 19 and pulls `@grafana/ui` and Emotion, while the frontend is on React 18.2 with shadcn/ui and Tailwind. `d3-flame-graph` (Apache-2.0, SVG) is the fallback if the canvas work stalls. speedscope (MIT) is a standalone app; we support it through pprof export. New screens get Claude Design boards first, as in the rest of the redesign.

### 6. Trace-to-profile links

- **Convention.** CPU and wall samples carry the pprof label `span_id` of the **local root span** that was active, and `span_name` for code hotspots; `trace_id` is optional (hex-encoded as in OTLP). `span_id` is the link: the span tab and code hotspots never need `trace_id`. Only those types carry them, because runtimes attach labels only where the sampled goroutine or thread is known.
- **Go.** `grafana/otel-profiling-go` (Apache-2.0) wraps the `TracerProvider` and calls `pprof.Do` on each local root span with `span_id` and `span_name`, plus `trace_id` when the trace is sampled and starts in that process (current releases; older ones set only `span_id` and `span_name`). It also sets the span attribute `pyroscope.profile.id`. We document it with the Pyroscope Go SDK; a plain `pprof.Do(ctx, pprof.Labels("span_id", …, "span_name", …), …)` works the same. Phase 3 checks the labels each runtime's integration actually sends.
- **Other runtimes.** Pyroscope's OTel integrations for Java, .NET, Python and Ruby set the same labels; phase 3 verifies each one's licence and wire output before we document it.
- **UI.** On a span whose service has CPU profiles: a *Profile* tab with the flame graph of samples where `span_id` is the span's local root and the profile window `[timestamp, timestamp + duration)` overlaps the span. Samples are stamped with their window, often 15 s, so most spans are shorter than it, and containment would drop them. The service page aggregates by endpoint through `span_name` (code hotspots).
- **eBPF.** The agent sees no span context today. OTEP 4719 (process context) and OTEP 4947 (thread context, `otel_thread_ctx_v1`) are merged but have no shipped implementation, and profiler support is a work-in-progress PR. We adopt them when they ship; until then eBPF profiles link to traces by service, host and time only.

### 7. SDKs and agents we recommend

Consistent with our SDK policy: **use upstream, homologate, and add thin distros only where needed.** We publish no profiler of our own. Every row points at the collector.

| Runtime | Recommended | Licence | Collector surface |
|---|---|---|---|
| Go | Pyroscope Go SDK (`grafana/pyroscope-go`) + `otel-profiling-go`; or scraping `net/http/pprof` | Apache-2.0; BSD-3 | `/ingest`, Push, `pprofreceiver` |
| Java | Pyroscope Java SDK (async-profiler inside); or async-profiler's OTLP output | Apache-2.0 | JFR on `/ingest` (phase 5); OTLP |
| Python | Pyroscope Python SDK (`pyroscope-io`) | Apache-2.0 | `/ingest` |
| Node | `@pyroscope/nodejs` (built on `@datadog/pprof`) | Apache-2.0 | `/ingest` |
| .NET | `pyroscope-dotnet` | Apache-2.0 | `/ingest` |
| Ruby | Pyroscope Ruby gem; rbspy (MIT) for ad-hoc pprof | Apache-2.0 | `/ingest` |
| Rust | `pprof-rs` with the Pyroscope Rust SDK | Apache-2.0 | `/ingest` |
| Any, no code change | `otelcol-ebpf-profiler` or `parca-agent` as a DaemonSet | Apache-2.0, eBPF programs GPL-2.0 | OTLP, `DebuginfoService` |

- **Excluded:** Austin (GPL-3.0). py-spy (MIT) has no pprof output and stays an ad-hoc tool.
- **Homologation.** The SDK homologation matrix gains the profiler SDKs and agents above, with a sample app per language in `fusescope-sdk` CI that pushes to a real collector and checks the flame graph.
- **Distros only where they remove real friction.** The planned Java agent extension and `@fusescope/node` distro can enable profiling with FuseScope defaults (collector endpoint, key, `service.name` from the OTel resource, span labels on). That happens in phase 5, in those distros, not as separate profiling packages.
- **The eBPF agent in the chart** is an optional DaemonSet, **off by default**, using the upstream images.

### 8. Overhead, sampling and cost

| | Target | Default |
|---|---|---|
| In-process SDKs | ≤ 1 % CPU at the default rate, ≤ 2 % with every type on | CPU at 100 Hz (Go and Pyroscope SDK default), alloc sampling at runtime default (Go: 512 KiB), mutex and block off unless enabled; upload every 15 s |
| JVM | ≤ 1 % with JFR `default.jfc`; `profile.jfc` measured at about 2 % | async-profiler CPU (itimer) at 100 Hz, alloc at 512 KiB |
| eBPF agent | ≤ 1 % CPU, ≤ 250 MB RSS per host | 20 Hz per CPU |
| Collector | ≤ 1 core per 10 000 profiles/min through receiver and exporter, measured in phase 1 | — |

**Storage, estimated** from Coroot's ≈ 7 B per sample row plus about 15 % for dictionaries, and to be replaced by phase 1 measurements. These figures are for **untraced** workloads: Coroot's rows carry no span IDs. With span labels on, each CPU or wall row also carries `span_id`, `trace_id` and `span_name`, and rows split per span, so traced services can store several times more; phase 1 measures both.

| Source | Raw input / day | Stored / day | 7-day retention |
|---|---|---|---|
| One 2-core Go instance, CPU every 15 s | ~200 MB pprof | ~40–60 MB | ~0.3–0.4 GB |
| Same, CPU + alloc + inuse + goroutine | ~340 MB (CPU plus 3 × 8 KB × 5 760) | ~100–150 MB | ~0.7–1.1 GB |
| One 8-core host, eBPF at 20 Hz, busy | — | ~200–350 MB (Elastic reports ~40 MB per core, ~320 MB) | ~1.4–2.5 GB |

The spread is the number of distinct stacks per window, which only a real workload pins down.

## Licence posture

| Component | Licence | Where | How we use it |
|---|---|---|---|
| `profilesreceiver` (with its `DebuginfoService`), `clickhouseprofilesexporter`, `ingestauth`, profiles migrations | Apache-2.0 (ours) | collector | new clean-room code in `fusescope-collector` (ADR 0009), never in the AGPL fork |
| contrib `pprofreceiver`, `pkg/translator/pprof`, `bearertokenauth`, `basicauth`; `pdata/pprofile`; the OTLP profiles service protos | Apache-2.0 | collector | linked |
| `github.com/grafana/pyroscope/api` | Apache-2.0 | collector | Push protos only |
| Parca `proto/` (`DebuginfoService`) | Apache-2.0 | collector | generated stubs, attributed in `NOTICE` |
| `grafana/jfr-parser` | Apache-2.0 | collector | phase 5 |
| `google/pprof` (`profile` package); Go `debug/elf`, `debug/dwarf`, `debug/gosym` | Apache-2.0; BSD-3 | backend | pprof export; symbolizer |
| Pyroscope server | **AGPL-3.0** | — | not run, linked, copied or read |
| `opentelemetry-ebpf-profiler` / `parca-agent` userspace | Apache-2.0 | customer hosts | separate process |
| their eBPF programs (`support/ebpf`) | **GPL-2.0** | customer kernels | separate process, loaded into the kernel by the agent |
| Pyroscope SDKs, Alloy, async-profiler, `@datadog/pprof`, `pprof-rs`, `otel-profiling-go` | Apache-2.0 | customer side | unchanged |
| rbspy, py-spy, speedscope, `dotnet-trace` | MIT | customer side | docs |
| `@grafana/flamegraph` | Apache-2.0 | — | not adopted (decision 5) |
| `d3-flame-graph` | Apache-2.0 | frontend, only if adopted | fallback if the canvas work stalls (decision 5); a new dependency, reviewed when adopted |
| Austin | GPL-3.0 | — | excluded |
| elfutils / debuginfod | GPL/LGPL | — | not linked; HTTP protocol only |
| qryn (AGPL-3.0), Elastic (Elastic License) | — | — | ideas only, no code |

- **The backend links no collector code.** It reads `signoz_profiles` with its own SQL and descriptors; `make agpl-check` stays green.
- **Why the GPL-2.0 eBPF programs are acceptable.** They are not part of any FuseScope binary or image: they run inside the kernel, loaded by an agent that is a separate program talking to the collector over OTLP. Linux requires GPL-compatible eBPF programs for the helpers profilers need, so every eBPF profiler is in this position. The chart references the upstream agent images and does not rebuild them, so the source offer is upstream's. If we ever ship our own agent image, it must carry the GPL-2.0 source offer for those objects.

## Roadmap

Each phase ships behind a feature flag and ends with docs and integration or e2e tests, on SQLite and PostgreSQL where it touches the metastore.

| Phase | Scope | Repos | Exit criteria |
|---|---|---|---|
| **1 · pprof MVP (Go)** | collector (`fusescope-collector`, after ADR 0009 phases 0–1): profiles pipeline, `profilesreceiver` (pprof, Push), `pprofreceiver` recipes, `clickhouseprofilesexporter`, migrator tables, `ingestauth` with ingestion keys (ADR 0010 phases 1–2; contrib bearer/basic auth until then); backend: descriptors and contract test, retention signal, query API, pprof export; UI: explorer | collector, backend, frontend, charts, docs | a Go service with the Pyroscope SDK and one scraped by the collector appear in the explorer; unauthenticated requests are refused; 1 h flame graph ≤ 1 s p95; storage per instance measured and this ADR amended |
| **2 · eBPF and symbols** | OTLP profiles from the eBPF agents; `DebuginfoService` on `profilesreceiver` and CLI upload through `artifactreceiver` (ADR 0010 phase 4); artifact store `debuginfo` kind; read-time symbolizer with per-build-ID symbol indexes; debuginfod client, off by default; optional agent DaemonSet in the chart | collector, backend, charts, docs | `parca-agent` and `otelcol-ebpf-profiler` run unmodified on a kind cluster; a stripped C++ binary symbolizes from an upload, and libc from an internal debuginfod; overhead on the demo host ≤ 1 % |
| **3 · Trace links** | `span_id`/`trace_id` filters; span *Profile* tab; code hotspots on the service page; Go guide with `otel-profiling-go`; licence and output check of the other runtimes' OTel integrations | backend, frontend, docs | from a HotROD trace, the span's CPU flame graph opens; hotspots per endpoint on the service page |
| **4 · Compare** | diff API and diff flame graph; compare by range, labels and `service.version` | backend, frontend | a regression injected between two versions of a sample app is the top changed frame |
| **5 · Other languages** | JFR in `profilesreceiver`; guides for Java, Python, Node, .NET, Ruby; homologation matrix and CI sample apps; profiling in the Java and Node distros | collector, sdk, docs | each runtime's sample app shows CPU and alloc profiles in CI against a release build |
| **6 · OTLP profiles stable** | take the stable OTLP path with the collector upgrade that brings it; make OTLP the recommended wire where SDKs support it; adopt process and thread context for eBPF span links once shipped | collector, sdk, docs | upstream marks profiles beta or stable; a stable-OTLP producer works end to end |

## Consequences

- Profiling works now with SDKs and agents people already use, through Pyroscope-compatible and OTLP receivers on the collector, without forking any of them.
- The internet-facing surface stays the collector. Profiles, ingestion keys and debug files never need the backend exposed; the backend's only new outbound call is debuginfod, off by default.
- Most of the new code is in the Apache-2.0 collector (ADR 0009): `profilesreceiver` with its `DebuginfoService`, an exporter, an auth extension and migrations. Collector releases gate profiling changes, as they do for the other signals.
- Ingestion keys arrive in the community build for every signal (ADR 0010).
- The Pyroscope-compatible API is a contract we keep; SDK upgrades are covered by the homologation CI.
- The artifact store grows from source maps to debug files, with larger files; its quota and object storage backend matter more.
- Following `v1development` means OTLP profiles may break on upstream proto bumps until stable, and `fusescope-collector` must follow upstream releases.

## Resolved decisions

| # | Question | Decision |
|---|---|---|
| 1 | Who receives and writes profiles, and who owns the schema | the **collector**: receivers and exporter in `fusescope-collector`, schema in its Apache-2.0 migrator (ADR 0009); the backend reads, plus the retention `MODIFY TTL` it runs for every signal; no other schema exception |
| 2 | Pyroscope-compatible endpoints as the main SDK path | **yes**: Pyroscope's Apache-2.0 SDKs and Alloy, unchanged, pointed at our collector; the AGPL server is never run or linked |
| 3 | Parca `DebuginfoService` | **yes, phase 2**, served by `profilesreceiver` on the profiles listener, streaming to the backend's internal intake with `artifactreceiver`'s code |
| 4 | Public debuginfod | **off by default**; an admin can enable public servers or point to an internal one |
| 5 | Flame graph component | **our own canvas component**; revisit `@grafana/flamegraph` if the frontend moves to React 19 |
| 6 | Default retention | **7 days**, configurable |
| 7 | eBPF agent in the chart | **optional DaemonSet, off by default**, upstream images |
| 8 | Ingestion keys for profiles only, or every signal | **every signal in the same release** (ADR 0010); the shared listener follows ADR 0010 §5 (`enforce` on new installs, `permissive` first on upgrades), and the profiles listener is `enforce` from the start (decision 2) |
| 9 | RUM gateway on a public backend path | **moves to the collector** (ADR 0010) |

## Sources

- pprof: [google/pprof `profile.proto`](https://github.com/google/pprof/blob/main/proto/profile.proto), [LICENSE](https://github.com/google/pprof/blob/main/LICENSE); Go [`runtime/pprof`](https://pkg.go.dev/runtime/pprof), [`net/http/pprof`](https://pkg.go.dev/net/http/pprof).
- OTLP profiles: [`profiles/v1development`](https://github.com/open-telemetry/opentelemetry-proto/tree/main/opentelemetry/proto/profiles/v1development), [contrib `pprofreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/pprofreceiver), [contrib `pkg/translator/pprof`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/pkg/translator/pprof), contrib [`bearertokenauthextension`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/bearertokenauthextension) and [`basicauthextension`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/basicauthextension); OTEPs [4719](https://github.com/open-telemetry/opentelemetry-specification/pull/4719) and [4947](https://github.com/open-telemetry/opentelemetry-specification/pull/4947).
- eBPF: [opentelemetry-ebpf-profiler](https://github.com/open-telemetry/opentelemetry-ebpf-profiler) ([LICENSE](https://github.com/open-telemetry/opentelemetry-ebpf-profiler/blob/main/LICENSE), [`support/ebpf`](https://github.com/open-telemetry/opentelemetry-ebpf-profiler/tree/main/support/ebpf)), [parca-agent](https://github.com/parca-dev/parca-agent), [Parca](https://github.com/parca-dev/parca) and its [debuginfo proto](https://github.com/parca-dev/parca/tree/main/proto/parca/debuginfo/v1alpha1).
- Pyroscope: [server LICENSE (AGPL-3.0)](https://github.com/grafana/pyroscope/blob/main/LICENSE), [`api/` LICENSE (Apache-2.0)](https://github.com/grafana/pyroscope/blob/main/api/LICENSE), [HTTP ingest API](https://grafana.com/docs/pyroscope/latest/reference-server-api/), [span profiles](https://grafana.com/docs/pyroscope/latest/configure-client/trace-span-profiles/), [pyroscope-go](https://github.com/grafana/pyroscope-go), [otel-profiling-go](https://github.com/grafana/otel-profiling-go), [Alloy `pyroscope.scrape`](https://grafana.com/docs/alloy/latest/reference/components/pyroscope/pyroscope.scrape/), [jfr-parser](https://github.com/grafana/jfr-parser), [`@grafana/flamegraph`](https://www.npmjs.com/package/@grafana/flamegraph).
- Profilers: [async-profiler](https://github.com/async-profiler/async-profiler), [py-spy](https://github.com/benfred/py-spy), [Austin](https://github.com/P403n1x87/austin), [pprof-nodejs](https://github.com/DataDog/pprof-nodejs), [pyroscope-dotnet](https://github.com/grafana/pyroscope-dotnet), [rbspy](https://github.com/rbspy/rbspy), [pprof-rs](https://github.com/tikv/pprof-rs); UI: [speedscope](https://github.com/jlfwong/speedscope), [d3-flame-graph](https://github.com/spiermar/d3-flame-graph).
- Storage and symbols: [Coroot](https://github.com/coroot/coroot), [collector-contrib `clickhouseexporter`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter), [debuginfod](https://sourceware.org/elfutils/Debuginfod.html).
- Market: [Datadog Continuous Profiler](https://docs.datadoghq.com/profiler/), [Grafana Pyroscope](https://grafana.com/docs/pyroscope/latest/), [Polar Signals](https://www.polarsignals.com/docs), [Elastic Universal Profiling](https://www.elastic.co/guide/en/observability/current/universal-profiling.html).
