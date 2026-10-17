# 0001 · Backend dependency on AGPL collector packages

- Status: proposed
- Issue: [#22](https://github.com/fuseone-io/fusescope/issues/22)
- Deciders: FuseOne maintainers. This is a licensing decision; confirm the outcome with legal counsel before 1.0.

## Context

The source in this repo is MIT, but `go.mod` requires `github.com/fuseone-io/fusescope-otel-collector` (AGPL-3.0). `go list -deps ./cmd/community` compiles 29 of its packages into the `fusescope` binary, so every binary and image we ship is a combined work under AGPL-3.0. The README says so.

AGPL-3.0 §13 matters here: anyone who modifies the binary and lets users interact with it over a network must offer those users the modified source. For an observability backend that is the normal way it is used. MIT on the source alone gives users little if the only runnable artefact is AGPL.

We cannot relicense the collector: most of its code is upstream SigNoz contributors' work. A replacement must be written fresh, not copied or translated from the collector.

### Scope

This ADR makes the **backend binary** MIT-only. The collector stays AGPL-3.0 and runs as a separate program, which the AGPL allows; Grafana Loki and Mimir ship the same way. A collector without AGPL code would be a clean-room rewrite of the ClickHouse exporters, the schema migrator and both processors, built as an OCB distribution on contrib. That is a much larger project and, if wanted, a future ADR.

### What the backend uses

| Package | Used for | Call sites | Symbols |
|---|---|---|---|
| `cmd/signozschemamigrator/schema_migrator` | ClickHouse column and index descriptors in `pkg/telemetryschema`, `pkg/telemetrymetadata`, `pkg/querybuilder`, `promotetypes`, `rulestatehistory` | 25 files | `Column`, `Index`, ~25 `ColumnType*` values, `JSONSubColumnIndexExpr` |
| `constants` | Body column names and the field keys table | 4 | 5 constants |
| `utils` | `ToPointer` | 1 | 1 |
| `utils/fingerprint` | Resource attribute hierarchy for filter suggestions | 1 | `ResourceHierarchy` |
| `pkg/keycheck` | Cardinality heuristic when promoting log fields | 1 | `IsCardinal` |
| `pkg/parser/grok` | Grok operator registered for log pipeline preview; wraps `vjeantet/grok` (Apache-2.0) | 1 | — |
| `processor/signozlogspipelineprocessor` (+ `stanza/operator/helper`) | Building and **simulating** log pipelines: pipeline preview, operator expressions | 3 | `NewFactory`, `SendOnErrorQuiet`, `ExprCompileBool`, `RunWithExprEnv` |
| `processor/signozspanmapperprocessor` | Span mapper preview | 1 | `NewFactory` |
| `pkg/collectorsimulator` | Running a pipeline in-process on sample data | 2 | `SimulateLogsProcessing`, `SimulateTracesProcessing` |

Two groups, with very different costs:

- **Shared vocabulary**: schema descriptors, constants, small utils. These are data types and names. Writing our own is mechanical work across about 30 files.
- **Simulation**: pipeline and span mapper previews run the real collector processors in-process. This is what makes a preview match production exactly, and it is the only part that is hard to replace. It also pulls in most of the 29 packages (19 come from the logs pipeline processor).

Most of the simulation code is not SigNoz's:

- 29 of the 54 non-test Go files in `signozlogspipelineprocessor` say they were brought in as is from `opentelemetry-collector-contrib/pkg/stanza` (Apache-2.0), and others say they were adapted from it. The SigNoz-specific part is the processor glue plus a few modified operators.
- `signozspanmapperprocessor` is 331 lines.
- `go.mod` already requires `opentelemetry-collector-contrib/pkg/stanza` directly.

## Options

### 1. Accept AGPL for binaries

Leave the imports as they are; keep the README notice; publish the corresponding source for each release.

- ✅ No engineering cost; previews stay exact.
- ❌ Users who change the backend and run it as a service must publish their changes. Some enterprise buyers reject AGPL outright, which undercuts the reason for MIT source.
- ❌ The dependency keeps growing unless the "no new imports" rule is enforced.
- ❌ Each image must point to the source of its exact release tag.

### 2. MIT-only binary: own the vocabulary, simulate in-process on upstream contrib

- Write our own schema descriptors, constants and utils in this repo. They describe the ClickHouse schema; the collector stays the owner of the schema itself and of its migrations.
- Build the preview simulator on `opentelemetry-collector-contrib/pkg/stanza` and write the processor glue, the operator differences and the span mapper clean-room.
- ✅ The `fusescope` binary and image are MIT-only.
- ✅ No network hop; previews work without reaching the collector; no change to the collector repo.
- ✅ User-supplied pipelines (regexes, grok patterns, expressions) never run inside the ingestion path.
- ❌ The preview can drift from production. This needs a contract test against the real collector.
- ❌ The operator differences must be specified from observed behaviour, not from the collector source (see the procedure under Proposal).
- ❌ The schema descriptors are duplicated in two repos and can drift. This needs a contract test.

### 3. MIT-only binary: own the vocabulary, simulate out of process

Same as option 2 for the vocabulary. For previews, the collector exposes a simulate API (an extension, or a mode of the collector binary) and the backend calls it over HTTP or gRPC. The processors stay AGPL, but they run in a separate program.

- ✅ The `fusescope` binary and image are MIT-only.
- ✅ Previews use the real processors of the deployed version.
- ❌ Previews need a collector reachable from the backend, and gain a network hop.
- ❌ User-supplied pipelines run inside a collector, so the API needs authentication, timeouts and payload limits. It must not share a process with ingestion, or a slow preview degrades ingestion.
- ❌ Changes the collector repo and adds a cross-repo API to version.

### 4. MIT-only binary without previews

Same as option 2 for the vocabulary, but remove pipeline and span mapper previews.

- ✅ Cheapest way to an MIT-only binary.
- ❌ Removes a feature people use when building log pipelines.

## Proposal

**Option 2, in phases.** Each phase is independently mergeable and lowers the import count; the binary becomes MIT-only after phase 3. Option 3 is the fallback if the contract test in phase 3 cannot be made to pass.

1. **Vocabulary**: own `Column`/`Index`/column types, the body column constants, `ToPointer`, `ResourceHierarchy` and `IsCardinal` in this repo. Written from the ClickHouse docs and our own SQL, not from the collector source. Add a contract test that compares our descriptors against the tables the migrator actually creates (the integration suite already starts the migrator).
2. **Expression helpers**: replace `stanza/operator/helper` calls in `pipelineBuilder.go` with our own expression helpers on top of `expr-lang/expr`, which is what the helpers wrap. `go.mod` already replaces it with the MIT-licensed `SigNoz/expr` fork.
3. **In-process simulator on contrib**: a simulator in this repo on `pkg/stanza` and `vjeantet/grok`, then remove `collectorsimulator`, both processors and `grok` from `go.mod`. Pipeline preview integration tests (`logspipelines`, `spanmapper`) must pass unchanged.
4. **Guard**: drop the AGPL paragraph from the README and make the CI check below forbid every collector package.

The guard starts before phase 1: a CI check that fails if `go list -deps ./cmd/community` contains a `fusescope-otel-collector` package outside an allowlist of today's 29. Each phase shrinks the allowlist. Until phase 3 lands, option 1 applies and the README notice stays.

### Clean-room procedure for phase 3

Matching the collector's operators means knowing how they behave, not how they are written:

- Behaviour is specified by a corpus of pipelines and sample logs and spans, and by the output the real collector produces for them. Nobody writing the simulator reads the collector's processor or operator source.
- A contract test feeds the corpus through the real collector (the integration suite already starts it) and through the backend simulator, and requires identical output. A difference becomes a new corpus case, not a look at the collector code.
- Contrib code is used as a module dependency, never copied out of the collector repo. Any contrib file we vendor comes from contrib itself, keeps its Apache-2.0 header and is attributed in a `NOTICE` file.
- Commits for phases 1–3 state that the code was written without copying or translating collector sources.

## Consequences

- Previews no longer depend on the collector being reachable.
- The collector repo is unchanged; it remains AGPL-3.0 and the owner of the telemetry schema.
- Two contract tests (schema descriptors, simulator output) join the integration suite and catch drift when the collector is upgraded.
- The binary ships Apache-2.0 code from contrib, which needs attribution but no source disclosure.
