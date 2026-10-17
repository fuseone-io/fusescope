# 0001 · Backend dependency on AGPL collector packages

- Status: proposed
- Issue: [#22](https://github.com/fuseone-io/fusescope/issues/22)
- Deciders: FuseOne maintainers. This is a licensing decision; confirm the outcome with legal counsel before 1.0.

## Context

The source in this repo is MIT, but `go.mod` requires `github.com/fuseone-io/fusescope-otel-collector` (AGPL-3.0). `go list -deps ./cmd/community` compiles 29 of its packages into the `fusescope` binary, so every binary and image we ship is a combined work under AGPL-3.0. The README says so.

AGPL-3.0 §13 matters here: anyone who modifies the binary and lets users interact with it over a network must offer those users the modified source. For an observability backend that is the normal way it is used. MIT on the source alone gives users little if the only runnable artefact is AGPL.

We cannot relicense the collector: most of its code is upstream SigNoz contributors' work. A replacement must be written fresh, not copied or translated from the collector.

### What the backend uses

| Package | Used for | Call sites | Symbols |
|---|---|---|---|
| `cmd/signozschemamigrator/schema_migrator` | ClickHouse column and index descriptors in `pkg/telemetryschema`, `pkg/telemetrymetadata`, `pkg/querybuilder`, `promotetypes`, `rulestatehistory` | 25 files | `Column`, `Index`, ~25 `ColumnType*` values, `JSONSubColumnIndexExpr` |
| `constants` | Body column names and the field keys table | 4 | 5 constants |
| `utils` | `ToPointer` | 1 | 1 |
| `utils/fingerprint` | Resource attribute hierarchy for filter suggestions | 1 | `ResourceHierarchy` |
| `pkg/keycheck` | Cardinality heuristic when promoting log fields | 1 | `IsCardinal` |
| `pkg/parser/grok` | Grok parsing in log pipeline preview | 1 | — |
| `processor/signozlogspipelineprocessor` (+ `stanza/operator/helper`) | Building and **simulating** log pipelines: pipeline preview, operator expressions | 3 | `NewFactory`, `SendOnErrorQuiet`, `ExprCompileBool`, `RunWithExprEnv` |
| `processor/signozspanmapperprocessor` | Span mapper preview | 1 | `NewFactory` |
| `pkg/collectorsimulator` | Running a pipeline in-process on sample data | 2 | `SimulateLogsProcessing`, `SimulateTracesProcessing` |

Two groups, with very different costs:

- **Shared vocabulary**: schema descriptors, constants, small utils. These are data types and names. Writing our own is mechanical work across about 30 files.
- **Simulation**: pipeline and span mapper previews run the real collector processors in-process. This is what makes a preview match production exactly, and it is the only part that is hard to replace. It also pulls in most of the 29 packages (19 come from the logs pipeline processor).

## Options

### 1. Accept AGPL for binaries

Leave the imports as they are; keep the README notice; ship the source for each release (it is already public).

- ✅ No engineering cost; previews stay exact.
- ❌ Users who change the backend and run it as a service must publish their changes. Some enterprise buyers reject AGPL outright, which undercuts the reason for MIT source.
- ❌ The dependency keeps growing unless the "no new imports" rule is enforced.

### 2. MIT-only binary: own the vocabulary, simulate out of process

- Write our own schema descriptors, constants and utils in this repo. They describe the ClickHouse schema; the collector stays the owner of the schema itself and of its migrations.
- Move previews out of the backend process. The collector exposes a simulate endpoint (an extension, or a mode of the migrator/collector binary) and the backend calls it over HTTP or gRPC. The processors stay AGPL, but they run in a separate program, which the AGPL allows.
- ✅ The `fusescope` binary and image are MIT-only.
- ✅ Previews still use the real processors.
- ❌ More operational surface: previews need the collector to be reachable from the backend. Preview latency gains a network hop.
- ❌ The schema descriptors are duplicated in two repos and can drift. This needs a contract test.

### 3. MIT-only binary without previews

Same as option 2 for the vocabulary, but remove pipeline and span mapper previews instead of moving them.

- ✅ Cheapest way to an MIT-only binary.
- ❌ Removes a feature people use when building log pipelines.

## Proposal

**Option 2, in phases.** Each phase is independently mergeable and lowers the import count; the binary becomes MIT-only after phase 3.

1. **Vocabulary**: own `Column`/`Index`/column types, the body column constants, `ToPointer`, `ResourceHierarchy` and `IsCardinal` in this repo. Written from the ClickHouse docs and our own SQL, not from the collector source. Add a contract test that compares our descriptors against the tables the migrator actually creates (the integration suite already starts the migrator).
2. **Expression helpers**: replace `stanza/operator/helper` calls in `pipelineBuilder.go` with our own expression helpers on top of `expr-lang/expr`, which is what the helpers wrap. `go.mod` already replaces it with the MIT-licensed `SigNoz/expr` fork.
3. **Out-of-process preview**: a simulate API in `fusescope-otel-collector`, a client in the backend, then remove `collectorsimulator`, both processors and `grok` from `go.mod`. Pipeline preview integration tests (`logspipelines`, `spanmapper`) must pass unchanged.
4. **Guard**: a CI check that fails if `go list -deps ./cmd/community` contains `fusescope-otel-collector`, and drop the AGPL paragraph from the README.

Until phase 3 lands, option 1 applies: the README notice stays and the `license-guard` agent blocks new imports.

## Consequences

- The collector must be deployed for previews (it already is in every supported install: Helm and the dev env).
- Phase 3 changes the collector repo too; that work is under the AGPL there, which is fine.
- Commits for phases 1–2 state that the code was written without copying collector sources.

## Open questions

- Simulate API transport: HTTP on the collector's existing OpAMP/health port, or a separate port?
- Do we want option 3 as a temporary step if phase 3 slips past 1.0?
