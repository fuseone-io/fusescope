import json

import docker
import pytest
from testcontainers.core.container import DockerContainer, Network

from fixtures import reuse, types
from fixtures.logger import setup_logger

logger = setup_logger(__name__)

FUSESCOPE_SCHEMA_DIR = "/etc/fusescope-schema"


def create_migrator(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
    cache_key: str = "migrator",
    env_overrides: dict | None = None,
) -> types.Operation:
    """
    Factory function for running schema migrations with the migrator
    --schema-migrator selects. Accepts optional env_overrides to customize the
    migrator environment; the release comes from --fusescope-schema-version or,
    for the fork, --schema-migrator-version.
    """

    def create() -> types.Operation:
        if pytestconfig.getoption("--schema-migrator") == "fusescope":
            return create_fusescope_schema()
        return create_fork()

    def create_fusescope_schema() -> types.Operation:
        address = clickhouse.container.container_configs["9000"]
        config = {
            "endpoint": f"{address.address}:{address.port}",
            "username": clickhouse.env["SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_USERNAME"],
            "password_file": f"{FUSESCOPE_SCHEMA_DIR}/password",
            "tls": {"insecure": True},
            "cluster": clickhouse.env["SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_CLUSTER"],
        }

        container = DockerContainer(image=f"ghcr.io/fuseone-io/fusescope-collector:{pytestconfig.getoption('--fusescope-schema-version')}")
        container.with_copy_into_container(json.dumps(config).encode(), f"{FUSESCOPE_SCHEMA_DIR}/config.json")
        container.with_copy_into_container(clickhouse.env["SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_PASSWORD"].encode(), f"{FUSESCOPE_SCHEMA_DIR}/password")
        container.with_kwargs(entrypoint="/fusescope-schema")
        container.with_command(f"migrate --config={FUSESCOPE_SCHEMA_DIR}/config.json")
        container.with_envs(**(env_overrides or {}))
        container.with_network(network=network)
        container.start()

        wrapped = container.get_wrapped_container()
        result = wrapped.wait()
        logs = wrapped.logs().decode(encoding="utf-8")
        wrapped.remove()
        if result["StatusCode"] != 0:
            print(logs)
            raise RuntimeError(f"fusescope-schema migrate exited {result['StatusCode']}")

        return types.Operation(name=cache_key)

    def create_fork() -> types.Operation:
        migrator_version = request.config.getoption("--schema-migrator-version")
        client = docker.from_env()

        environment = dict(env_overrides) if env_overrides else {}

        container = client.containers.run(
            image=f"ghcr.io/fuseone-io/fusescope-schema-migrator:{migrator_version}",
            command=f"sync --replication=true --cluster-name=cluster --up= --dsn={clickhouse.env['SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN']}",
            detach=True,
            auto_remove=False,
            network=network.id,
            environment=environment,
        )

        result = container.wait()

        if result["StatusCode"] != 0:
            logs = container.logs().decode(encoding="utf-8")
            container.remove()
            print(logs)
            raise RuntimeError("failed to run migrations on clickhouse")

        container.remove()

        container = client.containers.run(
            image=f"ghcr.io/fuseone-io/fusescope-schema-migrator:{migrator_version}",
            command=f"async --replication=true --cluster-name=cluster --up= --dsn={clickhouse.env['SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN']}",
            detach=True,
            auto_remove=False,
            network=network.id,
            environment=environment,
        )

        result = container.wait()

        if result["StatusCode"] != 0:
            logs = container.logs().decode(encoding="utf-8")
            container.remove()
            print(logs)
            raise RuntimeError("failed to run migrations on clickhouse")

        container.remove()

        return types.Operation(name=cache_key)

    def delete(_: types.Operation) -> None:
        pass

    def restore(cache: dict) -> types.Operation:
        return types.Operation(name=cache["name"])

    return reuse.wrap(
        request,
        pytestconfig,
        cache_key,
        lambda: types.Operation(name=""),
        create,
        delete,
        restore,
    )


@pytest.fixture(name="migrator", scope="package")
def migrator(
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.Operation:
    return create_migrator(
        network=network,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
    )
