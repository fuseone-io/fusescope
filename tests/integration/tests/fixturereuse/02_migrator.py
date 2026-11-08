"""Under --reuse the schema migration is restored only for the same migrator,
version and overrides, and the fork's migrator refuses a ClickHouse that
fusescope-schema migrated past 0001: after its 0002 the fork is not supported
there, so reusing the marker would pass on a schema the fork never ran on."""

import pytest

from fixtures import migrator, types

FUSESCOPE_041 = "0.4.1@sha256:9951f2479ac6e5150b116cd856569aaae6ed921e9b951f0fd9c93160e7311077"
FUSESCOPE_040 = "0.4.0@sha256:a1e2fcd7248035b231e8d4c9c3234d617b983296464d31834fdabc1184fa24a1"


class Config:
    def __init__(self, mode: str, fusescope: str = FUSESCOPE_041, fork: str = "0.145.0") -> None:
        self.options = {"--schema-migrator": mode, "--fusescope-schema-version": fusescope, "--schema-migrator-version": fork}

    def getoption(self, name: str) -> str:
        return self.options[name]


@pytest.mark.parametrize(
    ("cached", "wanted", "stale"),
    [
        ((Config("fusescope"), None), (Config("fusescope"), None), False),
        ((Config("fork"), {"A": "1"}), (Config("fork"), {"A": "1"}), False),
        ((Config("fusescope"), None), (Config("fork"), None), True),
        ((Config("fork"), None), (Config("fusescope"), None), True),
        ((Config("fusescope", fusescope=FUSESCOPE_040), None), (Config("fusescope"), None), True),
        ((Config("fork", fork="0.144.0"), None), (Config("fork"), None), True),
        ((Config("fork"), None), (Config("fork"), {"A": "1"}), True),
        # A version the run does not select is no part of its identity.
        ((Config("fork", fusescope=FUSESCOPE_040), None), (Config("fork"), None), False),
    ],
)
def test_migrator_identity(cached: tuple, wanted: tuple, stale: bool) -> None:
    restored = types.Operation(name="migrator", identity=migrator.identity(*cached))
    assert (restored.identity != migrator.identity(*wanted)) is stale


def test_a_marker_from_before_the_identity_is_stale() -> None:
    assert types.Operation(name="migrator").identity != migrator.identity(Config("fusescope"), None)


class Result:
    def __init__(self, rows: list) -> None:
        self.result_rows = rows


class Conn:
    def __init__(self, migrations: list[int] | None) -> None:
        self.migrations = migrations

    def query(self, sql: str) -> Result:
        if sql.startswith("EXISTS"):
            return Result([[0 if self.migrations is None else 1]])
        return Result([[sum(1 for m in self.migrations if m > 1)]])


@pytest.mark.parametrize(
    ("migrations", "refused"),
    [(None, False), ([], False), ([1], False), ([1, 2], True), ([1, 2, 3], True)],
)
def test_the_fork_refuses_a_schema_past_0001(migrations: list[int] | None, refused: bool) -> None:
    if refused:
        with pytest.raises(RuntimeError, match="not supported"):
            migrator.require_fork_supported(Conn(migrations))
    else:
        migrator.require_fork_supported(Conn(migrations))
