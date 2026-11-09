"""Under --reuse the schema migration is restored only for the same fusescope-schema version and
overrides. A marker the earlier fork's migrator left (that mode is removed, #229) is stale, so the
stack is migrated by fusescope-schema, which adopts the fork's schema."""

import json

import pytest

from fixtures import migrator, types

FUSESCOPE_041 = "0.4.1@sha256:9951f2479ac6e5150b116cd856569aaae6ed921e9b951f0fd9c93160e7311077"
FUSESCOPE_040 = "0.4.0@sha256:a1e2fcd7248035b231e8d4c9c3234d617b983296464d31834fdabc1184fa24a1"


class Config:
    def __init__(self, fusescope: str = FUSESCOPE_041) -> None:
        self.options = {"--fusescope-schema-version": fusescope}

    def getoption(self, name: str) -> str:
        return self.options[name]


@pytest.mark.parametrize(
    ("cached", "wanted", "stale"),
    [
        ((Config(), None), (Config(), None), False),
        ((Config(), {"A": "1"}), (Config(), {"A": "1"}), False),
        ((Config(FUSESCOPE_040), None), (Config(), None), True),
        ((Config(), None), (Config(), {"A": "1"}), True),
    ],
)
def test_migrator_identity(cached: tuple, wanted: tuple, stale: bool) -> None:
    restored = types.Operation(name="migrator", identity=migrator.identity(*cached))
    assert (restored.identity != migrator.identity(*wanted)) is stale


def test_the_identity_keeps_its_format() -> None:
    # The same as the fusescope mode's before #229, so stacks reused since are not migrated again.
    expected = json.dumps({"migrator": "fusescope", "version": FUSESCOPE_041, "env": {}}, sort_keys=True)
    assert migrator.identity(Config(), None) == expected


def test_a_marker_from_before_the_identity_is_stale() -> None:
    assert types.Operation(name="migrator").identity != migrator.identity(Config(), None)


def test_a_marker_the_fork_left_is_stale() -> None:
    fork = json.dumps({"migrator": "fork", "version": "0.145.0", "env": {}}, sort_keys=True)
    assert types.Operation(name="migrator", identity=fork).identity != migrator.identity(Config(), None)


def test_no_fork_migrator_left() -> None:
    for name in ("require_fork_supported",):
        assert not hasattr(migrator, name), f"{name} belongs to the removed fork mode"


@pytest.mark.parametrize("option", ["--schema-migrator", "--schema-migrator-version", "--otlp-collector"])
def test_the_fork_options_are_gone(pytestconfig: pytest.Config, option: str) -> None:
    with pytest.raises(ValueError):
        pytestconfig.getoption(option)
