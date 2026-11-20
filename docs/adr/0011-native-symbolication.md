# 0011 · Shared native symbolication

- Status: **Proposed** (2026-11-05).
- Issues: [RUM roadmap #182](https://github.com/fuseone-io/fusescope/issues/182), [Android symbolication #441](https://github.com/fuseone-io/fusescope/issues/441), [iOS dSYM #191](https://github.com/fuseone-io/fusescope/issues/191). Android level-1 capture was delivered under [#188](https://github.com/fuseone-io/fusescope/issues/188).
- Deciders: FuseOne maintainers.
- Amends on acceptance: [ADR 0003](0003-real-user-monitoring.md), decision 6 and Android phase-3 decisions.
- Related: [ADR 0010](0010-single-ingress.md), proposed [ADR 0008 / PR #214](https://github.com/fuseone-io/fusescope/pull/214), [artifact ingress #234](https://github.com/fuseone-io/fusescope/issues/234), [profiling #215](https://github.com/fuseone-io/fusescope/issues/215).

## Context

Android level 1 captures native crashes, preserves their original session and time, and groups tombstone frames by library and offset. It does not resolve those addresses to function, file and line. iOS needs matching dSYM support. Both require binary identity validation and DWARF lookup, which profiling also needs.

The existing RUM artifact store handles source maps and R8 mappings, with atomic writes, quotas and retention. The revised profiling design in proposed ADR 0008 extends that store with `debuginfo` and artifact-side symbol indexes. Native RUM should reuse that design and ADR 0010's collector ingress instead of creating another upload service or symbol store.

## Decisions

### 1. Use the shared collector artifact intake

CLI and Gradle uploads terminate at #234's `artifactreceiver`, authenticated with a secret key granting the `artifacts` signal. The receiver streams to the backend's internal artifact intake using its collector credential. Public RUM keys cannot upload symbols; uploaded metadata cannot choose a different organization.

Profiling's `profilesreceiver` serves OTLP profiles and Parca's `DebuginfoService` on its profiles listener. Debug-file RPCs check `artifacts` authorization and delegate to the same intake code used by `artifactreceiver`. There is no separate `debuginforeceiver` or new public backend CI-upload route. Management operations retain ADR 0010's boundary.

### 2. Identify binaries within the organization

ELF debug files use artifact kind `debuginfo`, keyed by organization and GNU build ID. Architecture is validated from the file and checked against the requesting frame. RUM and profiling use the same file for the same binary; application, release and service labels are context, not artifact ownership or separate lookup keys.

Mach-O debug files use kind `dsym`, keyed by organization, UUID and architecture for each slice. The shared artifact store handles their lifecycle. Existing source-map and R8 application-scoped identities retain their contracts.

Extract identity and architecture from the uploaded contents and reject mismatches with claimed metadata. A build ID or UUID alone does not prove that an uploader owns a binary. Store candidates by content digest within each organization, binary identity and architecture; matching content is idempotent, and a different digest must not block a later genuine upload. Record the authenticated uploader, upload time and application/release context for each candidate. Access and deduplication never cross organization boundaries.

Select candidates using the frame's application and release context. When the stripped binary is available, verify the debug file against its load-segment layout and available section hashes before admitting it as a verified match. An ambiguous or mismatched candidate leaves the frame unresolved; upload order never selects a winner. Organization administrators can replace the selected candidate or delete a specific digest, with an audit record.

Native artifacts and their derived indexes count toward the organization's native-artifact quota and retention policy. There is no application ownership or cross-feature reference-counting scheme for shared ELF files.

### 3. Keep address kinds explicit

| Input | Address supplied | Normalization to DWARF lookup address |
|---|---|---|
| Android tombstone | ELF-relative `rel_pc` | Identity: load bias has already been applied; do not apply the profiling conversion again |
| Native profiling | ELF file offset | Convert through the containing `PT_LOAD` segment using `p_vaddr - p_offset` |
| iOS crash | Runtime PC with image load information | Remove the image slide to obtain the preferred Mach-O address |

The resolver contract carries the address kind, binary identity and architecture. The iOS capture contract must supply image UUID, architecture and enough load information to determine the slide. Owned fixtures prove the conversions, including nonzero ELF load bias and iOS ASLR; format names alone are not evidence of equivalent address semantics.

### 4. Derive indexes outside ClickHouse

The backend builds an immutable symbol index from each accepted artifact, stores it beside the file in the artifact store and keeps active indexes in a bounded memory LRU, following proposed ADR 0008. Symbol files and indexes cause no ClickHouse writes and require no ClickHouse `symbols` table. Profiling telemetry schema work remains separate.

Index/cache identity includes organization, format, binary identity, architecture, artifact digest and parser/index version. Upload, deletion and expiry invalidate the affected identity across backend replicas through shared artifact metadata/lookup state; reuse profiling's `debuginfo_lookup` coordination rather than maintaining a second RUM lookup service.

Build indexes at upload time using Go's `debug/elf`, `debug/macho` and `debug/dwarf` where supported; profiling retains its `debug/gosym` adapter. Reads use validated indexes and never parse uploaded files. RUM resolves frames on the error detail view only; error lists and group views use captured data and do not trigger index loads or symbol lookup. Debuginfod remains governed by ADR 0008, outbound and off by default. RUM adds no independent external symbol or source fetcher.

### 5. Enrich presentation without changing capture or grouping

Keep raw telemetry and Android's current native fingerprints unchanged. Uploading symbols can enrich older errors on their next read without rewriting ingestion or regrouping them. Native capture, consent, sampling and acknowledged-export deduplication retain their existing contracts.

Missing, malformed, unsupported or partially matching symbols leave original frames readable. Report function-only resolution separately from function/file/line resolution. Source context is absent unless explicitly supported and uploaded; build paths must not expose CI secrets.

### 6. Bound parsing and artifact lifecycle

Use explicit, configurable upload, decoded-size, parsing time, memory and index limits with cancellation and atomic admission under the organization quota. Native limits must come from representative ELF and dSYM measurements rather than inheriting source-map defaults.

Treat parser input as hostile. Validate header-declared ranges, counts and decoded sizes against the file size and configured limits before allocating; reject overflow, out-of-bounds sections and excessive expansion. Recover parser panics as failed uploads and fuzz the format/address adapters in CI. A goroutine cannot enforce an independent memory cap: inputs above the measured in-process admission limit must run in a subprocess with enforced memory/CPU limits and a deadline. If that isolation is unavailable, reject the upload. Failed parsing publishes neither an artifact candidate nor an index.

Deleting shared native artifacts requires organization administrator authorization. Before deleting a digest or changing retention, show the applications known to reference the affected artifacts and warn that their historical frames may become unresolved. Retention and expiry remain organization-wide; maintain an audit record and invalidate every affected index and cached selection. Reference information supports this warning, not application ownership or reference-counted retention.

Begin with individual ELF debug files and Mach-O DWARF files per slice; the uploader extracts dSYM bundle members. Archive intake requires a separate supported contract covering traversal, symlinks, duplicate entries, decompression limits and atomic failure. No archive parser or demangler dependency is selected here.

## Consequences

Android native errors, iOS crashes and profiling share artifact infrastructure and the DWARF core, while retaining their format-specific address adapters. Missing files can be uploaded after an event arrives, and storage isolation follows the organization rather than each consuming application.

The shared foundations depend on #215's resolver/index work and #234's authenticated collector intake. Parser fixtures can be developed independently of public ingress delivery, but native upload acceptance must exercise the collector path. Real iOS acceptance also needs #190's capture/image contract and macOS tooling.

Before production limits and supported-format guarantees are fixed, a bounded spike must measure file/index sizes and parse costs and establish supported DWARF versions, compression, C++/Swift name presentation and inline-frame fidelity. These are implementation inputs, not a competing symbol-storage design.

## References

- [AOSP tombstone formatting uses `frame.rel_pc`](https://android.googlesource.com/platform/system/unwinding.git/+/refs/tags/android-12.0.0_r21/libunwindstack/Unwinder.cpp).
- [Apple build UUID matching](https://developer.apple.com/documentation/technotes/tn3178-checking-for-and-resolving-build-uuid-problems) and [crash symbolication](https://developer.apple.com/documentation/xcode/adding-identifiable-symbol-names-to-a-crash-report).
- Work packages and acceptance tracking: [#191](https://github.com/fuseone-io/fusescope/issues/191); reviewed profiling design: [PR #214](https://github.com/fuseone-io/fusescope/pull/214).
