"""The migrator's cache check works only through reuse.wrap and the factories
that request it: a migration the earlier fork's migrator left is run again with
fusescope-schema, and a stack restored under --reuse still requests the migrator."""

import ast
import json
from pathlib import Path

import pytest

from fixtures import migrator, signoz, types

FUSESCOPE = "0.4.1@sha256:9951f2479ac6e5150b116cd856569aaae6ed921e9b951f0fd9c93160e7311077"


class Cache:
    def __init__(self, entries: dict) -> None:
        self.entries = dict(entries)

    def get(self, key: str, default=None):
        return self.entries.get(key, default)

    def set(self, key: str, value) -> None:
        self.entries[key] = value


class Config:
    def __init__(self, cache: dict) -> None:
        self.options = {
            "--reuse": True,
            "--teardown": False,
            "--rebuild": False,
            "--fusescope-schema-version": FUSESCOPE,
        }
        self.cache = Cache(cache)

    def getoption(self, name: str):
        return self.options[name]


class Request:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.requested: list[str] = []

    def getfixturevalue(self, name: str) -> None:
        self.requested.append(name)

    def addfinalizer(self, _) -> None:
        pass


class WouldRun(Exception):
    """Raised where fusescope-schema's container would start."""


class NoContainer:
    def __init__(self, image: str) -> None:
        raise WouldRun(image)


class Address:
    address, port = "clickhouse", 9000


class Clickhouse:
    """Only what fusescope-schema's config reads."""

    class container:  # pylint: disable=invalid-name,too-few-public-methods
        container_configs = {"9000": Address()}

    env = {
        "SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_USERNAME": "default",
        "SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_PASSWORD": "password",
        "SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_CLUSTER": "cluster",
    }


def cached_migrator(identity: str) -> dict:
    return {"migrator": {"name": "migrator", "identity": identity}}


def run_migrator(cache: dict) -> types.Operation:
    config = Config(cache)
    return migrator.create_migrator(network=None, clickhouse=Clickhouse(), request=Request(config), pytestconfig=config)


def test_a_migration_the_fork_left_runs_fusescope_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(migrator, "DockerContainer", NoContainer)
    fork = json.dumps({"migrator": "fork", "version": "0.145.0", "env": {}}, sort_keys=True)
    with pytest.raises(WouldRun, match="fusescope-collector"):
        run_migrator(cached_migrator(fork))


def test_a_migration_cached_for_the_same_version_is_reused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(migrator, "DockerContainer", NoContainer)
    op = run_migrator(cached_migrator(migrator.identity(Config({}), None)))
    assert op.identity == migrator.identity(Config({}), None)


def test_a_restored_signoz_requests_the_migrator() -> None:
    port = {"scheme": "http", "address": "localhost", "port": 8080}
    config = Config({"signoz": {"id": "cached", "host_configs": {"8080": port}, "container_configs": {"8080": port}}})
    request = Request(config)
    restored = signoz.create_signoz(network=None, zeus=None, gateway=None, sqlstore=None, clickhouse=None, request=request, pytestconfig=config)
    assert restored.self.id == "cached"
    assert "migrator" in request.requested


@pytest.mark.parametrize("module", ["signoz.py", "fusescopecollector.py"])
def test_factories_request_the_migrator_outside_create(module: str) -> None:
    tree = ast.parse((Path(__file__).parents[3] / "fixtures" / module).read_text())
    enclosing: list[str] = []

    def visit(node: ast.AST, function: str) -> None:
        if isinstance(node, ast.FunctionDef):
            function = node.name
        if isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "getfixturevalue" and node.args and getattr(node.args[0], "value", None) == "migrator":
            enclosing.append(function)
        for child in ast.iter_child_nodes(node):
            visit(child, function)

    visit(tree, "")
    assert enclosing, f"{module} does not request the migrator"
    assert "create" not in enclosing, f"{module} requests the migrator only when it creates its container"
