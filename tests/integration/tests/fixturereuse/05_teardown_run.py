"""A --teardown run sets up the fixtures, so their finalizers are registered,
skips the test bodies, which would only fail on the empty stack, runs the
finalizers and exits 0 (#345). A body marked run_on_teardown, such as the e2e
bootstrap's test_teardown that truncates the seeded telemetry, still runs,
before the finalizers."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

TESTS = Path(__file__).parents[3]

CONFTEST = """
def pytest_addoption(parser):
    parser.addoption("--reuse", action="store_true", default=False)
    parser.addoption("--teardown", action="store_true", default=False)
"""

SUITE = """
import pytest

EVENTS = {events!r}


def record(event):
    with open(EVENTS, "a") as f:
        f.write(event + "\\n")


@pytest.fixture
def resource(request):
    record("setup")
    request.addfinalizer(lambda: record("finalizer"))


{marker}
def test_body(resource):
    record("body")
"""


def run(tmp_path: Path, *options: str, marker: str = "") -> tuple[subprocess.CompletedProcess, list[str]]:
    events = tmp_path / "events.txt"
    events.unlink(missing_ok=True)
    (tmp_path / "conftest.py").write_text(CONFTEST)
    (tmp_path / "test_suite.py").write_text(SUITE.format(events=str(events), marker=marker))
    (tmp_path / "pytest.ini").write_text("[pytest]\n")
    env = os.environ | {"PYTHONPATH": str(TESTS)}
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-p", "fixtures.reuse", "-p", "no:cacheprovider", "-rs", "--strict-markers", "-c", str(tmp_path / "pytest.ini"), "--rootdir", str(tmp_path), str(tmp_path), *options],
        capture_output=True,
        text=True,
        env=env,
        cwd=tmp_path,
        check=False,
    )
    return result, events.read_text().split() if events.exists() else []


@pytest.mark.parametrize(
    ("options", "marker", "events", "summary"),
    [
        (["--teardown"], "", ["setup", "finalizer"], "1 skipped"),
        ([], "", ["setup", "body", "finalizer"], "1 passed"),
        (["--reuse"], "", ["setup", "body", "finalizer"], "1 passed"),
        (["--teardown"], "@pytest.mark.run_on_teardown", ["setup", "body", "finalizer"], "1 passed"),
        ([], "@pytest.mark.run_on_teardown", ["setup", "body", "finalizer"], "1 passed"),
    ],
)
def test_teardown_skips_only_the_body(tmp_path: Path, options: list[str], marker: str, events: list[str], summary: str) -> None:  # pylint: disable=too-many-arguments,too-many-positional-arguments
    result, recorded = run(tmp_path, *options, marker=marker)
    assert result.returncode == 0, result.stdout + result.stderr
    assert recorded == events
    assert summary in result.stdout


@pytest.mark.parametrize("module", ["e2e/bootstrap/setup.py", "e2e/bootstrap/basepath/setup.py"])
def test_the_e2e_bootstrap_teardown_runs_on_teardown(module: str) -> None:
    """Collected, under --teardown, with its marker, also where basepath imports it."""
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-p", "no:cacheprovider", "--strict-markers", "--collect-only", "-q", "--teardown", "-m", "run_on_teardown", module],
        capture_output=True,
        text=True,
        cwd=TESTS,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert [line for line in result.stdout.splitlines() if "::" in line] == [f"{module}::test_teardown"]
