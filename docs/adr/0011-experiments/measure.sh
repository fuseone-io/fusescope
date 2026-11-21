#!/usr/bin/env bash
set -euo pipefail
fixture_dir=${1:?usage: measure.sh FIXTURE_DIRECTORY}
python3 - "$fixture_dir" <<'PY'
import json
import hashlib
import os
from pathlib import Path
import statistics
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
binary = str(root / "inspect")
cases = []
for name in ["native.so", "native.debug", "native-zlib.so", "native-dwarf5.so", "native-large.so", "native-stripped.so"]:
    symbols = subprocess.check_output(["nm", "-D", "--defined-only", str(root / ("native.so" if name == "native.debug" else name))], text=True)
    address = next(line.split()[0] for line in symbols.splitlines() if line.split()[-1] == "native_leaf")
    cases.append((name, ["-file", str(root / name), "-kind", "elf_rel_pc", "-address", "0x" + address]))
symbols = subprocess.check_output(["go", "tool", "nm", str(root / "macho-arm64")], text=True)
address = next(line.split()[0] for line in symbols.splitlines() if line.split()[-1] == "main.probe")
cases.append(("macho-arm64", ["-file", str(root / "macho-arm64"), "-kind", "macho_runtime_pc", "-address", hex(int(address, 16) + 0x400000), "-slide", "0x400000"]))
reports = []
for name, args in cases:
    samples = []
    peaks = []
    errors = []
    for attempt in range(5):
        memory_file = root / "peak-rss.txt"
        command = ["/usr/bin/time", "-f", "%M", "-o", str(memory_file), "timeout", "-s", "KILL", "10s", "prlimit", "--as=4294967296", "--cpu=5", "--", binary, *args]
        completed = subprocess.run(command, text=True, capture_output=True, env={**os.environ, "GOMEMLIMIT": "256MiB", "GOTOOLCHAIN": "go1.26.10"})
        peaks.append(int(memory_file.read_text().splitlines()[-1]))
        if completed.returncode:
            if name != "native-stripped.so":
                raise RuntimeError(f"{name}: {completed.returncode}: {completed.stderr}")
            errors.append(completed.stderr.strip())
        else:
            samples.append(json.loads(completed.stdout))
    report = {"fixture": name, "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest(), "file_bytes": (root / name).stat().st_size, "max_rss_kib": max(peaks), "runs": 5}
    if samples:
        first = samples[0]
        report.update({"format": first["Format"], "architecture": first["Arch"], "identity": first["Identity"], "function": first["Function"], "file": first["File"], "line": first["Line"], "lookup_address": first["LookupAddress"], "functions": first["Functions"], "line_ranges": first["Lines"], "index_json_bytes": first["IndexJSONBytes"], "inspect_ns_median": int(statistics.median(sample["InspectNs"] for sample in samples)), "allocated_bytes_median": int(statistics.median(sample["AllocatedBytes"] for sample in samples))})
        assert report["function"] and report["line"] > 0
    else:
        report["rejected"] = errors[0]
    reports.append(report)
print(json.dumps(reports, indent=2))
PY
