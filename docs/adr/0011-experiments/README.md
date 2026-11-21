# Native symbolication P1: owned fixtures and bounded measurements

Experiment for accepted [ADR 0011](../0011-native-symbolication.md), tracked by
[#442](https://github.com/fuseone-io/fusescope/issues/442) under shared plan
[#191](https://github.com/fuseone-io/fusescope/issues/191) and Android level 2
[#441](https://github.com/fuseone-io/fusescope/issues/441).

This is an isolated command and fixture generator. It adds no backend endpoint,
artifact storage/schema, collector pipeline or production symbolication. It
does not load or execute the fixture binaries. No dependency was added; parsing
uses Go's `debug/elf`, `debug/macho` and `debug/dwarf`, plus existing error/test
helpers. Fixture sources are ours, not copied from a vendor SDK.

## Reproduce on Linux/amd64

Requirements: Go 1.26.10, GCC/binutils, Bash, Python 3, GNU time, timeout and
prlimit. macOS is not required to cross-build the thin Mach-O fixture.

From the repository root:

```sh
GOTOOLCHAIN=go1.26.10 go test -race ./docs/adr/0011-experiments -count=1
GOTOOLCHAIN=go1.26.10 go vet ./docs/adr/0011-experiments
bash docs/adr/0011-experiments/generate.sh /tmp/native-symbol-p1
bash docs/adr/0011-experiments/measure.sh /tmp/native-symbol-p1 > /tmp/native-symbol-p1/results.json
```

The generator prints the ELF `native_leaf` and Mach-O `main.probe` addresses.
The ELF uses `-Ttext-segment=0x200000` so its virtual address differs from its
file offset. Tests obtain the function's address independently from the symbol
table and prove that Android `rel_pc` remains unchanged, while a profiling file
offset is converted through its `PT_LOAD` segment. Mach-O tests add a nonzero
runtime slide, then remove it to recover the preferred address.

The CLI accepts an address kind, expected architecture and optional expected
GNU build ID/UUID. It builds a simple range index and resolves one address;
lookup is linear and this index is not a production cache implementation.
Missing DWARF and wrong identities/architectures are rejected. Missing lookup
results retain empty function/file/line fields rather than inventing a match.

Compiler versions, source paths and build flags can change build IDs and UUIDs.
Tests discover identities from the contents rather than hardcoding them. The
recorded results include SHA-256 for the exact measured artifacts; regenerating
with a different toolchain or checkout path need not produce the same hashes.

The ELF32 regression fixture is compiled with `gcc -m32 -c` and linked with
`ld -m elf_i386 -shared`, without a 32-bit libc dependency. It verifies relative
PCs, file-offset mapping, build IDs and zlib DWARF lookup, plus decoded-size and
truncated-header rejection. This is x86 evidence, not Android ARM/NDK evidence;
the initial measurement table below predates this extension.

## Initial measurements, recorded 2026-11-20

Linux x86_64, Go 1.26.10, GCC 13.3.0, binutils 2.42. Five independent processes
per artifact; median inspection time and total allocated bytes, maximum Linux
process RSS. Inspection includes preflight, DWARF extraction, range-index
construction, one lookup, JSON sizing of the index and memory-stat collection.
It excludes reading the input file and process startup. RSS includes the input,
Go runtime and parser. These are local warm-file measurements, not SLOs.

| Fixture | File bytes | JSON index bytes | Median inspect ms | Allocated MiB | Peak RSS MiB |
|---|---:|---:|---:|---:|---:|
| ELF, DWARF 4 | 16,160 | 309 | 0.421 | 0.03 | 3.98 |
| Separate ELF debug file | 4,608 | 309 | 0.487 | 0.03 | 3.98 |
| ELF zlib sections | 16,096 | 309 | 0.434 | 0.11 | 4.23 |
| ELF, DWARF 5 | 16,256 | 309 | 0.423 | 0.03 | 3.98 |
| Synthetic ELF, 10,001 functions | 2,527,128 | 3,288,057 | 31.834 | 35.97 | 22.47 |
| Thin Mach-O ARM64, Go DWARF | 2,385,522 | 3,560,779 | 34.603 | 31.82 | 25.63 |
| ELF with debug stripped | 15,000 | rejected | — | — | 3.98 |

Raw data and exact identities: [results.json](results.json). The Mach-O fixture
resolves `main.probe` to `main.go:4`, with a UUID; the C fixture resolves
`native_leaf` to `native.c`. Separate-debug and compressed variants preserve the
original ELF identity and function lookup. The large ELF has 40,003 line ranges;
the Mach-O file has 2,283 function ranges and 49,702 line ranges, including its Go
runtime. The 10,000 extra C functions are generated from the owned template.

The serialized index exceeds the two larger input files by about 1.3–1.5x, and
parsing allocates roughly 32–36 MiB for these 2.3–2.4 MiB inputs. Raw upload size
alone therefore cannot define native quota or concurrent parsing admission.
Decoded data, derived indexes and per-worker memory/time must also count. JSON
is only a sizing baseline here; a production index format has not been chosen.

## Experimental limits and rejection coverage

The command defaults to 32 MiB raw input, 64 MiB aggregate declared decoded
sections, 4,096 headers and 200,000 DWARF entries/function ranges/line ranges.
The file and decoded limits are configurable within experimental ceilings.
These values bound the experiment; no production acceptance limit is selected
from this small sample.

Preflight rejects truncated/overflowing file ranges, excessive header counts,
section and relocation ranges (including zero-fill budget bypasses), Mach-O symbol-table counts, ELF zlib expansion
claims and unsupported formats before calling the relevant standard parser.
Panics are converted to rejected inspections. These checks do not make Go's
debug libraries a hardened in-process parser for hostile inputs.

Each measurement is run with a 10-second wall timeout, 5 CPU seconds, a 4 GiB
virtual-address-space ceiling and `GOMEMLIMIT=256MiB`. The latter is a soft Go GC
target, not an independent heap cap; RLIMIT_AS caps virtual address space, not
RSS. Resource enforcement is applied to the parser process, not a goroutine.
The measured RSS is separate from these runner ceilings.

Fuzz reproduction, from the repository root:

```sh
GOTOOLCHAIN=go1.26.10 go test -c -fuzz=FuzzPreflight -o /tmp/native-symbol-fuzz ./docs/adr/0011-experiments
cd docs/adr/0011-experiments
GOMEMLIMIT=256MiB GOMAXPROCS=2 timeout -s KILL 30s prlimit --as=8589934592 --cpu=20 -- \
  /tmp/native-symbol-fuzz -test.run='^$' -test.fuzz=FuzzPreflight \
  -test.fuzztime=10s -test.parallel=2 -test.fuzzcachedir=/tmp/native-symbol-fuzz-cache
```

The guided smoke run passed with four seeds (including real generated ELF and
Mach-O files), 3,833 executions and two new coverage-interesting inputs in about
11 seconds. Fuzz input is capped at 4 MiB and aggregate decoded sections at
16 MiB. The 8 GiB fuzz-process virtual-address-space ceiling accommodates the
instrumented runtime/workers; it is not a production memory recommendation.
The dedicated `native-symbol-spike` workflow runs race tests and this bounded
fuzz smoke with the repository's existing authorization gate. CI does not
assert local performance timings.

## Supported evidence and remaining P1 work

- Tested: little-endian ELF64 x86_64 and ELF32 x86, DWARF 4/5, standard ELF zlib compression,
  separate debug files, GNU build IDs; thin Mach-O64 ARM64 with embedded Go
  DWARF and UUID; identity/ABI mismatch, slide underflow, truncated metadata,
  symbol count/size bombs and missing debug information.
- Not established: NDK-produced ARM32/ARM64 debug files, big-endian inputs,
  fat Mach-O extraction, legacy GNU `.zdebug`, zstd, C++/Swift demangling,
  optimized/inline-frame fidelity or supplementary/split DWARF. Unsupported
  envelopes in the prototype are rejected, not advertised as production support.
- This cross-built Go Mach-O is not an Xcode dSYM. macOS/Xcode executable/dSYM
  UUID matching, multi-slice extraction, ASLR and real iOS crash acceptance
  remain required. Linux fixtures do not close F/G.
- Before closing P1 or setting production admission, measure representative
  large Android/NDK C++ and Xcode dSYM artifacts, expansion ratios, concurrent
  workers and inline-heavy inputs; choose a production index/name strategy and
  explicit supported-format matrix. Retain rejection/fuzz tests when moving
  supported adapters into the shared implementation.
- Candidate digest/context verification, stripped-binary validation,
  organization isolation, quotas, admin deletion warnings, index lifecycle,
  collector intake and actual Gradle upload are P2/P3 and #441 work. This CLI's
  declared build ID or UUID is not proof that an uploader owns a binary.

P1 remains open for those measurements and decisions. No production parser,
API or release is delivered by this experiment.
