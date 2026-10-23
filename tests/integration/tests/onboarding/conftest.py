import pytest
from testcontainers.core.container import Network

from fixtures import types
from fixtures.auth import register_admin
from fixtures.signoz import create_signoz


@pytest.fixture(name="signoz", scope="package")
def signoz_onboarding(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    otel_collector: types.TestContainerDocker,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    """global.ingestion_url is configured, and the RUM gateway gives the backend a collector to probe."""
    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz_onboarding",
        env_overrides={
            "SIGNOZ_GLOBAL_INGESTION__URL": "https://ingest.fusescope.test",
            "SIGNOZ_RUM_ENABLED": True,
            "SIGNOZ_RUM_COLLECTOR__ENDPOINT": otel_collector.container_configs["4318"].base(),
        },
    )


@pytest.fixture(name="signoz_derived", scope="package")
def signoz_derived(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    """A second SigNoz on the same stores with no global.ingestion_url, so the endpoints are derived, and no RUM gateway, so no collector to probe."""
    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz_onboarding_derived",
        env_overrides={
            "SIGNOZ_GLOBAL_INGESTION__URL": "<unset>",
            "SIGNOZ_GLOBAL_EXTERNAL__URL": "https://fusescope.example.com",
            "SIGNOZ_RUM_ENABLED": False,
        },
    )


@pytest.fixture(name="create_user_admin", scope="package")
def create_user_admin_onboarding(signoz: types.SigNoz, request: pytest.FixtureRequest, pytestconfig: pytest.Config) -> types.Operation:
    return register_admin(signoz, request, pytestconfig, cache_key="create_user_admin_onboarding")
