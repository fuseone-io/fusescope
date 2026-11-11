"""A create() that fails after it started a container removes what it started,
and the original error is what the run sees, even when that removal fails
too (#373). Runs on fake containers: no Docker."""

import pytest

from fixtures import keycloak, reuse, types


class Container:
    """Stands in for a testcontainers container; stop() is its removal, recorded in order."""

    removals: list["Container"] = []

    def __init__(self, fail_start: BaseException | None = None, fail_stop: BaseException | None = None) -> None:
        self.fail_start, self.fail_stop = fail_start, fail_stop
        self.started = self.stopped = False

    def start(self) -> "Container":
        self.started = True
        if self.fail_start:
            raise self.fail_start
        return self

    def stop(self) -> None:
        self.stopped = True
        Container.removals.append(self)
        if self.fail_stop:
            raise self.fail_stop


def test_a_failure_inside_start_removes_the_container() -> None:
    container = Container(fail_start=TimeoutError("readiness"))
    with pytest.raises(TimeoutError, match="readiness"), reuse.removed_on_failure(container):
        container.start()
    assert container.stopped


def test_a_failure_after_start_removes_the_container() -> None:
    container = Container()
    with pytest.raises(RuntimeError, match="health check"), reuse.removed_on_failure(container):
        container.start()
        raise RuntimeError("health check")
    assert container.stopped


def test_success_leaves_the_container_running() -> None:
    container = Container()
    with reuse.removed_on_failure(container):
        container.start()
    assert not container.stopped


def test_containers_tracked_later_are_removed_too() -> None:
    first, second = Container(), Container(fail_start=TimeoutError("second"))
    with pytest.raises(TimeoutError, match="second"), reuse.removed_on_failure() as track:
        for container in (first, second):
            track(container)
            container.start()
    assert first.stopped and second.stopped


@pytest.fixture(autouse=True)
def removals(monkeypatch: pytest.MonkeyPatch) -> list:
    monkeypatch.setattr(Container, "removals", [])
    return Container.removals


def test_removal_runs_in_reverse_order(removals: list) -> None:
    first, second, third = Container(), Container(), Container()
    with pytest.raises(RuntimeError), reuse.removed_on_failure(first) as track:
        track(second)
        track(third)
        raise RuntimeError("late")
    assert removals == [third, second, first]


@pytest.mark.parametrize("cleanup", [RuntimeError("docker gone"), KeyboardInterrupt()], ids=["error", "interrupt"])
def test_a_failing_removal_keeps_the_original_error_and_removes_the_rest(removals: list, cleanup: BaseException) -> None:
    """The first removal in reverse order fails, with an error or an interrupt: the others still run, and the original error is raised."""
    other, failing = Container(), Container(fail_stop=cleanup)
    with pytest.raises(TimeoutError, match="readiness") as raised, reuse.removed_on_failure(other, failing):
        raise TimeoutError("readiness")
    assert removals == [failing, other]
    assert any(repr(cleanup) in note for note in getattr(raised.value, "__notes__", []))


def test_an_interrupt_inside_the_block_removes_and_propagates(removals: list) -> None:
    container = Container()
    with pytest.raises(KeyboardInterrupt), reuse.removed_on_failure(container):
        container.start()
        raise KeyboardInterrupt
    assert removals == [container]


class Config:
    def __init__(self, reuse_: bool = False, teardown: bool = False) -> None:
        self.options = {"--reuse": reuse_, "--teardown": teardown}
        self.cache = {}

    def getoption(self, name: str):
        return self.options[name]


class Request:
    def __init__(self, config: Config) -> None:
        self.config = config

    def addfinalizer(self, _) -> None:
        pass


class Keycloak(Container):
    """KeycloakContainer as idp() configures it."""

    created: list["Keycloak"] = []
    fail_start: Exception | None = None
    fail_after: Exception | None = None

    def __init__(self, **_) -> None:
        super().__init__(fail_start=Keycloak.fail_start)
        Keycloak.created.append(self)

    def with_env(self, *_) -> "Keycloak":
        return self

    def with_network(self, _) -> "Keycloak":
        return self

    def get_wrapped_container(self):
        if Keycloak.fail_after:
            raise Keycloak.fail_after
        return type("Wrapped", (), {"id": "keycloak", "name": "keycloak"})()

    def get_container_host_ip(self) -> str:
        return "localhost"

    def get_exposed_port(self, port: int) -> int:
        return port


@pytest.mark.parametrize(
    ("fail_start", "fail_after"),
    [(TimeoutError("404 on /health/ready"), None), (None, RuntimeError("inspect failed"))],
    ids=["inside start", "after start"],
)
def test_idp_removes_a_keycloak_that_failed(monkeypatch: pytest.MonkeyPatch, fail_start, fail_after) -> None:
    monkeypatch.setattr(keycloak, "KeycloakContainer", Keycloak)
    monkeypatch.setattr(Keycloak, "created", [])
    monkeypatch.setattr(Keycloak, "fail_start", fail_start)
    monkeypatch.setattr(Keycloak, "fail_after", fail_after)
    config = Config()
    with pytest.raises(type(fail_start or fail_after)):
        keycloak.idp.__wrapped__(network=None, request=Request(config), pytestconfig=config)
    assert [container.stopped for container in Keycloak.created] == [True]


def test_idp_keeps_a_keycloak_that_started(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(keycloak, "KeycloakContainer", Keycloak)
    monkeypatch.setattr(Keycloak, "created", [])
    config = Config()
    resource = keycloak.idp.__wrapped__(network=None, request=Request(config), pytestconfig=config)
    assert isinstance(resource, types.TestContainerIDP)
    assert resource.container.id == "keycloak"
    assert [container.stopped for container in Keycloak.created] == [False]


def test_idp_under_teardown_creates_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(keycloak, "KeycloakContainer", Keycloak)
    monkeypatch.setattr(Keycloak, "created", [])
    config = Config(teardown=True)
    config.cache = type("Cache", (), {"get": lambda *_: None, "set": lambda *_: None})()
    keycloak.idp.__wrapped__(network=None, request=Request(config), pytestconfig=config)
    assert not Keycloak.created
