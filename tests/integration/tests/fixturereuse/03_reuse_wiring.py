"""The migrator's cache check works only through reuse.wrap and the factories
that request it: a migration cached for another migrator is run again, and a
stack restored under --reuse still requests the migrator."""

import ast
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
    def __init__(self, mode: str, cache: dict) -> None:
        self.options = {
            "--reuse": True,
            "--teardown": False,
            "--rebuild": False,
            "--schema-migrator": mode,
            "--fusescope-schema-version": FUSESCOPE,
            "--schema-migrator-version": "0.145.0",
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


class Result:
    def __init__(self, rows: list) -> None:
        self.result_rows = rows


class Past0001:
    """A ClickHouse fusescope-schema migrated through 0002."""

    def __init__(self) -> None:
        self.queried = False

    def query(self, sql: str) -> Result:
        self.queried = True
        return Result([[1]])


class Clickhouse:
    def __init__(self) -> None:
        self.conn = Past0001()


def cached_migrator(mode: str) -> dict:
    return {"migrator": {"name": "migrator", "identity": migrator.identity(Config(mode, {}), None)}}


def run_migrator(mode: str, cache: dict, clickhouse: Clickhouse) -> types.Operation:
    config = Config(mode, cache)
    return migrator.create_migrator(network=None, clickhouse=clickhouse, request=Request(config), pytestconfig=config)


def test_a_migration_cached_for_fusescope_schema_runs_the_fork_which_refuses() -> None:
    clickhouse = Clickhouse()
    with pytest.raises(RuntimeError, match="not supported"):
        run_migrator("fork", cached_migrator("fusescope"), clickhouse)
    assert clickhouse.conn.queried


def test_a_migration_cached_for_the_same_migrator_is_reused() -> None:
    clickhouse = Clickhouse()
    op = run_migrator("fork", cached_migrator("fork"), clickhouse)
    assert op.identity == migrator.identity(Config("fork", {}), None)
    assert not clickhouse.conn.queried


def test_a_restored_signoz_requests_the_migrator() -> None:
    port = {"scheme": "http", "address": "localhost", "port": 8080}
    config = Config("fusescope", {"signoz": {"id": "cached", "host_configs": {"8080": port}, "container_configs": {"8080": port}}})
    request = Request(config)
    restored = signoz.create_signoz(network=None, zeus=None, gateway=None, sqlstore=None, clickhouse=None, request=request, pytestconfig=config)
    assert restored.self.id == "cached"
    assert "migrator" in request.requested


@pytest.mark.parametrize("module", ["signoz.py", "otelcollector.py", "fusescopecollector.py"])
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
