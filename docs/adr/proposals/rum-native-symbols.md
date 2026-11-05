# RUM native symbols: Android level 2 and iOS dSYM

Status: **proposal for review**, not an accepted architecture change or implementation.
Tracking: [roadmap #182](https://github.com/fuseone-io/fusescope/issues/182),
[D #188](https://github.com/fuseone-io/fusescope/issues/188),
[G #191](https://github.com/fuseone-io/fusescope/issues/191).
Baseline: backend main `4dececf34`; ADR 0003 and accepted ADR 0010.
Related planned work: [artifact ingress #234](https://github.com/fuseone-io/fusescope/issues/234),
[profiling symbols #215](https://github.com/fuseone-io/fusescope/issues/215),
[proposed ADR 0008 / PR #214](https://github.com/fuseone-io/fusescope/pull/214).

## Outcome and scope

Resolve Android native and iOS crash addresses to function, file and line using one
artifact pipeline and a shared DWARF resolution core. Keep raw telemetry and existing
Android native capture, grouping, consent, sampling and recovery semantics.

Android level 1 is already published and accepted; do not rebuild capture or install
an in-process crash handler. Android 1.0 (#189) can finish independently of level 2.
iOS crash capture and its sample belong to F/#190. G supplies symbolication, not an
iOS SDK. Profiling receives a reusable resolver; this plan does not deliver #215's
agents, profile ingest, debuginfod client or profiling UI.

## Verified existing work and gaps

| Area | Available now | Work required |
|---|---|---|
| RUM artifacts | Source-map/R8 metadata, filesystem storage, atomic writes, quota/retention, bounded cache | Generalize for native artifacts and organization/service references without duplicating storage |
| Native Android | Bounded tombstone frames; relative PC/build ID used in fingerprint identities | Expose typed native frame identity to the resolver; preserve fingerprint output |
| RUM resolver | Source maps and R8 at read time | ELF/Mach-O adapters and DWARF lookup; native-specific missing-symbol details |
| Collector artifact ingress | Accepted architecture in ADR 0010; implementation tracked in #234 | Verify phase-4 delivery before shipping native uploads |
| Profiling symbols | #215 and proposed ADR 0008 | Agree common identities, address conversion, symbol-index persistence and invalidation |
| iOS | Reserved platform value | F's capture/image contract, dSYM parser, upload and real-crash acceptance |

The current RUM artifact kinds are only `source-map` and `r8-mapping`; there is no
native symbol store/parser to treat as delivered. The current storage implementation
is filesystem-backed. Object storage is not established by the ADR's allowance for it.
Existing defaults include a 50 MiB file limit, 2 GiB per-application quota and 256 MiB
parsed-artifact cache; these are existing map defaults, **not approved native limits**.

#188 is currently closed although its body keeps level 2 pending. Preserve that
user-made closure for this planning change. Before implementation, agree either to
reopen #188 with level 1 checked or create a linked level-2 issue and explicitly update
#182's scope ledger. This proposal does not claim D complete or close #191.

## Proposed amendment to ADR 0003

After review, amend decision 6 and the Android phase-3 decisions with the following
contract. Keep ADR 0010's accepted ingress/authentication boundaries intact.

### Shared ingest and ownership

CI/Gradle/CLI → collector artifact ingress (`artifacts` secret key) → authenticated
backend internal intake → shared artifact storage and metadata → read-time resolver.

- Extend #234's receiver/intake contract. No additional internet-facing backend
  symbol-upload endpoint; management list/delete/UI upload retain ADR 0010's boundary.
- Collector authorization supplies organization identity and verifies application
  scope. The backend revalidates trusted collector identity and authorized scope;
  uploaded metadata cannot select another organization's artifacts. Align the exact
  application authorization rule with #234 before exposing a native route.
- Keep credentials out of mobile binaries: public RUM keys cannot upload symbols.
  Do not independently add an Editor-key CI route or a second symbol store.
- Reuse atomic writes, quota accounting, retention and metadata on both SQL stores.
  Native files and derived indexes share lifecycle accounting. If binaries are reused
  by profiling and RUM, ownership references prevent deletion while still referenced;
  content deduplication must not grant cross-organization read access.

### Identity, lookup and address conversion

| Input | Verified artifact identity | Address adapter |
|---|---|---|
| Android native crash | ELF GNU build ID + machine/ABI, scoped to the authorized org/application | Preserve tombstone-relative PC and image metadata; prove conversion to ELF DWARF virtual addresses with fixtures |
| Profiling native frame | Same ELF identity, service/organization ownership from profiling | File offset to link-time virtual address through ELF load segments, as proposed in ADR 0008 |
| iOS crash | Mach-O UUID + architecture per slice, scoped to the authorized org/application | Runtime PC/image load information to preferred Mach-O/DWARF address; prove ASLR/slide normalization |

- Extract identity/architecture from file contents. Cross-check claimed values and
  event/image metadata; reject mismatch. File names and release strings are context,
  never a fallback to a different binary's symbols. A missing ID remains unresolved.
- Keep address kinds explicit in the internal contract: Android relative PC,
  profiling file offset, runtime address and DWARF virtual address are not interchangeable.
  Define the minimal image/load metadata F must emit before its capture contract freezes.
- Key a derived index/cache by authorized scope, format, identity, architecture,
  artifact digest and parser/index version. Equal IDs with different content are
  conflicts unless a verified policy for supplementary debug sections is approved.
- Build one immutable derived symbol index per accepted artifact; resolve address
  batches at read time. Reuse Go standard-library `debug/elf`, `debug/macho` and
  `debug/dwarf` where viable; `debug/gosym` remains profiling's adapter. No dependency
  or demangler is selected by this proposal. Evaluate C++/Swift names and inline-frame
  fidelity in the spike before promising their full presentation.
- Preserve the current native fingerprint algorithm in the first delivery. Uploading
  symbols enriches presentation without regrouping existing native errors. Raw telemetry
  remains unchanged and an older event resolves after its symbols arrive.

### Limits, failure behavior and lifecycle

- Probe representative ELF and dSYM sizes before choosing native file/index limits.
  Set explicit upload, decompressed-size, member-count, nesting, CPU/time and memory
  bounds. Native limits must be configurable and accounted in the shared quota.
- Start with verified individual ELF/Mach-O debug files. A dSYM is a bundle: choose
  whether the uploader extracts its DWARF members or the collector accepts a bounded
  archive during the spike. Before archive support, define traversal/symlink handling,
  duplicate entries, zip-bomb limits, per-slice validation and failure atomicity.
- Parse untrusted binaries within bounded jobs; cancellation and malformed/unsupported
  input leave the error readable with original frames. File/line absence must not be
  reported as full symbolication merely because a symbol-table function is available.
- Keep source context absent unless uploaded and explicitly supported; handle absolute
  build paths without leaking CI secrets. No source fetching or outgoing symbol lookup
  is added to RUM by default. Debuginfod remains separately governed by #215/ADR 0008.
- Use bounded positive and negative caches; upload/delete/expiry invalidate the affected
  scope/identity across replicas. Coordinate with profiling's proposed `debuginfo_lookup`
  state and artifact-side indexes rather than adding an independent ClickHouse symbol store.

## Work packages and dependencies

These packages are proposed PR boundaries, not newly opened implementation issues.
Each starts with failing regression/acceptance tests when behavior changes.

| Step | Deliverable / repos | Depends on | Acceptance |
|---|---|---|---|
| P0 | Review this proposal and ADR 0003 amendment; reconcile #188 tracking and #215 contract | Maintainer decision | Recorded identities, ownership, limits approach, rollout and issue ownership; ADR amendment approved before implementation |
| P1 | Bounded ELF/Mach-O/DWARF spike and owned fixture generators in `fusescope` | P0 | Known function/file/line, ABI/UUID/build-ID rejection, ASLR/address-kind fixtures, size/parse-memory measurements; select supported DWARF/compression/name/inline scope |
| P2 | Generalize artifact metadata/storage and derived indexes in `fusescope`, shared with #215 | P1 and agreed #215 contract | Migration/read/delete/quota/retention and isolation tests pass on SQLite/PostgreSQL; existing maps/mappings unchanged |
| P3 | Add native artifact ingest to #234's collector/internal-intake path; chart routing as needed | #234 auth/intake foundations, P2 | Authorized CI upload reaches internal storage; public/mobile key, wrong org, oversized and mismatched content rejected; backend intake unreachable publicly |
| P4 | Shared resolver and Android Errors integration in `fusescope` | P1/P2; P3 for real upload acceptance | Valid binary resolves function/file/line; later upload fixes old event; mismatch remains raw; fingerprint and web/JVM behavior unchanged |
| P5 | Android Gradle native upload and guide in `fusescope-sdk-android` / `fusescope-docs` | P3/P4 | Collect variant/ABI's real unstripped symbols, verify build IDs, upload with artifacts-only key; minified sample SIGABRT resolves application function/file/line in Errors |
| P6 | dSYM/Mach-O adapter and upload guide in `fusescope` / docs | P1–P3 and F's agreed image contract | UUID/arch matching, multi-slice/member behavior and wrong-symbol rejection; deterministic iOS fixtures resolve function/file/line |
| P7 | iOS real sample acceptance with F/#190 | P6 and working iOS SDK/sample | Xcode-produced dSYM and real matching crash upload through collector, grouped and symbolicated in Errors; exact versions/UUIDs recorded |

P4 and P6 may progress independently after their shared dependencies. P5 completes D
level 2's Android acceptance. P7 completes G's integrated acceptance; fixture-only P6
success does not establish F/G delivered. Native parsing experiments can use internal
test fixtures before #234 ships, but public upload delivery is gated on its ingress.

## Test and delivery matrix

- Go table-driven tests: identity extraction, load segments/slides, wrong architecture,
  stripped/missing/truncated DWARF, unsupported sections, bounded parsing and symbol
  lookup. Owned fixture sources and reproducible Linux/macOS build instructions; no
  vendor SDK implementation or proprietary crash bundle copied into this repo.
- SQLite/PostgreSQL integration: upload/list/delete, idempotent retry vs content conflict,
  cross-org/application isolation, concurrent quota admission, retention/reference
  cleanup, cache invalidation and upload-after-query behavior across replicas.
- Receiver tests: artifacts-only auth, per-collector intake credential, cancellation,
  malformed body, archive bounds if supported, partial upload cleanup and no public
  backend intake. Reuse #234's suite, including source-map/R8 migration regressions.
- Android SDK/plugin: variant/ABI selection, no-debug-info diagnostics, build-ID mismatch,
  credential handling and upload retry policy. Real release sample + collector + backend
  + Errors UI; preserve level-1 original session/time and acknowledged-export deduplication.
- iOS: self-produced executable/dSYM pair and a macOS CI job; mismatched UUID/architecture,
  ASLR and a real-crash acceptance coordinated with F. Identify a macOS runner before
  committing to P7 scheduling; Linux fixtures alone cannot prove the complete flow.
- Frontend regression: raw and resolved native frames, partial resolution/missing IDs,
  web source maps and R8 unaffected. Agree/generated OpenAPI contracts first, assess
  MCP/Terraform and link changes or explicit non-impact reasons in each implementation PR.
- Release evidence separates implemented, merged, published and accepted. Preserve source
  SHAs, image digests, SDK/plugin versions, ABI/build ID/UUID and sanitized screenshots/
  payloads. Close neither D level 2 nor G based solely on a merged parser.

## Decisions to approve before implementation

1. Accept the shared scope/identity/address-adapter contract and amend ADR 0003.
2. Confirm #234 owns ingress/auth/internal intake and #215 owns the common ELF/index
   infrastructure with RUM reuse. Resolve the drift: #215 currently mentions a `symbols`
   table, while proposed ADR 0008 stores derived indexes with artifacts and says no
   ClickHouse symbol writes. Do not implement both designs.
3. Agree native quota/reference accounting, upload retry/content-conflict policy and
   cross-replica invalidation contract in P1/P2; do not introduce independent defaults.
4. Choose dSYM bundle transport and the initial supported compression/DWARF/name/inline
   subset based on the P1 fixtures/measurements, before advertising full support.
5. Record D level 2's issue ownership despite #188's closure and arrange F/macOS acceptance.

No exact upload path, schema migration, auth change, new dependency, storage provider
or native size default is approved or introduced by this document. The first executable
step after design approval is P1; production metadata/ingress follow the dependencies above.

## Format references

- [Android native crash format](https://source.android.com/docs/core/tests/debug/native-crash):
  tombstone PC/build-ID semantics.
- [Apple symbolication](https://developer.apple.com/documentation/xcode/adding-identifiable-symbol-names-to-a-crash-report)
  and [debug information](https://developer.apple.com/documentation/xcode/building-your-app-to-include-debugging-information):
  matching binary/dSYM UUIDs and source positions.
- [ADR 0003](../0003-real-user-monitoring.md),
  [ADR 0010 §7](../0010-single-ingress.md#7-symbol-and-artifact-uploads-go-through-the-collector),
  proposed [ADR 0008 §4](https://github.com/fuseone-io/fusescope/pull/214).
