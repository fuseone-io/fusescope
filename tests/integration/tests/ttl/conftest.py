import pytest
from testcontainers.core.container import Network

from fixtures import types
from fixtures.signoz import create_signoz


@pytest.fixture(name="signoz_retention_defaults", scope="package")
def signoz_retention_defaults(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    """
    A second SigNoz on the same stores, configured with 3 days of default retention per
    signal and a short reconcile interval.
    """
    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz_retention_defaults",
        env_overrides={
            "SIGNOZ_RETENTION_DEFAULT_LOGS": "3",
            "SIGNOZ_RETENTION_DEFAULT_TRACES": "3",
            "SIGNOZ_RETENTION_DEFAULT_METRICS": "3",
            "SIGNOZ_RETENTION_RECONCILE__INTERVAL": "2s",
        },
    )
