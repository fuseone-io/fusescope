import pytest
from testcontainers.core.container import Network

from fixtures import types
from fixtures.auth import register_admin
from fixtures.signoz import create_signoz


@pytest.fixture(name="signoz", scope="package")
def signoz_rum(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    otel_collector: types.TestContainerDocker,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz_rum",
        env_overrides={
            "SIGNOZ_RUM_ENABLED": True,
            "SIGNOZ_RUM_COLLECTOR__ENDPOINT": otel_collector.container_configs["4318"].base(),
            "SIGNOZ_RUM_SOURCEMAPS_MAX__FILE__SIZE": 65536,
            "SIGNOZ_RUM_SOURCEMAPS_MAX__FILES__PER__RELEASE": 5,
            "SIGNOZ_RUM_SOURCEMAPS_QUOTA": 262144,
        },
    )


@pytest.fixture(name="create_user_admin", scope="package")
def create_user_admin_rum(signoz: types.SigNoz, request: pytest.FixtureRequest, pytestconfig: pytest.Config) -> types.Operation:
    return register_admin(signoz, request, pytestconfig, cache_key="create_user_admin_rum")
