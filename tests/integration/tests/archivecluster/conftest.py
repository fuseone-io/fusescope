from collections.abc import Generator
from typing import Any

import pytest
from testcontainers.core.container import Network

from fixtures import types
from fixtures.auth import register_admin
from fixtures.clickhouse import create_clickhouse_cluster
from fixtures.keeper import create_clickhouse_keeper
from fixtures.migrator import create_migrator
from fixtures.signoz import create_signoz


@pytest.fixture(name="keeper", scope="package")
def keeper_archivecluster(
    tmpfs: Generator[types.LegacyPath, Any],
    network: Network,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.TestContainerDocker:
    return create_clickhouse_keeper(tmpfs=tmpfs, network=network, request=request, pytestconfig=pytestconfig, cache_key="keeper_archivecluster")


@pytest.fixture(name="clickhouse", scope="package")
def clickhouse_archivecluster(
    tmpfs: Generator[types.LegacyPath, Any],
    network: Network,
    keeper: types.TestContainerDocker,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.TestContainerClickhouse:
    return create_clickhouse_cluster(
        tmpfs=tmpfs,
        network=network,
        keeper=keeper,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="clickhouse_archivecluster",
        shards=2,
    )


@pytest.fixture(name="migrator", scope="package")
def migrator_archivecluster(
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.Operation:
    return create_migrator(network=network, clickhouse=clickhouse, request=request, pytestconfig=pytestconfig, cache_key="migrator_archivecluster")


@pytest.fixture(name="signoz", scope="package")
def signoz_archivecluster(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
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
        cache_key="signoz_archivecluster",
    )


@pytest.fixture(name="create_user_admin", scope="package")
def create_user_admin_archivecluster(signoz: types.SigNoz, request: pytest.FixtureRequest, pytestconfig: pytest.Config) -> types.Operation:
    return register_admin(signoz, request, pytestconfig, cache_key="create_user_admin_archivecluster")


@pytest.fixture(name="signoz_archive", scope="package")
def signoz_archive_archivecluster(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    archive_named_collection: str,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    """A second SigNoz on the two-shard cluster with the logs archive enabled and a short cycle interval."""
    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz_archive_archivecluster",
        env_overrides={
            "SIGNOZ_ARCHIVE_INTERVAL": "2s",
            "SIGNOZ_ARCHIVE_LOGS_ENABLED": "true",
            "SIGNOZ_ARCHIVE_LOGS_NAMED__COLLECTION": archive_named_collection,
            "SIGNOZ_ARCHIVE_LOGS_PREFIX": "fusescope",
            "SIGNOZ_ARCHIVE_LOGS_BACKSTOP__DAYS": "7",
        },
    )
