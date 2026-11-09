from collections.abc import Generator
from typing import Any

import pytest
from testcontainers.core.container import Network

from fixtures import types
from fixtures.fusescopecollector import create_otlp_collector


@pytest.fixture(name="otel_collector", scope="package")
def otel_collector(  # pylint: disable=too-many-arguments,too-many-positional-arguments,unused-argument
    tmpfs: Generator[types.LegacyPath, Any],
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.TestContainerDocker:
    """The OTLP collector the suites send to: the FuseScope collector, as the chart installs it
    (#225). The earlier collector's mode is removed (#229)."""
    return create_otlp_collector(network, clickhouse, request, pytestconfig)
