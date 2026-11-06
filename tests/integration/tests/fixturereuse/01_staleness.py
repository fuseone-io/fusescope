"""Under --reuse a cached resource is restored only while it still matches the
run: switching --otlp-collector or a version must not silently reuse the other
collector, nor a backend pointed at a removed one (#225)."""

import pytest

from fixtures import reuse

FUSESCOPE = "ghcr.io/fuseone-io/fusescope-collector:0.3.1"
FORK = "ghcr.io/fuseone-io/fusescope-otel-collector:0.145.0"


def attrs(image: str = "", env: list[str] | None = None) -> dict:
    return {"Config": {"Image": image, "Env": env or []}}


@pytest.mark.parametrize(
    ("running", "wanted", "stale"),
    [
        (FUSESCOPE, FUSESCOPE, False),
        (FUSESCOPE, FORK, True),
        (FORK, FUSESCOPE, True),
        (FUSESCOPE, "ghcr.io/fuseone-io/fusescope-collector:0.3.0", True),
        ("", FUSESCOPE, True),
    ],
)
def test_image_differs(running: str, wanted: str, stale: bool) -> None:
    assert reuse.image_differs(attrs(image=running), wanted) is stale


@pytest.mark.parametrize(
    ("running", "wanted", "stale"),
    [
        (["A=1", "ENDPOINT=http://collector-a:4318"], {"ENDPOINT": "http://collector-a:4318"}, False),
        (["ENDPOINT=http://collector-a:4318"], {"ENDPOINT": "http://collector-b:4318"}, True),
        (["A=1"], {"ENDPOINT": "http://collector-a:4318"}, True),
        (["URL=https://x=y"], {"URL": "https://x=y"}, False),
        ([], {}, False),
    ],
)
def test_env_differs(running: list[str], wanted: dict, stale: bool) -> None:
    assert reuse.env_differs(attrs(env=running), wanted) is stale
