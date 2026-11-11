"""A --teardown run sets up the fixtures, so their finalizers are registered,
skips the test bodies, which would only fail on the empty stack, runs the
finalizers and exits 0 (#345)."""

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


def test_body(resource):
    record("body")
"""


def run(tmp_path: Path, *options: str) -> tuple[subprocess.CompletedProcess, list[str]]:
    events = tmp_path / "events.txt"
    events.unlink(missing_ok=True)
    (tmp_path / "conftest.py").write_text(CONFTEST)
    (tmp_path / "test_suite.py").write_text(SUITE.format(events=str(events)))
    (tmp_path / "pytest.ini").write_text("[pytest]\n")
    env = os.environ | {"PYTHONPATH": str(TESTS)}
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-p", "fixtures.reuse", "-p", "no:cacheprovider", "-rs", "-c", str(tmp_path / "pytest.ini"), "--rootdir", str(tmp_path), str(tmp_path), *options],
        capture_output=True,
        text=True,
        env=env,
        cwd=tmp_path,
        check=False,
    )
    return result, events.read_text().split() if events.exists() else []


@pytest.mark.parametrize(
    ("options", "events", "summary"),
    [
        (["--teardown"], ["setup", "finalizer"], "1 skipped"),
        ([], ["setup", "body", "finalizer"], "1 passed"),
        (["--reuse"], ["setup", "body", "finalizer"], "1 passed"),
    ],
)
def test_teardown_skips_only_the_body(tmp_path: Path, options: list[str], events: list[str], summary: str) -> None:
    result, recorded = run(tmp_path, *options)
    assert result.returncode == 0, result.stdout + result.stderr
    assert recorded == events
    assert summary in result.stdout
