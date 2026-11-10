"""FuseScope collectors in front of fusescope-engine, as ADR 0010 deploys them:
OTLP/HTTP in over TLS with a bearer token, one traces pipeline out to ClickHouse
and to the engine's OTLP/gRPC ingest under the tenant's fst_ token."""

import tempfile
import time
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path

import docker
import pytest
import requests
from testcontainers.core.container import DockerContainer, Network

from fixtures import types
from fixtures.clickhouse import CLICKHOUSE_PASSWORD, CLICKHOUSE_USERNAME
from fixtures.engine import ENGINE_A, ENGINE_B, OTLP_PORT, EngineStack
from fixtures.logger import setup_logger
from fixtures.otlp import traces_to_otlp_json
from fixtures.tls import issue_certificate, new_ca
from fixtures.traces import Traces

logger = setup_logger(__name__)

COLLECTOR_DIR = "/etc/fusescope-collector"
HEALTH_PORT = 13133
SENDER_TOKEN = "integration-otlp-sender-0123456789abcdef"  # noqa: S105

CLICKHOUSE_EXPORTER = """
  fusescope_clickhouse:
    endpoint: {clickhouse}
    username: {username}
    password_file: {dir}/clickhouse/password
    tls:
      insecure: true
    attributes_metadata: {{enabled: true}}
    sending_queue:
      batch:
        flush_timeout: 1s"""

CONFIG_TEMPLATE = """
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
  bearertokenauth/ingest:
    scheme: Bearer
    filename: {dir}/ingest/token
  bearertokenauth/engine:
    scheme: Bearer
    filename: {dir}/engine/token

receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        tls:
          cert_file: {dir}/tls/tls.crt
          key_file: {dir}/tls/tls.key
          min_version: "1.3"
        auth:
          authenticator: bearertokenauth/ingest

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

exporters:{clickhouse_exporter}
  otlp_grpc/engine:
    endpoint: {engine}:{otlp_port}
    compression: zstd
    tls:
      ca_file: {dir}/engine/ca.crt
      cert_file: {dir}/engine/tls.crt
      key_file: {dir}/engine/tls.key
      min_version: "1.3"
    auth:
      authenticator: bearertokenauth/engine
    sending_queue:
      batch:
        flush_timeout: 200ms

service:
  extensions: [healthcheckv2, bearertokenauth/ingest, bearertokenauth/engine]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, signozspanmapper, signozllmpricing]
      exporters: [{exporters}]
"""


@dataclass
class EngineCollector:
    """A collector the suite sends spans to, and the CA its OTLP/HTTP listener chains to."""

    url: str
    ca_file: str
    container_id: str

    def logs(self, tail: int = 200) -> str:
        return docker.from_env().containers.get(self.container_id).logs(tail=tail).decode(errors="replace")

    def send(self, spans: list[Traces]) -> None:
        response = requests.post(f"{self.url}/v1/traces", json=traces_to_otlp_json(spans), headers={"Authorization": f"Bearer {SENDER_TOKEN}"}, verify=self.ca_file, timeout=10)
        assert response.status_code == HTTPStatus.OK, response.text


def start_collector(
    network: Network,
    engine: EngineStack,
    clickhouse: types.TestContainerClickhouse | None,
    target: str,
    pytestconfig: pytest.Config,
    workdir: Path,
) -> tuple[DockerContainer, EngineCollector]:
    image = f"ghcr.io/fuseone-io/fusescope-collector:{pytestconfig.getoption('--fusescope-collector-version')}"
    exporters = ["otlp_grpc/engine"]
    clickhouse_exporter = ""
    if clickhouse is not None:
        address = clickhouse.container.container_configs["9000"]
        clickhouse_exporter = CLICKHOUSE_EXPORTER.format(clickhouse=f"{address.address}:{address.port}", username=CLICKHOUSE_USERNAME, dir=COLLECTOR_DIR)
        exporters.insert(0, "fusescope_clickhouse")
    config = CONFIG_TEMPLATE.format(
        health_port=HEALTH_PORT,
        dir=COLLECTOR_DIR,
        clickhouse_exporter=clickhouse_exporter,
        engine=target,
        otlp_port=OTLP_PORT,
        exporters=", ".join(exporters),
    )

    container = DockerContainer(image=image)
    container.with_network(network=network)
    container.with_exposed_ports(4318, HEALTH_PORT)
    host = container.get_container_host_ip()
    listener_ca = new_ca("otlp-sender-ca")
    cert, key = issue_certificate(listener_ca, host, "localhost", "127.0.0.1")
    client_cert, client_key = engine.pki.collector_cert
    files = {
        f"{COLLECTOR_DIR}/config/config.yaml": config.encode(),
        f"{COLLECTOR_DIR}/ingest/token": SENDER_TOKEN.encode(),
        f"{COLLECTOR_DIR}/engine/token": engine.ingest_token.encode(),
        f"{COLLECTOR_DIR}/engine/ca.crt": engine.pki.engine_ca.pem(),
        f"{COLLECTOR_DIR}/engine/tls.crt": client_cert,
        f"{COLLECTOR_DIR}/engine/tls.key": client_key,
        f"{COLLECTOR_DIR}/tls/tls.crt": cert,
        f"{COLLECTOR_DIR}/tls/tls.key": key,
    }
    if clickhouse is not None:
        files[f"{COLLECTOR_DIR}/clickhouse/password"] = CLICKHOUSE_PASSWORD.encode()
    for path, content in files.items():
        container.with_copy_into_container(content, path)
    container.with_command(f"--config={COLLECTOR_DIR}/config/config.yaml")
    container.start()

    for _ in range(60):
        try:
            if requests.get(f"http://{host}:{container.get_exposed_port(HEALTH_PORT)}/health/status", timeout=2).status_code == HTTPStatus.OK:
                break
        except requests.RequestException:
            pass
        time.sleep(1)
    else:
        stdout, stderr = container.get_logs()
        logger.error("collector logs:\n%s\n%s", stdout.decode(errors="replace")[-20000:], stderr.decode(errors="replace")[-20000:])
        raise TimeoutError("engine collector did not become healthy")

    ca_file = workdir / f"{target}-collector-ca.pem"
    ca_file.write_bytes(listener_ca.pem())
    return container, EngineCollector(url=f"https://{host}:{container.get_exposed_port(4318)}", ca_file=str(ca_file), container_id=container.get_wrapped_container().id)


@pytest.fixture(name="engine_collector", scope="package")
def engine_collector(network: Network, engine: EngineStack, clickhouse: types.TestContainerClickhouse, migrator, pytestconfig: pytest.Config) -> EngineCollector:  # pylint: disable=unused-argument
    """Writes every span to ClickHouse and to engine-a, from one pipeline."""
    with tempfile.TemporaryDirectory() as workdir:
        container, collector = start_collector(network, engine, clickhouse, ENGINE_A, pytestconfig, Path(workdir))
        yield collector
        container.stop()


@pytest.fixture(name="engine_b_collector", scope="package")
def engine_b_collector(network: Network, engine: EngineStack, pytestconfig: pytest.Config) -> EngineCollector:
    """Writes every span to engine-b only, under the same tenant."""
    with tempfile.TemporaryDirectory() as workdir:
        container, collector = start_collector(network, engine, None, ENGINE_B, pytestconfig, Path(workdir))
        yield collector
        container.stop()
