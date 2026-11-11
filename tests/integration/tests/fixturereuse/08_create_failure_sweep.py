"""Every create() that starts a container removes it when it fails, inside
start() or anywhere after it, before reuse.wrap could register a finalizer
(#373). Each create() runs on a fake container through reuse.wrap's own
arguments; the cluster and the migrator have their own cases."""

from pathlib import Path

import pytest

from fixtures import clickhouse, fusescopecollector, googleidp, http, keeper, keycloak, maildev, migrator, notification_channel, postgres, reuse, seeder, signoz, types

URL = types.TestContainerUrlConfig("tcp", "host", 1)
CLICKHOUSE = types.TestContainerClickhouse(
    container=types.TestContainerDocker(id="ch", host_configs={"9000": URL, "8123": URL}, container_configs={"9000": URL, "8123": URL}),
    conn=None,
    env={
        "SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_USERNAME": "default",
        "SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_PASSWORD": "password",
        "SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_CLUSTER": "cluster",
    },
)
KEEPER = types.TestContainerDocker(id="keeper", host_configs={"9181": URL}, container_configs={"9181": URL})
EMPTY = types.TestContainerDocker(id="", host_configs={"8080": URL}, container_configs={"8080": URL})


class AfterStart(RuntimeError):
    """Raised by the first use of a started container in mode "after"."""


class Wrapped:
    def __init__(self, status: int = 0, fail_wait: bool = False) -> None:
        self.id = self.name = self.short_id = "wrapped"
        self.status, self.fail_wait = status, fail_wait
        self.removed = 0

    def wait(self) -> dict:
        if self.fail_wait:
            raise AfterStart("wait")
        return {"StatusCode": self.status}

    def logs(self) -> bytes:
        return b""

    def remove(self, **_) -> None:
        self.removed += 1


class Fake:
    """A testcontainers container: with_* chain; start() and every later use fail as the mode says."""

    created: list["Fake"] = []
    mode = "start"
    fail_on: int | None = None
    wrapped = Wrapped

    def __init__(self, *_, **kwargs) -> None:
        object.__setattr__(self, "state", {"started": False, "stopped": 0})
        object.__setattr__(self, "username", kwargs.get("username", "u"))
        object.__setattr__(self, "password", kwargs.get("password", "p"))
        object.__setattr__(self, "dbname", kwargs.get("dbname", "d"))
        object.__setattr__(self, "_wrapped", Fake.wrapped())
        Fake.created.append(self)

    def __getattribute__(self, name: str):
        state = object.__getattribute__(self, "state")
        if Fake.mode == "after" and state["started"] and name not in ("stop", "state", "__class__", "__repr__"):
            raise AfterStart(name)
        return object.__getattribute__(self, name)

    def __getattr__(self, name: str):
        if name.startswith("with_"):
            return lambda *_, **__: self
        raise AttributeError(name)

    def start(self, *_) -> "Fake":
        self.state["started"] = True
        if Fake.mode == "start" and (Fake.fail_on is None or len(Fake.created) == Fake.fail_on):
            raise TimeoutError("readiness")
        return self

    def stop(self) -> None:
        self.state["stopped"] += 1

    def get_wrapped_container(self) -> Wrapped:
        return self._wrapped

    def get_container_host_ip(self) -> str:
        return "localhost"

    def get_exposed_port(self, port: int) -> int:
        return port

    def get_logs(self) -> tuple[bytes, bytes]:
        return b"", b""


class DockerClient:  # pylint: disable=too-few-public-methods
    """docker.from_env() for the seeder's image build."""

    class images:  # pylint: disable=invalid-name,too-few-public-methods
        @staticmethod
        def build(**_) -> None:
            pass


class Config:
    options = {"--reuse": False, "--teardown": False, "--with-web": False, "--sqlstore-provider": "postgres", "--clickhouse-version": "25.12.5"}

    def __init__(self, root: Path) -> None:
        self.rootpath = root
        self.cache = {}

    def getoption(self, name: str):
        return self.options.get(name, "x")


class Request:
    def __init__(self, config: Config) -> None:
        self.config = config

    def getfixturevalue(self, _: str) -> None:
        return None

    def addfinalizer(self, _) -> None:
        pass


@pytest.fixture(name="create_of")
def create_of_fixture(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Returns the create() a factory hands to reuse.wrap, with every container class swapped for Fake."""
    monkeypatch.setattr(Fake, "created", [])
    monkeypatch.setattr(Fake, "fail_on", None)
    monkeypatch.setattr(Fake, "wrapped", Wrapped)
    monkeypatch.setattr(reuse, "wrap", lambda request, pytestconfig, key, empty, create, delete, restore, **_: create)
    for module, name in [
        (clickhouse, "ClickHouseContainer"),
        (fusescopecollector, "DockerContainer"),
        (googleidp, "WireMockContainer"),
        (http, "WireMockContainer"),
        (keeper, "DockerContainer"),
        (keycloak, "KeycloakContainer"),
        (maildev, "DockerContainer"),
        (migrator, "DockerContainer"),
        (notification_channel, "WireMockContainer"),
        (postgres, "PostgresContainer"),
        (seeder, "DockerContainer"),
        (signoz, "DockerContainer"),
    ]:
        monkeypatch.setattr(module, name, Fake)
    keystore = tmp_path / "certs" / "keystore.p12"
    keystore.parent.mkdir()
    for module in (googleidp, notification_channel):
        monkeypatch.setattr(module, "issue_server_keystore", lambda *_: keystore)
        monkeypatch.setattr(module, "ca_id", lambda _: "ca")
    monkeypatch.setattr(fusescopecollector, "issue_server_certificate", lambda *_: (b"cert", b"key"))
    monkeypatch.setattr(seeder.docker, "from_env", DockerClient)
    monkeypatch.setattr(signoz, "build_signoz_image", lambda *_: "signoz:test")
    monkeypatch.setattr(signoz.time, "sleep", lambda _: None)
    ca = tmp_path / "ca.pem"
    ca.write_bytes(b"ca")
    tls = types.TLS(ca_cert_path=str(ca), ca_key_path=str(ca))
    config = Config(tmp_path)
    request = Request(config)

    def tmpfs(name: str) -> Path:
        path = tmp_path / name
        path.mkdir(exist_ok=True)
        return path

    factories = {
        "clickhouse": lambda: clickhouse.create_clickhouse(tmpfs=tmpfs, network=None, keeper=KEEPER, request=request, pytestconfig=config),
        "clickhouse_cluster": lambda: clickhouse.create_clickhouse_cluster(tmpfs=tmpfs, network=None, keeper=KEEPER, request=request, pytestconfig=config, shards=3),
        "otlp_collector": lambda: fusescopecollector.create_otlp_collector(network=None, clickhouse=CLICKHOUSE, request=request, pytestconfig=config),
        "fusescope_collector": lambda: fusescopecollector.create_fusescope_collector(network=None, clickhouse=CLICKHOUSE, signoz=None, tls=tls, request=request, pytestconfig=config),
        "googleidp": lambda: googleidp.googleidp.__wrapped__(network=None, tls=tls, tmpfs=tmpfs, request=request, pytestconfig=config),
        "zeus": lambda: http.zeus.__wrapped__(network=None, request=request, pytestconfig=config),
        "gateway": lambda: http.gateway.__wrapped__(network=None, request=request, pytestconfig=config),
        "keeper": lambda: keeper.create_clickhouse_keeper(tmpfs=tmpfs, network=None, request=request, pytestconfig=config),
        "keycloak": lambda: keycloak.idp.__wrapped__(network=None, request=request, pytestconfig=config),
        "maildev": lambda: maildev.create_maildev(network=None, request=request, pytestconfig=config),
        "migrator": lambda: migrator.create_migrator(network=None, clickhouse=CLICKHOUSE, request=request, pytestconfig=config),
        "notification_channel": lambda: notification_channel.notification_channel.__wrapped__(network=None, tls=tls, tmpfs=tmpfs, request=request, pytestconfig=config),
        "postgres": lambda: postgres.postgres.__wrapped__(network=None, request=request, pytestconfig=config),
        "seeder": lambda: seeder.seeder.__wrapped__(network=None, clickhouse=CLICKHOUSE, request=request, pytestconfig=config),
        "signoz": lambda: signoz.create_signoz(network=None, zeus=EMPTY, gateway=EMPTY, sqlstore=types.TestContainerSQL(container=EMPTY, conn=None, env={}), clickhouse=CLICKHOUSE, request=request, pytestconfig=config),
    }
    return lambda name: factories[name]()


CREATES = ["clickhouse", "clickhouse_cluster", "otlp_collector", "fusescope_collector", "googleidp", "zeus", "gateway", "keeper", "keycloak", "maildev", "migrator", "notification_channel", "postgres", "seeder", "signoz"]


@pytest.mark.parametrize("mode", ["start", "after"])
@pytest.mark.parametrize("name", CREATES)
def test_a_failed_create_removes_what_it_started(monkeypatch: pytest.MonkeyPatch, create_of, name: str, mode: str) -> None:
    monkeypatch.setattr(Fake, "mode", mode)
    create = create_of(name)
    with pytest.raises((TimeoutError, AfterStart)):
        create()
    assert Fake.created, "the create started no container"
    assert [container.state["stopped"] for container in Fake.created if container.state["started"]] == [1] * sum(container.state["started"] for container in Fake.created)


def test_the_sweep_covers_every_container_create() -> None:
    """The 15 creations that start a container, and only those, use removed_on_failure."""
    root = Path(__file__).parents[3] / "fixtures"
    uses = sum(path.read_text().count("reuse.removed_on_failure(") for path in root.glob("*.py"))
    assert uses == len(CREATES)


def test_a_cluster_node_failing_in_start_removes_the_nodes_started_before(monkeypatch: pytest.MonkeyPatch, create_of) -> None:
    monkeypatch.setattr(Fake, "mode", "start")
    monkeypatch.setattr(Fake, "fail_on", 2)
    monkeypatch.setattr(clickhouse, "install_histogram_quantile", lambda _: None)
    create = create_of("clickhouse_cluster")
    with pytest.raises(TimeoutError):
        create()
    assert [container.state["stopped"] for container in Fake.created] == [1, 1]


def test_a_cluster_whose_client_fails_removes_every_node(monkeypatch: pytest.MonkeyPatch, create_of) -> None:
    monkeypatch.setattr(Fake, "mode", "success")
    monkeypatch.setattr(clickhouse, "install_histogram_quantile", lambda _: None)

    def refuse(**_) -> None:
        raise ConnectionError("get_client")

    monkeypatch.setattr(clickhouse.clickhouse_connect, "get_client", refuse)
    create = create_of("clickhouse_cluster")
    with pytest.raises(ConnectionError):
        create()
    assert [container.state["stopped"] for container in Fake.created] == [1, 1, 1]


@pytest.mark.parametrize(
    ("status", "fail_wait", "raised", "stopped", "removed"),
    [
        (0, False, None, 0, 1),
        (1, False, RuntimeError, 0, 1),
        (0, True, AfterStart, 1, 0),
    ],
    ids=["exit 0", "non-zero exit", "wait fails"],
)
def test_the_migrator_is_removed_once(monkeypatch: pytest.MonkeyPatch, create_of, status: int, fail_wait: bool, raised, stopped: int, removed: int) -> None:  # pylint: disable=too-many-arguments,too-many-positional-arguments
    """Exit 0 and a non-zero exit keep the normal removal, and only it; a failure while it runs removes it through the helper."""
    monkeypatch.setattr(Fake, "mode", "success")
    monkeypatch.setattr(Fake, "wrapped", lambda: Wrapped(status=status, fail_wait=fail_wait))
    create = create_of("migrator")
    if raised:
        with pytest.raises(raised):
            create()
    else:
        assert isinstance(create(), types.Operation)
    [container] = Fake.created
    assert container.state["stopped"] == stopped
    assert container.get_wrapped_container().removed == removed
