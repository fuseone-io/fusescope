"""Under --teardown every resource is empty, so a fixture must not read another
resource's ports before reuse.wrap: the KeyError aborts its setup, its
finalizer is never registered and its parked container is left running
(#345)."""

import ast
import importlib.util
import inspect
from pathlib import Path

import pytest

from fixtures import reuse, signoz, types

TESTS = Path(__file__).parents[3]
CACHED = {"id": "parked", "host_configs": {}, "container_configs": {}}


class Cache:
    """With parked, every key not set yet holds a container a --reuse run parked."""

    def __init__(self, entries: dict, parked: dict | None = None) -> None:
        self.entries = dict(entries)
        self.parked = parked

    def get(self, key: str, default=None):
        return self.entries.get(key, self.parked if self.parked is not None else default)

    def set(self, key: str, value) -> None:
        self.entries[key] = value


class Config:
    def __init__(self, cache: dict, parked: dict | None = None) -> None:
        self.options = {"--reuse": False, "--teardown": True, "--rebuild": False}
        self.cache = Cache(cache, parked)

    def getoption(self, name: str):
        return self.options[name]


class Request:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.finalizers: list = []

    def getfixturevalue(self, _: str) -> None:
        pass

    def addfinalizer(self, finalizer) -> None:
        self.finalizers.append(finalizer)


class Docker:
    """Records the containers a finalizer stops and removes."""

    def __init__(self) -> None:
        self.removed: list[str] = []
        self.stopped: list[str] = []

    def get(self, container_id: str) -> "Docker.Container":
        return Docker.Container(self, container_id)

    class Container:
        def __init__(self, docker: "Docker", container_id: str) -> None:
            self.docker, self.id = docker, container_id

        def stop(self) -> None:
            self.docker.stopped.append(self.id)

        def remove(self, v: bool = False) -> None:  # pylint: disable=invalid-name,unused-argument
            self.docker.removed.append(self.id)


class Client:  # pylint: disable=too-few-public-methods
    def __init__(self, docker: Docker) -> None:
        self.containers = docker


def empty() -> types.TestContainerDocker:
    """What a container fixture returns under --teardown."""
    return types.TestContainerDocker(id="", host_configs={}, container_configs={})


EMPTY = {
    types.TestContainerDocker: empty,
    types.TestContainerSQL: lambda: types.TestContainerSQL(container=empty(), conn=None, env={}),
    types.TestContainerClickhouse: lambda: types.TestContainerClickhouse(container=empty(), conn=None, env={}),
    dict: dict,
}


def signoz_fixtures() -> list:
    """Every fixture in a conftest.py that creates a SigNoz container."""
    found = []
    for path in sorted(TESTS.rglob("conftest.py")):
        if ".venv" in path.parts:
            continue
        for node in ast.parse(path.read_text()).body:
            if not isinstance(node, ast.FunctionDef) or not any("fixture" in ast.unparse(d) for d in node.decorator_list):
                continue
            if any(isinstance(call, ast.Call) and getattr(call.func, "id", "") == "create_signoz" for call in ast.walk(node)):
                found.append(pytest.param(path, node.name, id=f"{path.parent.relative_to(TESTS)}::{node.name}"))
    return found


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(f"teardown_{abs(hash(path))}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, name).__wrapped__


def test_the_known_fixtures_are_swept() -> None:
    ids = {param.id for param in signoz_fixtures()}
    assert {
        "integration/tests/onboarding::signoz_onboarding",
        "integration/tests/alertmanager::signoz",
        "integration/tests/alertmanagerrotation::signoz",
    } <= ids


@pytest.mark.parametrize(("path", "name"), signoz_fixtures())
def test_teardown_removes_the_parked_signoz(monkeypatch: pytest.MonkeyPatch, tmp_path_factory: pytest.TempPathFactory, path: Path, name: str) -> None:
    """Every SigNoz fixture sets up on empty resources under --teardown, and its
    finalizer removes the container the --reuse run parked and clears its key."""
    docker = Docker()
    monkeypatch.setattr(signoz.docker, "from_env", lambda: Client(docker))
    config = Config({}, parked=CACHED)
    request = Request(config)
    function = load(path, name)
    arguments = {}
    for parameter in inspect.signature(function).parameters.values():
        if parameter.name == "request":
            arguments[parameter.name] = request
        elif parameter.name == "pytestconfig":
            arguments[parameter.name] = config
        elif parameter.annotation is pytest.TempPathFactory:
            arguments[parameter.name] = tmp_path_factory
        elif parameter.annotation in EMPTY:
            arguments[parameter.name] = EMPTY[parameter.annotation]()
        else:
            arguments[parameter.name] = None

    function(**arguments)

    assert len(request.finalizers) == 1
    request.finalizers[0]()
    assert docker.stopped == ["parked"]
    assert docker.removed == ["parked"]
    assert list(config.cache.entries.values()) == [None]


def test_teardown_finalizers_after_a_failing_delete_still_run() -> None:
    """A delete that fails leaves its own key for the next --teardown and does
    not stop the other resources' finalizers, which pytest runs one by one."""
    config = Config({"a": {"id": "a"}, "b": {"id": "b"}})
    request = Request(config)
    removed: list[str] = []

    def fail(_: dict) -> None:
        raise RuntimeError("docker unavailable")

    for key, delete in (("a", fail), ("b", lambda resource: removed.append(resource["id"]))):
        reuse.wrap(request, config, key, empty=dict, create=dict, delete=delete, restore=lambda cache: cache)

    errors = []
    for finalizer in reversed(request.finalizers):
        try:
            finalizer()
        except RuntimeError as error:
            errors.append(error)

    assert removed == ["b"]
    assert config.cache.get("b") is None
    assert config.cache.get("a") == {"id": "a"}
    assert len(errors) == 1
