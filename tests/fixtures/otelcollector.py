import time
from collections.abc import Generator
from http import HTTPStatus
from typing import Any

import docker
import docker.errors
import pytest
import requests
from testcontainers.core.container import DockerContainer, Network

from fixtures import reuse, types
from fixtures.fusescopecollector import create_otlp_collector
from fixtures.logger import setup_logger

logger = setup_logger(__name__)

CONFIG_CONTAINER_PATH = "/etc/otel/config.yaml"

CONFIG_TEMPLATE = """
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
processors:
  batch:
    timeout: 1s
extensions:
  health_check:
    endpoint: 0.0.0.0:13133
exporters:
  clickhousetraces:
    datasource: {dsn}/signoz_traces
    use_new_schema: true
  clickhouselogsexporter:
    dsn: {dsn}/signoz_logs
    use_new_schema: true
  signozclickhousemetrics:
    dsn: {dsn}/signoz_metrics
service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [clickhousetraces]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [clickhouselogsexporter]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [signozclickhousemetrics]
"""


def create_otel_collector(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    tmpfs: Generator[types.LegacyPath, Any],
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
    cache_key: str = "otel_collector",
) -> types.TestContainerDocker:
    """OTLP/HTTP collector writing traces, metrics and logs to the test ClickHouse."""

    image = f"ghcr.io/fuseone-io/fusescope-otel-collector:{request.config.getoption('--collector-version')}"

    # Before reuse.wrap: a stack restored under --reuse still checks that its
    # migration matches this run's migrator.
    request.getfixturevalue("migrator")

    def create() -> types.TestContainerDocker:
        dsn = clickhouse.env["SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN"]

        config_path = tmpfs(cache_key) / "config.yaml"
        config_path.write_text(CONFIG_TEMPLATE.format(dsn=dsn), encoding="utf-8")

        container = DockerContainer(image=image)
        container.with_env("SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_DSN", dsn)
        container.with_env("SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_CLUSTER", "cluster")
        container.with_env("SIGNOZ_OTEL_COLLECTOR_CLICKHOUSE_REPLICATION", "true")
        container.with_env("LOW_CARDINAL_EXCEPTION_GROUPING", "false")
        container.with_volume_mapping(str(config_path), CONFIG_CONTAINER_PATH, "ro")
        container.with_command(f"--config={CONFIG_CONTAINER_PATH}")
        container.with_exposed_ports(4318, 13133)
        container.with_network(network=network)
        container.start()

        for _ in range(30):
            try:
                response = requests.get(f"http://{container.get_container_host_ip()}:{container.get_exposed_port(13133)}/", timeout=2)
                if response.status_code == HTTPStatus.OK:
                    break
            except requests.RequestException:
                pass
            time.sleep(1)
        else:
            stdout, stderr = container.get_logs()
            logger.error("collector logs:\n%s\n%s", stdout.decode(errors="replace")[-10000:], stderr.decode(errors="replace")[-10000:])
            raise TimeoutError("collector did not become healthy")

        return types.TestContainerDocker(
            id=container.get_wrapped_container().id,
            host_configs={"4318": types.TestContainerUrlConfig("http", container.get_container_host_ip(), container.get_exposed_port(4318))},
            container_configs={"4318": types.TestContainerUrlConfig("http", container.get_wrapped_container().name, 4318)},
        )

    def delete(container: types.TestContainerDocker) -> None:
        client = docker.from_env()
        try:
            client.containers.get(container_id=container.id).stop()
            client.containers.get(container_id=container.id).remove(v=True)
        except docker.errors.NotFound:
            logger.info("Skipping removal of collector %s, not found", container.id)

    def restore(cache: dict) -> types.TestContainerDocker:
        return types.TestContainerDocker.from_cache(cache)

    def stale(container: types.TestContainerDocker) -> bool:
        try:
            attrs = docker.from_env().containers.get(container_id=container.id).attrs
        except docker.errors.NotFound:
            return True
        return reuse.image_differs(attrs, image)

    return reuse.wrap(
        request,
        pytestconfig,
        cache_key,
        lambda: types.TestContainerDocker(id="", host_configs={}, container_configs={}),
        create,
        delete,
        restore,
        stale=stale,
    )


@pytest.fixture(name="otel_collector", scope="package")
def otel_collector(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    tmpfs: Generator[types.LegacyPath, Any],
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.TestContainerDocker:
    """The OTLP collector the suites send to: the FuseScope collector, as the
    chart installs it by default (#225), or with --otlp-collector=fork the
    earlier collector."""
    if pytestconfig.getoption("--otlp-collector") == "fork":
        return create_otel_collector(tmpfs, network, clickhouse, request, pytestconfig)
    return create_otlp_collector(network, clickhouse, request, pytestconfig)
