import pytest
from testcontainers.core.container import Network

from fixtures import types
from fixtures.signoz import create_signoz


@pytest.fixture(name="signoz_public_ratelimit", scope="package")
def signoz_public_ratelimit(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    """SigNoz with tight public dashboard limits that refill too slowly to recover within a run.
    Shares the default instance's sqlstore, so dashboards published there are served here."""
    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz-public-dashboard-ratelimit",
        env_overrides={
            "SIGNOZ_DASHBOARD_PUBLIC_RATELIMIT_LINK_RATE": 0.001,
            "SIGNOZ_DASHBOARD_PUBLIC_RATELIMIT_LINK_BURST": 4,
            "SIGNOZ_DASHBOARD_PUBLIC_RATELIMIT_CLIENT_RATE": 0.001,
            "SIGNOZ_DASHBOARD_PUBLIC_RATELIMIT_CLIENT_BURST": 2,
            "SIGNOZ_RUM_RATELIMIT_TRUST__FORWARDED__FOR": True,
        },
    )
