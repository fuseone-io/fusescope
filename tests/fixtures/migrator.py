import json

import pytest
from testcontainers.core.container import DockerContainer, Network

from fixtures import reuse, types
from fixtures.logger import setup_logger

logger = setup_logger(__name__)

FUSESCOPE_SCHEMA_DIR = "/etc/fusescope-schema"


def identity(pytestconfig: pytest.Config, env_overrides: dict | None) -> str:
    """The migration a run selects: fusescope-schema's version and the overrides.
    Under --reuse a migration cached with another identity, the earlier fork's
    included, is run again. The format is the fusescope mode's from before the
    fork mode was removed (#229), so stacks reused since are not migrated again."""
    version = pytestconfig.getoption("--fusescope-schema-version")
    return json.dumps({"migrator": "fusescope", "version": version, "env": env_overrides or {}}, sort_keys=True)


def create_migrator(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
    cache_key: str = "migrator",
    env_overrides: dict | None = None,
) -> types.Operation:
    """
    Factory function for running schema migrations with fusescope-schema, the
    release --fusescope-schema-version selects. Accepts optional env_overrides to
    customize the migrator environment.
    """

    wanted = identity(pytestconfig, env_overrides)

    def create() -> types.Operation:
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
        # Up to the logs: a failure while it runs or exits removes it; the
        # normal removal below runs after a zero or a non-zero exit.
        with reuse.removed_on_failure(container):
            container.start()
            wrapped = container.get_wrapped_container()
            result = wrapped.wait()
            logs = wrapped.logs().decode(encoding="utf-8")
        wrapped.remove()
        if result["StatusCode"] != 0:
            print(logs)
            raise RuntimeError(f"fusescope-schema migrate exited {result['StatusCode']}")

        return types.Operation(name=cache_key, identity=wanted)

    def delete(_: types.Operation) -> None:
        pass

    def restore(cache: dict) -> types.Operation:
        return types.Operation(name=cache["name"], identity=cache.get("identity", ""))

    return reuse.wrap(
        request,
        pytestconfig,
        cache_key,
        lambda: types.Operation(name=""),
        create,
        delete,
        restore,
        stale=lambda op: op.identity != wanted,
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
