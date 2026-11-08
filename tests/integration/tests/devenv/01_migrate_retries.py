"""make devenv-clickhouse and make dev rerun fusescope-schema migrate through
.devenv/scripts/migrate.sh: on exit 2 only, up to 10 times as the chart's Job
does, and waiting for every run it starts. Here docker is a fake on PATH that
exits each `docker wait` with the next code of a sequence."""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[4] / ".devenv" / "scripts" / "migrate.sh"

FAKE_DOCKER = """#!/bin/sh
echo "$*" >> "$CALLS"
case "$1" in
  wait)
    n=$(grep -c '^wait' "$CALLS")
    code=$(echo "$CODES" | cut -d' ' -f"$n")
    echo "${code:?no code left}" ;;
  logs) echo "fake log" ;;
esac
"""


@pytest.mark.parametrize(
    ("codes", "exit_code", "runs"),
    [
        ("0", 0, 1),
        ("2 2 0", 0, 3),
        ("2 2 2 2 2 2 2 2 2 2 0", 0, 11),
        ("2 2 2 2 2 2 2 2 2 2 2", 1, 11),
        ("1", 1, 1),
        ("4", 1, 1),
        ("2 1", 1, 2),
        ("2 4", 1, 2),
    ],
)
def test_migrate_reruns_on_exit_2_only(tmp_path: Path, codes: str, exit_code: int, runs: int) -> None:
    (tmp_path / "docker").write_text(FAKE_DOCKER)
    (tmp_path / "docker").chmod(0o755)
    calls = tmp_path / "calls"
    calls.touch()
    env = os.environ | {"PATH": f"{tmp_path}:{os.environ['PATH']}", "CALLS": str(calls), "CODES": codes, "MIGRATE_RETRY_DELAY": "0"}
    result = subprocess.run(["sh", str(SCRIPT), "compose.yaml"], env=env, capture_output=True, text=True, check=False)
    lines = calls.read_text().splitlines()
    waits = [line for line in lines if line.startswith("wait")]
    starts = [line for line in lines if line == "compose -f compose.yaml start telemetrystore-migrator"]
    assert result.returncode == exit_code, result.stderr
    # Every run started is waited for: the first, from up, and each rerun.
    assert (len(waits), len(starts)) == (runs, runs - 1), lines
    if exit_code:
        assert "fake log" in result.stderr


REPO = Path(__file__).parents[4]


def run_make(tmp_path: Path, codes: str, *args: str) -> tuple[subprocess.CompletedProcess, list[str]]:
    (tmp_path / "docker").write_text(FAKE_DOCKER)
    (tmp_path / "docker").chmod(0o755)
    calls = tmp_path / "calls"
    calls.touch()
    env = os.environ | {"PATH": f"{tmp_path}:{os.environ['PATH']}", "CALLS": str(calls), "CODES": codes, "MIGRATE_RETRY_DELAY": "0"}
    result = subprocess.run(["make", "-s", "-C", str(REPO), *args], env=env, capture_output=True, text=True, check=False)
    return result, [line for line in calls.read_text().splitlines() if not line.startswith("logs")]


AGGREGATE = "compose -f .devenv/docker/compose.yaml"


@pytest.mark.parametrize(
    ("codes", "ok", "calls"),
    [
        ("0", True, [f"{AGGREGATE} up -d telemetrystore-migrator", "wait telemetrystore-migrator", f"{AGGREGATE} up -d"]),
        (
            "2 0",
            True,
            [f"{AGGREGATE} up -d telemetrystore-migrator", "wait telemetrystore-migrator", f"{AGGREGATE} start telemetrystore-migrator", "wait telemetrystore-migrator", f"{AGGREGATE} up -d"],
        ),
        ("1", False, [f"{AGGREGATE} up -d telemetrystore-migrator", "wait telemetrystore-migrator"]),
        ("2 4", False, [f"{AGGREGATE} up -d telemetrystore-migrator", "wait telemetrystore-migrator", f"{AGGREGATE} start telemetrystore-migrator", "wait telemetrystore-migrator"]),
    ],
)
def test_make_dev_migrates_before_the_full_compose(tmp_path: Path, codes: str, ok: bool, calls: list[str]) -> None:
    # The full `up -d` waits for the collector's schema check, which waits for
    # the migration: it may start only once the migration has succeeded.
    result, got = run_make(tmp_path, codes, "devenv-compose")
    assert (result.returncode == 0) is ok, result.stderr
    assert got == calls


def test_make_dev_starts_with_devenv_compose() -> None:
    dry = subprocess.run(["make", "-n", "-C", str(REPO), "dev"], capture_output=True, text=True, check=True).stdout.splitlines()
    commands = [line for line in dry if "docker compose" in line or "migrate.sh" in line]
    assert [c.split("docker compose -f .devenv/docker/compose.yaml ")[-1] for c in commands[:3]] == [
        "up -d telemetrystore-migrator",
        ".devenv/scripts/migrate.sh .devenv/docker/compose.yaml",
        "up -d",
    ], commands
