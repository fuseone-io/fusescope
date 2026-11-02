import pytest
from testcontainers.core.container import Network

from fixtures import types
from fixtures.signoz import create_signoz


@pytest.fixture(name="signoz_archive", scope="package")
def signoz_archive(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    """
    A second SigNoz on the same stores with the logs archive enabled, a 7-day backstop and
    a short cycle interval.
    """
    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz_archive",
        env_overrides={
            "SIGNOZ_ARCHIVE_INTERVAL": "2s",
            "SIGNOZ_ARCHIVE_LOGS_ENABLED": "true",
            "SIGNOZ_ARCHIVE_LOGS_NAMED__COLLECTION": "archive",
            "SIGNOZ_ARCHIVE_LOGS_PREFIX": "fusescope",
            "SIGNOZ_ARCHIVE_LOGS_BACKSTOP__DAYS": "7",
        },
    )
