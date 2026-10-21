# ADR 0003 experiments · RUM phase 0 spike

Run on 2026-10-21 with ClickHouse `25.12.5`, collector and migrator `fusescope-otel-collector:0.145.0`, FuseScope `0.150.0`, HotROD `1.76.0`, Node 26, Playwright 1.59.1 (Chromium 147), Linux x86_64.

| Folder | Contents |
|---|---|
| [`browser/`](browser/) | `@fusescope/browser` prototype (TypeScript, esbuild), bundle entries, unit tests |
| [`sample-app/`](sample-app/) | SPA + Node server (proxy to HotROD, CORS echo), Playwright driver |
| [`stack/`](stack/) | Throwaway compose stack, separate from `.devenv` |
| [`datagen/`](datagen/) | Synthetic RUM generator (server-side `INSERT … SELECT`) |
| [`sql/`](sql/) | Benchmark queries, runner, e2e checks, API timing |
| [`results/`](results/) | Raw outputs and the trace-link screenshot |

## 1. Prototype

`browser/src/` holds the modules the ADR lists, over the OpenTelemetry JS 2.12 / 0.223 line (the last line with a coherent set of browser packages; see §5):

| Module | File | Notes |
|---|---|---|
| Session manager | `session.ts` | `session.id`, `session.previous_id`; 15 min inactivity, 4 h max; one session per browser via `localStorage` + `storage` events |
| Session sampling | `sampling.ts`, `session.ts` | decision derived from the id, so every tab and signal agrees; unsampled sessions send **no** `traceparent` |
| Error capture | `errors.ts` | `error` + `unhandledrejection` → log record, `exception.*`, `fusescope.rum.error.source` |
| Web Vitals | `vitals.ts` | `web-vitals` 6.2.3, LCP/INP/CLS/TTFB → log record, `event.name=rum.vital` |
| SPA views | `views.ts` | `view` span per History API navigation, `fusescope.rum.view.route` from a route template |
| PII scrubbing | `scrub.ts`, `processors.ts` | query and fragment dropped from URL attributes **and span names**, allow-list per parameter |
| Resource | `resource.ts` | ADR data model; Client Hints, no UA parsing |
| Instrumentations | `instrumentations/` | document-load, fetch, XHR, user-interaction; `traceparent` to same origin + `propagateTo` allow-list |

```bash
cd browser && npm ci && npm test && npx tsc --noEmit && node build.mjs
```

## 2. Bundle size

`node build.mjs` bundles every file in `browser/entries/` (esbuild 0.28.2, ESM, minified, ES2020) and writes [`results/bundle-sizes.md`](results/bundle-sizes.md). gzip level 9.

| Bundle | Initial gzip KB | Lazy gzip KB |
|---|---:|---:|
| OTel SDK only (traces + logs + 2 OTLP/HTTP exporters, no FuseScope code) | 20.3 | — |
| **core** (SDK + all FuseScope modules + `web-vitals`, no instrumentation) | **26.0** | — |
| core + document-load | 28.3 | — |
| core + fetch | 30.3 | — |
| core + XHR | 30.2 | — |
| core + user-interaction | 28.9 | — |
| **full** (core + the four instrumentations) | **34.5** | — |
| lazy (core + fetch eager; document-load, XHR, user-interaction after `load`) | 33.4 | 7.2 |
| core + upstream `browser-instrumentation` fetch / XHR / navigation-timing / user-action | 31.9 | — |
| OTel SDK only on the 3.0 line (`browser/otel3/`) | 20.2 | — |

What dominates `core` (minified bytes): `sdk-trace` 23 %, `sdk-logs` 18 %, `api` 12 %, `otlp-exporter-base` 11 %, `web-vitals` 10 %, FuseScope modules 8 % (6.9 KB), `core` 6 %, `otlp-transformer` 6 %. 78 % of `core` is the OpenTelemetry SDK.

- Every variant is under 35 KB gzip; `full` has 0.5 KB of headroom.
- Lazy loading saves 1.1 KB initially: the instrumentations share `@opentelemetry/instrumentation`, `sdk-trace-web` and `web-common`, which land in the eager chunk. It is not worth a second request.
- The legacy contrib instrumentations (`document-load`, `user-interaction`) pull in the deprecated `sdk-trace-web` 2.2 KB on top of `sdk-trace`.

## 3. End to end

```bash
cd stack && docker compose up -d          # ClickHouse :19000, OTLP/HTTP + CORS :14318, FuseScope :18080, HotROD :18083
cd ../sample-app && npm ci && node server.mjs &   # http://localhost:3350
node drive.mjs > ../results/e2e-drive.json
docker exec -i rum-spike-clickhouse clickhouse-client --param_sid=<tab1 id> --multiquery < ../sql/e2e_verify.sql
```

The dev environment was not running; the spike used its own stack (`stack/compose.yaml`, project `rum-spike`) and never touched `.devenv` containers or volumes. The collector's OTLP receiver (upstream `otlpreceiver`) accepts `cors.allowed_origins`, so no extra collector was needed.

`drive.mjs` drives a sampled session over two tabs (load, SPA navigations, fetch and XHR to HotROD through a same-origin proxy, cross-origin calls to an allow-listed and a non-listed URL, a thrown error, an unhandled rejection) and an unsampled session. Results ([`results/e2e-verify.txt`](results/e2e-verify.txt), [`results/e2e-drive.json`](results/e2e-drive.json)):

| Check | Result |
|---|---|
| Trace link | Both browser `GET` spans are the parent of HotROD `frontend /dispatch` ([screenshot](results/trace-link.png): 41 spans, browser span at the root) |
| `session.id` | on all 35 browser spans and 8 log records; 0 browser spans without it; same id in both tabs |
| Errors | 2 records in `logs_v2`, `exception.type/message/stacktrace`, `fusescope.rum.error.source` = `onerror` / `unhandledrejection` |
| Vitals | LCP, INP, CLS, TTFB in `logs_v2` with value, rating, route |
| Propagation | allow-listed cross-origin call got `traceparent`; the other did not |
| Unsampled session | nothing exported, no `traceparent` sent; HotROD started its own root trace |
| API | v5 `query_range` filters and groups by `session.id` and `fusescope.rum.view.route` on traces and logs with no backend change |

Surprises:

1. **The log record's `EventName` is dropped.** `logs_v2` has no column for it and the exporter doesn't copy it into attributes. Errors emitted with only `eventName: 'exception'` have no event name in storage; vitals survive only because the prototype also sets an `event.name` attribute.
2. **Page-load vitals arrive late.** web-vitals reports LCP/CLS/INP on hide or input, usually after SPA navigations. Stamping the current route gave LCP the wrong route; the prototype stamps the load route instead.
3. **PII in span names.** `instrumentation-user-interaction` names spans `Navigation: /customers/392#tab?email=a@b.c`. Scrubbing attributes is not enough.
4. **Unsampled spans still propagate.** Without the guard, a session sampled out sends `traceparent` with flags `00`, and parent-based backend samplers drop the server trace too.
5. **user-interaction emits one span per listener**: 17 `click` spans for 7 clicks.
6. **`view` spans must end on `visibilitychange`.** A view open when the tab closes is lost; the prototype ends it when the page is hidden.

The prototype uses the ADR's original vital names (`rum.vital`, `fusescope.rum.vital.*`); the amended ADR moves to the semantic-convention names that upstream emits.

## 4. Sessions-query cost

### Data

```bash
cd datagen && SESSIONS=20000 DAYS=7 ./generate.sh   # stops if ClickHouse RSS > 9 GB
```

3 apps × 20 000 sessions/day × 7 days = **420 000 sessions**; per session 15 `view` spans, 40 fetch spans (3 % failed), 4 vitals, 1–2 errors. Resources carry 150 user agents × 3 releases per app (1 351 fingerprints). Rows go straight into the local tables with every column the exporter fills except the `attributes`/`resource` JSON columns (unused by the default query path), then `resources.sql` fills `traces_v3_resource` and `logs_v2_resource`. Backdating is safe: both tables have a 15-day TTL, and the collector's `maxAllowedDataAgeDays` (15 by default) doesn't apply to direct inserts. Generation took 6 min, ClickHouse RSS stayed ≤ 3.9 GB (container limit 12 GB).

| Table | Rows | Compressed | Uncompressed |
|---|---:|---:|---:|
| `signoz_index_v3` | 23.1 M | 998 MiB | 23.7 GiB |
| `trace_summary` (MV) | 23.1 M | 659 MiB | 1.4 GiB |
| `logs_v2` | 2.31 M | 82 MiB | 2.6 GiB |

Every synthetic fetch span is its own trace with no backend children, so `trace_summary` is one row per span here.

### Queries

```bash
cd sql
./bench.sh map map
# promote session.id through the API (see sql/promote.sql for the payloads), then:
./bench.sh col coldefault
docker exec -i rum-spike-clickhouse clickhouse-client --multiquery < promote.sql
./bench.sh col colmaterialized
```

`bench.sh` runs each query for the 24 h and 7 d ranges on one app (`shop-web`, 140 000 sessions in 7 d): 5 cold runs (ClickHouse caches dropped, `min_bytes_to_use_direct_io=1` so data is read from disk) and 10 warm runs, timed from `system.query_log`.

| Query | File |
|---|---|
| q1 sessions list (top 50 by last seen; views, requests, failed requests, duration, platform, version, errors) | `q1_sessions_list.sql` |
| q2 one session's timeline (spans + logs) | `q2_session_timeline.sql` |
| q3 vitals p75 per route and vital, rating split | `q3_vitals_p75.sql` |
| q4 error groups (type + message, occurrences, sessions, first/last seen, releases) | `q4_error_groups.sql` |

`session.id` was compared in three states on `signoz_index_v3` and `logs_v2`:

- **map**: `attributes_string['session.id']`, as ingested.
- **promoted, not materialized**: right after the FuseScope fields API promoted it (`POST /api/v2/traces/fields`, `POST /api/v1/logs/fields`). The API adds a `DEFAULT` column plus a `bloom_filter(0.01) GRANULARITY 64` index ([`sql/promote.sql`](sql/promote.sql) lists the exact DDL); parts written earlier compute the column from the map on read.
- **promoted, materialized**: after `MATERIALIZE COLUMN` and `MATERIALIZE INDEX`, i.e. what data ingested after promotion looks like.

p50 / p95 in ms, shop-web (one third of the data), [`results/bench-*.tsv`](results/) hold rows read, bytes and memory:

| Query | Range | map cold | map warm | promoted, not materialized, warm | promoted, materialized, cold | promoted, materialized, warm |
|---|---|---:|---:|---:|---:|---:|
| q1 sessions list | 24 h | 200 / 232 | 144 / 161 | 154 / 160 | 127 / 148 | 99 / 106 |
| q1 sessions list | **7 d** | **986 / 1043** | 866 / 905 | 906 / 946 | **385 / 449** | 311 / 344 |
| q2 session timeline | 24 h | 45 / 46 | 36 / 42 | 87 / 92 | 39 / 43 | 35 / 36 |
| q2 session timeline | 7 d | 70 / 83 | 47 / 49 | 747 / 819 | 65 / 75 | 50 / 51 |
| q3 vitals p75 per route | 24 h | 64 / 65 | 54 / 57 | — | — | — |
| q3 vitals p75 per route | 7 d | 211 / 225 | 184 / 192 | — | — | — |
| q4 error groups | 24 h | 61 / 71 | 51 / 54 | 55 / 64 | 68 / 77 | 53 / 59 |
| q4 error groups | 7 d | 189 / 229 | 162 / 169 | 161 / 172 | 211 / 233 | 166 / 189 |

- **The exit criterion passes without promotion**: 7-day sessions list p95 1.04 s cold. Materializing `session.id` makes it 2.7× faster (0.45 s cold p95) and halves the bytes read (3.9 → 2.0 GB). Its column costs 35 MiB compressed for 23 M spans.
- **Query shape matters more than the column.** A first q1 with a CTE took **2.70 s p95** ([`results/bench-map-q1-with-cte.tsv`](results/bench-map-q1-with-cte.tsv)): ClickHouse inlines a CTE at each reference, so the span aggregation ran twice, and it read `resources_string` for platform and version. Reading them from `traces_v3_resource` for the 50 rows kept removed both.
- **Promoting after the fact hurts until parts are rewritten.** The timeline got 10× slower (70 → 747 ms): a filter on the new column can no longer use the map's value index, and the new index doesn't cover old parts. Promote at application creation, or run `MATERIALIZE COLUMN` / `MATERIALIZE INDEX`.
- **The query builder can serve the spans half.** The same aggregation through `POST /api/v5/query_range` (group by `session.id`, `countIf`, `min`/`max(timestamp)`, order by last seen, limit 50; [`sql/api_sessions_list.sh`](sql/api_sessions_list.sh)) took 0.66–0.86 s end to end over 7 days, 10 warm runs, using the materialized column. The error count needs a second logs query.
- **Scaling.** q1 is a scan of the app's spans in the range: about 58 ms per million spans cold with the promoted column. 2 s is reached near 35 M spans in 7 days, about 90 000 sessions/day for one app at this shape; that is when the `rum_sessions` rollup becomes necessary. This is an extrapolation, not a measurement.
- Cold runs drop ClickHouse's caches and read with `O_DIRECT`; one node, NVMe, 12 GB container limit.

## 5. OpenTelemetry JS landscape on 2026-10-21

- **OTel JS 3.0** shipped on 2026-10-20: `sdk-trace-base` and `sdk-trace-web` merged into `@opentelemetry/sdk-trace` (`sdk-trace-web` 2.12 is deprecated), the Logs API moved into `@opentelemetry/api` 1.10, and **`@opentelemetry/sdk-logs` is stable (3.0.0)**. Same bundle size as 2.12 (20.2 vs 20.3 KB).
- **`open-telemetry/opentelemetry-browser`** is a new upstream repo:
  - `@opentelemetry/browser-sdk` 0.5.0: session manager (inactivity, max duration, `localStorage` store, span/log processors that add `session.id`). No cross-tab sync after start, no `session.previous_id`, no sampling.
  - `@opentelemetry/browser-instrumentation` 0.8.2, all under `experimental/`: errors (`exception` event), web-vitals (`browser.web_vital` event, `browser.web_vital.{name,value,rating,…}`), navigation, user-action, fetch, XHR, resource- and navigation-timing. Navigation and user actions are log events, not spans.
  - Both still depend on the 2.12 / 0.223 line; mixing them with 3.0 would bundle two SDKs.
- Licences in the prototype tree: 24 Apache-2.0, 9 MIT (esbuild, zone.js, transitive helpers). No `ua-parser-js`.

## Cleanup

Everything ran in the throwaway stack; `docker compose -f stack/compose.yaml down -v` removes it with its data. On a shared ClickHouse, the synthetic and e2e rows are tagged `fusescope.spike=rum0` and are removed with:

```sql
DELETE FROM signoz_traces.trace_summary WHERE trace_id IN (SELECT trace_id FROM signoz_traces.signoz_index_v3 WHERE resources_string['fusescope.spike'] = 'rum0');
DELETE FROM signoz_traces.signoz_index_v3 WHERE resources_string['fusescope.spike'] = 'rum0';
DELETE FROM signoz_traces.traces_v3_resource WHERE simpleJSONExtractString(labels, 'fusescope.spike') = 'rum0';
DELETE FROM signoz_logs.logs_v2 WHERE resources_string['fusescope.spike'] = 'rum0';
DELETE FROM signoz_logs.logs_v2_resource WHERE simpleJSONExtractString(labels, 'fusescope.spike') = 'rum0';
```

and the promoted columns with `ALTER TABLE … DROP INDEX`/`DROP COLUMN` of `attribute_string_session$$id`, `attribute_string_session$$id_exists` and `attribute_string_session$$id_idx` on `signoz_index_v3`, `distributed_signoz_index_v3`, `logs_v2` and `distributed_logs_v2`.
