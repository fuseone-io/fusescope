import time
from http import HTTPStatus

import docker
import docker.errors
import pytest
import requests
from testcontainers.core.container import DockerContainer, Network

from fixtures import reuse, types
from fixtures.clickhouse import CLICKHOUSE_PASSWORD, CLICKHOUSE_USERNAME
from fixtures.logger import setup_logger
from fixtures.tls import CA_ID_LABEL, ca_id, issue_server_certificate

logger = setup_logger(__name__)

INGEST_TOKEN = "integration-ingest-policy-token-0123456789abcdef"  # noqa: S105
INGEST_POLICY_ALIAS = "signoz-ingest-policy"
INGEST_POLICY_PORT = 4321
RUM_PORT = 4319
HEALTH_PORT = 13133

BACKEND_DIR = "/etc/fusescope/ingest-policy"
COLLECTOR_DIR = "/etc/fusescope-collector"

CONFIG_TEMPLATE = """
fusescope_opamp:
  endpoint: wss://{alias}:{policy_port}/v1/opamp
  tls:
    min_version: "1.3"
    ca_file: {dir}/opamp-ca/ca.crt
  storage: /home/nonroot/opamp
  role: ingress
  auth:
    token_file: {dir}/ingest-token/token

receivers:
  rum:
    endpoint: 0.0.0.0:{rum_port}
    tls:
      min_version: "1.3"
      cert_file: {dir}/rum-tls/tls.crt
      key_file: {dir}/rum-tls/tls.key
    ingest_policy: fusescope_opamp

processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80
    spike_limit_percentage: 20
  signozspanmapper: {{groups: []}}
  signozllmpricing:
    attrs:
      model: gen_ai.request.model
      in: gen_ai.usage.input_tokens
      out: gen_ai.usage.output_tokens
      cache_read: gen_ai.usage.cache_read.input_tokens
      cache_write: gen_ai.usage.cache_creation.input_tokens
    default_pricing:
      rules: []
    output_attrs:
      in: signoz.gen_ai.usage.input_tokens.cost
      out: signoz.gen_ai.usage.output_tokens.cost
      cache_read: signoz.gen_ai.usage.cache_read.input_tokens.cost
      cache_write: signoz.gen_ai.usage.cache_write.input_tokens.cost
      total: signoz.gen_ai.usage.tokens.cost

connectors:
  fusescope_spanmetrics:

exporters:
  fusescope_clickhouse:
    endpoint: {clickhouse}
    username: {username}
    password_file: {dir}/clickhouse/password
    tls:
      insecure: true
    traces: {{database: signoz_traces}}
    logs: {{database: signoz_logs}}
    metrics: {{database: signoz_metrics}}
    sending_queue:
      batch:
        flush_timeout: 1s

extensions:
  fusescope_opamp: {{}}
  healthcheckv2:
    use_v2: true
    component_health:
      include_recoverable_errors: true
      recovery_duration: 0s
    http:
      endpoint: 0.0.0.0:{health_port}
      status:
        enabled: true
        path: /health/status
      config:
        enabled: false

service:
  extensions: [healthcheckv2, fusescope_opamp]
  pipelines:
    traces:
      receivers: [rum]
      processors: [memory_limiter, signozspanmapper, signozllmpricing]
      exporters: [fusescope_clickhouse, fusescope_spanmetrics]
    logs:
      receivers: [rum]
      processors: [memory_limiter]
      exporters: [fusescope_clickhouse]
    metrics:
      receivers: [fusescope_spanmetrics]
      processors: [memory_limiter]
      exporters: [fusescope_clickhouse]
"""


# The OTLP collector of the chart's default install (fusescope-charts 0.161.0):
# OTLP in, ClickHouse out, with span metrics, the meter and attribute metadata.
# A plain file config: no OpAMP, so it needs no org and no backend.
OTLP_CONFIG_TEMPLATE = """
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80
    spike_limit_percentage: 20
  signozspanmapper: {{groups: []}}
  signozllmpricing:
    attrs:
      model: gen_ai.request.model
      in: gen_ai.usage.input_tokens
      out: gen_ai.usage.output_tokens
      cache_read: gen_ai.usage.cache_read.input_tokens
      cache_write: gen_ai.usage.cache_creation.input_tokens
    default_pricing:
      rules: []
    output_attrs:
      in: signoz.gen_ai.usage.input_tokens.cost
      out: signoz.gen_ai.usage.output_tokens.cost
      cache_read: signoz.gen_ai.usage.cache_read.input_tokens.cost
      cache_write: signoz.gen_ai.usage.cache_write.input_tokens.cost
      total: signoz.gen_ai.usage.tokens.cost

connectors:
  fusescope_spanmetrics:
  fusescope_meter: {{}}

exporters:
  fusescope_clickhouse:
    endpoint: {clickhouse}
    username: {username}
    password_file: {dir}/clickhouse/password
    tls:
      insecure: true
    attributes_metadata: {{enabled: true}}
    sending_queue:
      batch:
        flush_timeout: 1s
  fusescope_clickhouse/meter:
    mode: meter
    endpoint: {clickhouse}
    username: {username}
    password_file: {dir}/clickhouse/password
    tls:
      insecure: true

extensions:
  healthcheckv2:
    use_v2: true
    http:
      endpoint: 0.0.0.0:{health_port}
      status:
        enabled: true
        path: /health/status
      config:
        enabled: false

service:
  extensions: [healthcheckv2]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, signozspanmapper, signozllmpricing]
      exporters: [fusescope_clickhouse, fusescope_spanmetrics, fusescope_meter]
    logs:
      receivers: [otlp]
      processors: [memory_limiter]
      exporters: [fusescope_clickhouse, fusescope_meter]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter]
      exporters: [fusescope_clickhouse, fusescope_meter]
    metrics/spanmetrics:
      receivers: [fusescope_spanmetrics]
      processors: [memory_limiter]
      exporters: [fusescope_clickhouse]
    metrics/meter:
      receivers: [fusescope_meter]
      exporters: [fusescope_clickhouse/meter]
"""


def create_otlp_collector(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
    cache_key: str = "otel_collector",
) -> types.TestContainerDocker:
    """The FuseScope collector receiving OTLP/HTTP as the chart's default install
    does, written straight to the test ClickHouse once the schema is migrated."""

    image = f"ghcr.io/fuseone-io/fusescope-collector:{pytestconfig.getoption('--fusescope-collector-version')}"

    # Before reuse.wrap: a stack restored under --reuse still checks that its
    # migration matches this run's migrator.
    request.getfixturevalue("migrator")

    def create() -> types.TestContainerDocker:
        clickhouse_address = clickhouse.container.container_configs["9000"]
        config = OTLP_CONFIG_TEMPLATE.format(
            health_port=HEALTH_PORT,
            dir=COLLECTOR_DIR,
            clickhouse=f"{clickhouse_address.address}:{clickhouse_address.port}",
            username=CLICKHOUSE_USERNAME,
        )

        container = DockerContainer(image=image)
        container.with_copy_into_container(config.encode(), f"{COLLECTOR_DIR}/config/config.yaml")
        container.with_copy_into_container(CLICKHOUSE_PASSWORD.encode(), f"{COLLECTOR_DIR}/clickhouse/password")
        container.with_command(f"--config={COLLECTOR_DIR}/config/config.yaml")
        container.with_exposed_ports(4318, HEALTH_PORT)
        container.with_network(network=network)
        with reuse.removed_on_failure(container):
            container.start()

            for _ in range(60):
                try:
                    response = requests.get(f"http://{container.get_container_host_ip()}:{container.get_exposed_port(HEALTH_PORT)}/health/status", timeout=2)
                    if response.status_code == HTTPStatus.OK:
                        break
                except requests.RequestException:
                    pass
                time.sleep(1)
            else:
                stdout, stderr = container.get_logs()
                logger.error("fusescope collector logs:\n%s\n%s", stdout.decode(errors="replace")[-20000:], stderr.decode(errors="replace")[-20000:])
                raise TimeoutError("fusescope collector did not become healthy")

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


INGEST_POLICY_ENV = {
    "SIGNOZ_RUM_INGEST__POLICY_TOKEN__FILE": f"{BACKEND_DIR}/tokens",
    "SIGNOZ_RUM_INGEST__POLICY_LISTEN": f"0.0.0.0:{INGEST_POLICY_PORT}",
    "SIGNOZ_RUM_INGEST__POLICY_TLS_CERT__FILE": f"{BACKEND_DIR}/tls.crt",
    "SIGNOZ_RUM_INGEST__POLICY_TLS_KEY__FILE": f"{BACKEND_DIR}/tls.key",
}


def ingest_policy_files(tls: types.TLS) -> dict[str, bytes]:
    """The files INGEST_POLICY_ENV names: the collectors' token and the
    certificate of the listener they reach as INGEST_POLICY_ALIAS."""
    cert, key = issue_server_certificate(tls, INGEST_POLICY_ALIAS)
    return {
        f"{BACKEND_DIR}/tokens": f"{INGEST_TOKEN}\n".encode(),
        f"{BACKEND_DIR}/tls.crt": cert,
        f"{BACKEND_DIR}/tls.key": key,
    }


def create_fusescope_collector(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    signoz: types.SigNoz,  # pylint: disable=unused-argument
    tls: types.TLS,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
    cache_key: str = "fusescope_collector",
) -> types.FuseScopeCollector:
    """The FuseScope collector run as the chart runs it: the ingest policy over
    OpAMP from signoz, RUM over TLS, written straight to ClickHouse. Ready once
    it holds a policy, which signoz publishes only once an org exists."""

    def create() -> types.FuseScopeCollector:
        version = pytestconfig.getoption("--fusescope-collector-version")
        clickhouse_address = clickhouse.container.container_configs["9000"]
        config = CONFIG_TEMPLATE.format(
            alias=INGEST_POLICY_ALIAS,
            policy_port=INGEST_POLICY_PORT,
            rum_port=RUM_PORT,
            health_port=HEALTH_PORT,
            dir=COLLECTOR_DIR,
            clickhouse=f"{clickhouse_address.address}:{clickhouse_address.port}",
            username=CLICKHOUSE_USERNAME,
        )
        cert, key = issue_server_certificate(tls, "localhost", "127.0.0.1")

        container = DockerContainer(image=f"ghcr.io/fuseone-io/fusescope-collector:{version}")
        container.with_copy_into_container(config.encode(), f"{COLLECTOR_DIR}/config/config.yaml")
        container.with_copy_into_container(INGEST_TOKEN.encode(), f"{COLLECTOR_DIR}/ingest-token/token")
        container.with_copy_into_container(cert, f"{COLLECTOR_DIR}/rum-tls/tls.crt")
        container.with_copy_into_container(key, f"{COLLECTOR_DIR}/rum-tls/tls.key")
        with open(tls.ca_cert_path, "rb") as ca:
            container.with_copy_into_container(ca.read(), f"{COLLECTOR_DIR}/opamp-ca/ca.crt")
        container.with_copy_into_container(CLICKHOUSE_PASSWORD.encode(), f"{COLLECTOR_DIR}/clickhouse/password")
        container.with_command(f"--config=fusescopeopamp:{COLLECTOR_DIR}/config/config.yaml")
        container.with_exposed_ports(RUM_PORT, HEALTH_PORT)
        container.with_network(network=network)
        container.with_kwargs(labels={CA_ID_LABEL: ca_id(tls)})
        with reuse.removed_on_failure(container):
            container.start()

            for _ in range(60):
                try:
                    response = requests.get(f"http://{container.get_container_host_ip()}:{container.get_exposed_port(HEALTH_PORT)}/health/status", timeout=2)
                    if response.status_code == HTTPStatus.OK:
                        break
                except requests.RequestException:
                    pass
                time.sleep(1)
            else:
                stdout, stderr = container.get_logs()
                logger.error("fusescope collector logs:\n%s\n%s", stdout.decode(errors="replace")[-20000:], stderr.decode(errors="replace")[-20000:])
                raise TimeoutError("fusescope collector never held an ingest policy")

            return types.FuseScopeCollector(
                self=types.TestContainerDocker(
                    id=container.get_wrapped_container().id,
                    host_configs={str(RUM_PORT): types.TestContainerUrlConfig("https", container.get_container_host_ip(), container.get_exposed_port(RUM_PORT))},
                    container_configs={str(RUM_PORT): types.TestContainerUrlConfig("https", container.get_wrapped_container().name, RUM_PORT)},
                ),
                ca_cert_path=tls.ca_cert_path,
            )

    def delete(collector: types.FuseScopeCollector) -> None:
        client = docker.from_env()
        try:
            client.containers.get(container_id=collector.self.id).stop()
            client.containers.get(container_id=collector.self.id).remove(v=True)
        except docker.errors.NotFound:
            logger.info("Skipping removal of fusescope collector %s, not found", collector.self.id)

    def restore(cache: dict) -> types.FuseScopeCollector:
        return types.FuseScopeCollector(self=types.TestContainerDocker.from_cache(cache), ca_cert_path=tls.ca_cert_path)

    def stale(collector: types.FuseScopeCollector) -> bool:
        try:
            labels = docker.from_env().containers.get(container_id=collector.self.id).attrs["Config"]["Labels"]
        except docker.errors.NotFound:
            return True
        return labels.get(CA_ID_LABEL) != ca_id(tls)

    return reuse.wrap(
        request,
        pytestconfig,
        cache_key,
        lambda: types.FuseScopeCollector(self=types.TestContainerDocker(id="", host_configs={}, container_configs={}), ca_cert_path=tls.ca_cert_path),
        create,
        delete,
        restore,
        stale=stale,
    )


@pytest.fixture(name="fusescope_collector", scope="package")
def fusescope_collector(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    clickhouse: types.TestContainerClickhouse,
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    tls: types.TLS,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.FuseScopeCollector:
    return create_fusescope_collector(network, clickhouse, signoz, tls, request, pytestconfig)
