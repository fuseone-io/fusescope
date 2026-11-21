"""Linux-only, isolated parser-worker experiment; no production admission policy."""
import hashlib
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
import time


def current_rss(pid):
    try:
        for line in Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    except (FileNotFoundError, ProcessLookupError):
        pass
    return 0


def batch(binary, artifact, address, width, expected="native_leaf"):
    command = ["prlimit", "--as=4294967296", "--cpu=5", "--", str(binary),
               "-file", str(artifact), "-address", address, "-kind", "elf_rel_pc"]
    workers = []
    peak_rss = 0
    started = time.monotonic()
    try:
        for _ in range(width):
            workers.append(subprocess.Popen(command, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, text=True,
                           env={**os.environ, "GOMEMLIMIT": "256MiB"}))
        while True:
            peak_rss = max(peak_rss, sum(current_rss(worker.pid) for worker in workers))
            if all(worker.poll() is not None for worker in workers):
                break
            if time.monotonic() - started > 10:
                raise TimeoutError("worker batch exceeded 10 wall seconds")
            time.sleep(0.002)
        elapsed = time.monotonic() - started
        samples = []
        for worker in workers:
            output, error = worker.communicate(timeout=1)
            if worker.returncode:
                raise RuntimeError(f"parser exit {worker.returncode}: {error}")
            sample = json.loads(output)
            if sample["Function"] != expected or sample["Line"] <= 0:
                raise RuntimeError(f"missing expected function/line: {sample}")
            samples.append(sample)
        return {"wall_ns": int(elapsed * 1e9), "sampled_peak_aggregate_rss_kib": peak_rss,
                "workers": samples}
    finally:
        for worker in workers:
            if worker.poll() is None:
                worker.kill()
            worker.communicate(timeout=1)


def measure(root):
    reports = []
    for optimization in (0, 2):
        uncompressed = root / f"cpp-o{optimization}.so"
        expected_signature = None
        for suffix in ("", "-zlib"):
            artifact = root / f"cpp-o{optimization}{suffix}.so"
            symbols = subprocess.check_output(["nm", "-D", "--defined-only", str(artifact)], text=True)
            address = "0x" + next(line.split()[0] for line in symbols.splitlines()
                                  if line.split()[-1] == "native_leaf")
            widths = []
            for width in (1, 2, 4):
                rounds = [batch(root / "inspect", artifact, address, width) for _ in range(5)]
                workers = [worker for sample in rounds for worker in sample["workers"]]
                for worker in workers:
                    signature = tuple(worker[key] for key in ("Identity", "Function", "File", "Line", "Functions", "Lines", "IndexJSONBytes"))
                    if expected_signature is None:
                        expected_signature = signature
                    if signature != expected_signature:
                        raise RuntimeError("index/identity changed across compression or workers")
                widths.append({"width": width, "rounds": 5,
                    "wall_ns_median": int(statistics.median(sample["wall_ns"] for sample in rounds)),
                    "sampled_peak_aggregate_rss_kib": max(sample["sampled_peak_aggregate_rss_kib"] for sample in rounds),
                    "inspect_ns_median": int(statistics.median(worker["InspectNs"] for worker in workers)),
                    "allocated_bytes_median": int(statistics.median(worker["AllocatedBytes"] for worker in workers)),
                    "index_json_bytes": workers[0]["IndexJSONBytes"],
                    "functions": workers[0]["Functions"], "line_ranges": workers[0]["Lines"],
                    "identity": workers[0]["Identity"], "function": workers[0]["Function"],
                    "file": workers[0]["File"], "line": workers[0]["Line"]})
            mangled = "_Z12native_extraILi42EEii"
            template_address = "0x" + next(line.split()[0] for line in symbols.splitlines()
                                           if line.split()[-1] == mangled)
            probe = batch(root / "inspect", artifact, template_address, 1, "native_extra<42>")["workers"][0]
            reports.append({"template_probe": {"linkage_name": mangled, "dwarf_name": probe["Function"],
                            "file": probe["File"], "line": probe["Line"]}, "fixture": artifact.name,
                "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
                "file_bytes": artifact.stat().st_size,
                "uncompressed_file_bytes": uncompressed.stat().st_size,
                "whole_file_expansion_ratio": uncompressed.stat().st_size / artifact.stat().st_size,
                "concurrency": widths})
    return {"toolchain": (root / "toolchain.txt").read_text().splitlines(),
            "limits": {"per_worker_cpu_seconds": 5, "per_worker_virtual_bytes": 4294967296,
                       "batch_wall_seconds": 10, "gomemlimit": "256MiB", "rss_sampling_ms": 2},
            "fixtures": reports}


if __name__ == "__main__":
    if sys.platform != "linux":
        raise SystemExit("worker RSS sampling requires Linux /proc")
    print(json.dumps(measure(Path(sys.argv[1]).resolve()), indent=2))
