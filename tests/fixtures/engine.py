"""fusescope-engine for the backend's flight provider: two engines on one catalog
and one bucket, under the mTLS and JWT the provider speaks.

engine-a runs every role (ingester, querier, compactor); engine-b is a second
ingester, there to be paused for a partial answer. Each listener population has
its own CA, as the engine requires: the engines' (their certificates, trusted as
the system store and as the hot-window client CA), the backend's and the
collectors'."""

import base64
import hashlib
import json
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from http import HTTPStatus

import docker
import docker.errors
import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from testcontainers.core.container import DockerContainer, Network
from testcontainers.postgres import PostgresContainer

from fixtures.logger import setup_logger
from fixtures.tls import CA, issue_certificate, new_ca

logger = setup_logger(__name__)

ENGINE_A = "engine-a"
ENGINE_B = "engine-b"
ENGINE_DIR = "/etc/fusescope"
BUCKET_DIR = "/var/lib/fusescope/bucket"
SYSTEM_TRUST = "/etc/ssl/certs/ca-certificates.crt"
BACKEND_DIR = "/etc/fusescope/engine"
FLIGHT_PORT = 8815
OTLP_PORT = 4317
METRICS_PORT = 9464
JWT_ISSUER = "fusescope-backend"

# Every limit and clock a test leans on. The clocks are the smoke test's, which the
# engine's validator accepts; max_rows is low enough for one large trace to pass it.
MAX_ROWS = 500
FLUSH_SECS = 10
HOUR_CLOSE_DELAY_SECS = 30
COMPACTION_SECS = 15

CONFIG_TEMPLATE = """
[server]
role = "{role}"
node_id = "{node}"
flight_addr = "0.0.0.0:{flight_port}"
metrics_addr = "0.0.0.0:{metrics_port}"

[catalog]
migrate = true

[bucket]
kind = "local"
path = "{bucket}"

[wal]
dir = "/var/lib/fusescope/wal"

[ingest]
listen = "0.0.0.0:{otlp_port}"
hot_listen = "0.0.0.0:8816"
hot_advertise = "{node}:8816"
flush_interval_secs = {flush}
persisted_retain_secs = 10

[query]
timeout_secs = 10
max_rows = {max_rows}
recent_keys_ttl_secs = 0
spill_dir = "/var/lib/fusescope/spill"

[compactor]
purge_interval_secs = 15
compaction_interval_secs = {compaction}
hour_close_delay_secs = {hour_close}
retention_interval_secs = 15

[tls]
enabled = true
cert = "{dir}/tls/tls.crt"
key = "{dir}/tls/tls.key"
public_client_ca = "{dir}/tls/backend-ca.crt"
hot_client_ca = "{dir}/tls/engine-ca.crt"
ingest_client_ca = "{dir}/tls/collector-ca.crt"

[auth]
mode = "jwt"
jwt_keys = "{dir}/jwt/jwks.json"
jwt_issuer = "{issuer}"

[log]
level = "info"
format = "text"
"""


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@dataclass(frozen=True)
class EnginePKI:
    """The CAs, the certificates and the backend's signing key of one engine stack."""

    engine_ca: CA
    backend_ca: CA
    collector_ca: CA
    engine_cert: tuple[bytes, bytes]
    backend_cert: tuple[bytes, bytes]
    collector_cert: tuple[bytes, bytes]
    jwt_key: ed25519.Ed25519PrivateKey

    def jwt_key_pem(self) -> bytes:
        return self.jwt_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())

    def jwks(self) -> bytes:
        """The backend's public key under its RFC 7638 thumbprint, the kid the backend signs with."""
        x = b64url(self.jwt_key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw))
        kid = b64url(hashlib.sha256(json.dumps({"crv": "Ed25519", "kty": "OKP", "x": x}, separators=(",", ":")).encode()).digest())
        return json.dumps({"keys": [{"kty": "OKP", "crv": "Ed25519", "x": x, "kid": kid, "use": "sig"}]}).encode()

    def fingerprint(self) -> str:
        return hashlib.sha256(self.engine_ca.pem() + self.jwks()).hexdigest()[:12]


def new_engine_pki() -> EnginePKI:
    engine_ca, backend_ca, collector_ca = new_ca("fusescope-engine-ca"), new_ca("fusescope-backend-ca"), new_ca("fusescope-collector-ca")
    return EnginePKI(
        engine_ca=engine_ca,
        backend_ca=backend_ca,
        collector_ca=collector_ca,
        engine_cert=issue_certificate(engine_ca, ENGINE_A, ENGINE_B, server=True, client=True),
        backend_cert=issue_certificate(backend_ca, "fusescope-backend", server=False, client=True),
        collector_cert=issue_certificate(collector_ca, "fusescope-collector", server=False, client=True),
        jwt_key=ed25519.Ed25519PrivateKey.generate(),
    )


@dataclass
class Engine:
    """One engine container: the host URL of its metrics listener and its id."""

    name: str
    container_id: str
    metrics_url: str

    def metric(self, name: str) -> float:
        """The sum of a counter's series, 0 when the engine has not exported it yet."""
        body = requests.get(f"{self.metrics_url}/metrics", timeout=5).text
        return sum(float(m.group(1)) for m in re.finditer(rf"^{re.escape(name)}(?:{{[^}}]*}})? ([0-9.eE+-]+)$", body, re.MULTILINE))

    def logs(self, tail: int = 200) -> str:
        return docker.from_env().containers.get(self.container_id).logs(tail=tail).decode(errors="replace")

    def pause(self) -> None:
        docker.from_env().containers.get(self.container_id).pause()

    def unpause(self) -> None:
        container = docker.from_env().containers.get(self.container_id)
        if container.status == "paused":
            container.unpause()


@dataclass
class EngineStack:
    """The two engines, the tenant the stack serves and its ingest token."""

    pki: EnginePKI
    a: Engine
    b: Engine
    tenant: str
    ingest_token: str
    containers: list[DockerContainer] = field(default_factory=list)

    def backend_env(self, orgs: list[str]) -> dict[str, str]:
        """The flight provider of a backend that routes every engine route of orgs to engine-a."""
        return {
            "SIGNOZ_TELEMETRYSTORE_PROVIDER": "flight",
            "SIGNOZ_TELEMETRYSTORE_FLIGHT_ENDPOINT": f"{ENGINE_A}:{FLIGHT_PORT}",
            "SIGNOZ_TELEMETRYSTORE_FLIGHT_TLS_CERT__FILE": f"{BACKEND_DIR}/tls.crt",
            "SIGNOZ_TELEMETRYSTORE_FLIGHT_TLS_KEY__FILE": f"{BACKEND_DIR}/tls.key",
            "SIGNOZ_TELEMETRYSTORE_FLIGHT_TLS_CA__FILE": f"{BACKEND_DIR}/engine-ca.crt",
            "SIGNOZ_TELEMETRYSTORE_FLIGHT_TLS_SERVER__NAME": ENGINE_A,
            "SIGNOZ_TELEMETRYSTORE_FLIGHT_JWT_KEY__FILE": f"{BACKEND_DIR}/jwt.key",
            "SIGNOZ_TELEMETRYSTORE_FLIGHT_ROUTES": "traces_raw,traces_aggregate,trace_detail",
            "SIGNOZ_TELEMETRYSTORE_FLIGHT_ORGS": ",".join(orgs),
            # A backend reused under --reuse must be recreated for another PKI: its files are copied in.
            "FUSESCOPE_TEST_ENGINE_PKI": self.pki.fingerprint(),
        }

    def backend_files(self) -> dict[str, bytes]:
        cert, key = self.pki.backend_cert
        return {
            f"{BACKEND_DIR}/tls.crt": cert,
            f"{BACKEND_DIR}/tls.key": key,
            f"{BACKEND_DIR}/engine-ca.crt": self.pki.engine_ca.pem(),
            f"{BACKEND_DIR}/jwt.key": self.pki.jwt_key_pem(),
        }


def engine_files(pki: EnginePKI, role: str, node: str) -> dict[str, bytes]:
    cert, key = pki.engine_cert
    config = CONFIG_TEMPLATE.format(
        role=role,
        node=node,
        flight_port=FLIGHT_PORT,
        metrics_port=METRICS_PORT,
        otlp_port=OTLP_PORT,
        bucket=BUCKET_DIR,
        flush=FLUSH_SECS,
        max_rows=MAX_ROWS,
        compaction=COMPACTION_SECS,
        hour_close=HOUR_CLOSE_DELAY_SECS,
        dir=ENGINE_DIR,
        issuer=JWT_ISSUER,
    )
    return {
        f"{ENGINE_DIR}/config.toml": config.encode(),
        f"{ENGINE_DIR}/tls/tls.crt": cert,
        f"{ENGINE_DIR}/tls/tls.key": key,
        f"{ENGINE_DIR}/tls/backend-ca.crt": pki.backend_ca.pem(),
        f"{ENGINE_DIR}/tls/engine-ca.crt": pki.engine_ca.pem(),
        f"{ENGINE_DIR}/tls/collector-ca.crt": pki.collector_ca.pem(),
        f"{ENGINE_DIR}/jwt/jwks.json": pki.jwks(),
        # The engine's hot-window client trusts the system store only.
        SYSTEM_TRUST: pki.engine_ca.pem(),
    }


def start_engine(image: str, network: Network, pki: EnginePKI, catalog_url: str, bucket: str, role: str, node: str) -> tuple[DockerContainer, Engine]:
    container = DockerContainer(image)
    for path, content in engine_files(pki, role, node).items():
        container.with_copy_into_container(content, path)
    container.with_env("FS_CATALOG_URL", catalog_url)
    container.with_volume_mapping(bucket, BUCKET_DIR, "rw")
    # As the host's user, so the bucket it shares stays the host's to remove; the image's own
    # state directories become tmpfs of that user.
    uid, gid = os.getuid(), os.getgid()
    container.with_kwargs(user=f"{uid}:{gid}")
    for path in ("/var/lib/fusescope/wal", "/var/lib/fusescope/spill"):
        container.tmpfs[path] = f"uid={uid},gid={gid}"
    container.with_network(network=network)
    container.with_network_aliases(node)
    container.with_exposed_ports(METRICS_PORT)
    container.with_command(f"--config {ENGINE_DIR}/config.toml")
    container.start()
    engine = Engine(name=node, container_id=container.get_wrapped_container().id, metrics_url=f"http://{container.get_container_host_ip()}:{container.get_exposed_port(METRICS_PORT)}")
    for _ in range(60):
        try:
            if requests.get(f"{engine.metrics_url}/readyz", timeout=2).status_code == HTTPStatus.OK:
                return container, engine
        except requests.RequestException:
            pass
        time.sleep(1)
    stdout, stderr = container.get_logs()
    logger.error("%s logs:\n%s\n%s", node, stdout.decode(errors="replace")[-20000:], stderr.decode(errors="replace")[-20000:])
    raise TimeoutError(f"{node} did not become ready")


def admin(container: DockerContainer, *args: str) -> dict[str, str]:
    """Runs an admin command in the engine's own image and config; its key=value lines."""
    code, output = container.get_wrapped_container().exec_run(["/usr/local/bin/fusescope-engine", "--config", f"{ENGINE_DIR}/config.toml", "admin", *args])
    text = output.decode(errors="replace")
    assert code == 0, f"admin {' '.join(args)} failed: {text}"
    return dict(line.split("=", 1) for line in text.splitlines() if "=" in line)


@pytest.fixture(name="engine_pki", scope="package")
def engine_pki() -> EnginePKI:
    return new_engine_pki()


@pytest.fixture(name="engine", scope="package")
def engine(
    network: Network,
    engine_pki: EnginePKI,
    engine_tenant: str,
    tmp_path_factory: pytest.TempPathFactory,
    pytestconfig: pytest.Config,
) -> EngineStack:
    """Both engines on a fresh catalog and bucket, with the tenant engine_tenant
    and an ingest token for it."""
    image = f"ghcr.io/fuseone-io/fusescope-engine:{pytestconfig.getoption('--fusescope-engine-version')}"
    catalog = PostgresContainer("postgres:17-alpine", username="fusescope", password="fusescope", dbname="fusescope")  # noqa: S106
    catalog.with_network(network)
    catalog.with_network_aliases("engine-catalog")
    catalog.start()
    containers: list[DockerContainer] = [catalog]
    try:
        bucket = tmp_path_factory.mktemp("engine-bucket")
        catalog_url = "postgres://fusescope:fusescope@engine-catalog:5432/fusescope"
        container_a, a = start_engine(image, network, engine_pki, catalog_url, str(bucket), "all", ENGINE_A)
        containers.append(container_a)
        admin(container_a, "tenant", "create", f"integration-{engine_tenant[:8]}", "--id", engine_tenant)
        token = admin(container_a, "token", "create", engine_tenant, "collector", "ingest")["token"]
        container_b, b = start_engine(image, network, engine_pki, catalog_url, str(bucket), "ingester", ENGINE_B)
        containers.append(container_b)
    except BaseException:
        for container in reversed(containers):
            container.stop()
        raise
    stack = EngineStack(pki=engine_pki, a=a, b=b, tenant=engine_tenant, ingest_token=token, containers=containers)
    yield stack
    stack.b.unpause()
    for container in reversed(containers):
        try:
            container.stop()
        except docker.errors.NotFound:
            logger.info("engine container already gone")


@pytest.fixture(name="engine_tenant", scope="package")
def engine_tenant() -> str:
    return str(uuid.uuid4())
