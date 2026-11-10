"""Three backends on one ClickHouse and one engine stack, each with a root org of a
fixed id, since the flight provider's org list is read at start:

- engine: org A, listed and the engine's tenant; its trace routes read the engine.
- clickhouse: org B, outside the list; the flight provider serves it from
  ClickHouse, the reference every engine answer is compared with.
- untenanted: org C, listed but no tenant of the engine; it must fail closed.

The collector writes every span to ClickHouse and, under tenant A, to the engine;
ClickHouse is one tenant, so A and B read the same rows there."""

import datetime
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from http import HTTPStatus

import docker
import pytest
import requests

from fixtures import types
from fixtures.auth import token_getter
from fixtures.engine import EngineStack
from fixtures.enginecollector import EngineCollector
from fixtures.engineparity import wait_until
from fixtures.signoz import create_signoz
from fixtures.traces import Traces, TracesEvent, TracesKind, TracesLink, TracesRefType, TracesStatusCode

PASSWORD = "password123Z$"  # noqa: S105

# A windowed waterfall past this many spans, its window this many spans; the same on
# every backend so their answers compare.
WATERFALL_ALL_SPANS = 20
WATERFALL_PAGE = 10


@dataclass
class Backend:
    signoz: types.SigNoz
    org: str
    email: str
    token: Callable[[], str]


def backend(
    name: str,
    org: str,
    flight_orgs: list[str],
    engine: EngineStack,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> Backend:
    email = f"{name}@integration.test"
    signoz = create_signoz(
        network=request.getfixturevalue("network"),
        zeus=request.getfixturevalue("zeus"),
        gateway=request.getfixturevalue("gateway"),
        sqlstore=request.getfixturevalue("sqlstore"),
        clickhouse=request.getfixturevalue("clickhouse"),
        request=request,
        pytestconfig=pytestconfig,
        cache_key=f"signoz-engine-{name}",
        env_overrides={
            "SIGNOZ_USER_ROOT_ENABLED": True,
            "SIGNOZ_USER_ROOT_EMAIL": email,
            "SIGNOZ_USER_ROOT_PASSWORD": PASSWORD,
            "SIGNOZ_USER_ROOT_ORG_ID": org,
            "SIGNOZ_USER_ROOT_ORG_NAME": f"engine-{name}",
            "SIGNOZ_TRACES_WATERFALL_MAX__LIMIT__TO__SELECT__ALL__SPANS": WATERFALL_ALL_SPANS,
            "SIGNOZ_TRACES_WATERFALL_SPAN__PAGE__SIZE": WATERFALL_PAGE,
        }
        | engine.backend_env(flight_orgs),
        files=engine.backend_files,
    )
    login = token_getter(signoz)
    return Backend(signoz=signoz, org=org, email=email, token=lambda: login(email, PASSWORD))


@pytest.fixture(name="engine_backend", scope="package")
def engine_backend(engine: EngineStack, request: pytest.FixtureRequest, pytestconfig: pytest.Config) -> Backend:
    return backend("a", engine.tenant, [engine.tenant], engine, request, pytestconfig)


@pytest.fixture(name="clickhouse_backend", scope="package")
def clickhouse_backend(engine: EngineStack, request: pytest.FixtureRequest, pytestconfig: pytest.Config) -> Backend:
    return backend("b", str(uuid.uuid4()), [engine.tenant], engine, request, pytestconfig)


@pytest.fixture(name="untenanted_backend", scope="package")
def untenanted_backend(engine: EngineStack, request: pytest.FixtureRequest, pytestconfig: pytest.Config) -> Backend:
    org = str(uuid.uuid4())
    return backend("c", org, [org], engine, request, pytestconfig)


@pytest.fixture(name="signoz", scope="package")
def signoz(engine_backend: Backend) -> types.SigNoz:
    return engine_backend.signoz


# The services the aggregate views read; the windowed trace has a service of its own,
# eng-bulk, so its many short spans leave their quantiles alone.
SERVICES = ("eng-frontend", "eng-cart")
SERVICE_FILTER = "service.name IN ('eng-frontend', 'eng-cart')"
# Distinct durations keep operations apart when ordered by a quantile.
ROOT_DURATIONS = {"GET /cart": 200, "GET /checkout": 400, "GET /bulk": 800}
WINDOWED_CHILDREN = 29


def span_id() -> str:
    return uuid.uuid4().hex[:16]


@dataclass
class Dataset:
    """What the suite sent: every span, by trace, and the traces tests single out."""

    spans: list[Traces]
    traces: dict[str, list[Traces]]
    small: str
    windowed: str
    start_ms: int
    end_ms: int

    def viewed(self) -> list[Traces]:
        """The spans the aggregate views read: those of SERVICES."""
        return [span for span in self.spans if span.service_name in SERVICES]

    def window_ns(self) -> tuple[str, str]:
        return str(self.start_ms * 1_000_000), str(self.end_ms * 1_000_000)


def small_trace(now: datetime.datetime, i: int, linked: str = "") -> list[Traces]:
    trace = uuid.uuid4().hex
    at = now - datetime.timedelta(seconds=60 - 5 * i)
    name = "GET /cart" if i % 2 == 0 else "GET /checkout"
    failed = i == 3
    root = Traces(
        timestamp=at,
        duration=datetime.timedelta(milliseconds=ROOT_DURATIONS[name]),
        trace_id=trace,
        span_id=span_id(),
        name=name,
        kind=TracesKind.SPAN_KIND_SERVER,
        status_code=TracesStatusCode.STATUS_CODE_ERROR if failed else TracesStatusCode.STATUS_CODE_UNSET,
        resources={"service.name": "eng-frontend", "deployment.environment": "integration"},
        attributes={"http.request.method": "GET", "http.response.status_code": 500 if failed else 200, "http.route": "/cart"},
    )
    cart = Traces(
        timestamp=at + datetime.timedelta(milliseconds=10),
        duration=datetime.timedelta(milliseconds=120),
        trace_id=trace,
        span_id=span_id(),
        parent_span_id=root.span_id,
        name="cart.get",
        kind=TracesKind.SPAN_KIND_SERVER,
        resources={"service.name": "eng-cart"},
        attributes={"rpc.system": "grpc", "rpc.service": "Cart", "rpc.method": "Get"},
        links=[TracesLink(trace_id=linked, span_id=span_id(), ref_type=TracesRefType.REF_TYPE_FOLLOWS_FROM)] if linked else [],
        flags=0x300,  # the parent is remote: cart.get is a top-level operation of eng-cart
    )
    db = Traces(
        timestamp=at + datetime.timedelta(milliseconds=20),
        duration=datetime.timedelta(milliseconds=30 + i),
        trace_id=trace,
        span_id=span_id(),
        parent_span_id=cart.span_id,
        name="SELECT carts",
        kind=TracesKind.SPAN_KIND_CLIENT,
        status_code=TracesStatusCode.STATUS_CODE_ERROR if failed else TracesStatusCode.STATUS_CODE_UNSET,
        # The parent's service: a child of another service with no remote flag is top-level for
        # ClickHouse only (D5).
        resources={"service.name": "eng-cart"},
        attributes={"db.system.name": "postgresql", "db.namespace": "carts", "db.operation.name": "SELECT"},
        events=[TracesEvent(name="exception", timestamp=at + datetime.timedelta(milliseconds=25), attribute_map={"exception.type": "Timeout"})] if failed else [],
    )
    return [root, cart, db]


def windowed_trace(now: datetime.datetime) -> list[Traces]:
    trace = uuid.uuid4().hex
    at = now - datetime.timedelta(seconds=30)
    root = Traces(
        timestamp=at,
        duration=datetime.timedelta(milliseconds=ROOT_DURATIONS["GET /bulk"]),
        trace_id=trace,
        span_id=span_id(),
        name="GET /bulk",
        kind=TracesKind.SPAN_KIND_SERVER,
        resources={"service.name": "eng-bulk"},
    )
    # Siblings tied in time: the waterfall orders them by name.
    children = [
        Traces(
            timestamp=at + datetime.timedelta(milliseconds=5),
            duration=datetime.timedelta(milliseconds=1 + n),
            trace_id=trace,
            span_id=span_id(),
            parent_span_id=root.span_id,
            name=f"item-{WINDOWED_CHILDREN - n:02d}",
            # The root's service: a child of another service with no remote flag is a top-level
            # operation for ClickHouse but not for the engine (D5), which this trace does not test.
            resources={"service.name": "eng-bulk"},
        )
        for n in range(WINDOWED_CHILDREN)
    ]
    return [root, *children]


def sentinel(now: datetime.datetime) -> Traces:
    return Traces(timestamp=now, trace_id=uuid.uuid4().hex, span_id=span_id(), name="sentinel", resources={"service.name": "eng-sentinel"})


def arrived_in_clickhouse(clickhouse: types.TestContainerClickhouse, trace_id: str) -> bool:
    result = clickhouse.conn.query("SELECT count() FROM signoz_traces.distributed_signoz_index_v3 WHERE trace_id = {trace:String}", parameters={"trace": trace_id})
    return result.result_rows[0][0] > 0


def engine_summary(backend: Backend, trace_id: str) -> requests.Response:
    return requests.get(backend.signoz.self.host_configs["8080"].get(f"/api/v1/traces/{trace_id}/summary"), headers={"authorization": f"Bearer {backend.token()}"}, timeout=10)


def send_and_wait(collector: EngineCollector, clickhouse: types.TestContainerClickhouse, backend: Backend, spans: list[Traces], engine: EngineStack | None = None) -> None:
    """Sends spans, then a sentinel, and returns once the sentinel is in both stores."""
    marker = sentinel(datetime.datetime.now(datetime.UTC))
    collector.send([*spans, marker])
    wait_until(lambda: arrived_in_clickhouse(clickhouse, marker.trace_id), "the sentinel in ClickHouse")

    def explain() -> str:
        response = engine_summary(backend, marker.trace_id)
        parts = [f"summary: {response.status_code} {response.text[:2000]}", f"collector:\n{collector.logs(80)}"]
        if engine is not None:
            parts.append(f"engine-a:\n{engine.a.logs(80)}")
        parts.append(f"backend:\n{docker_logs(backend.signoz, 80)}")
        return "\n".join(parts)

    wait_until(lambda: engine_summary(backend, marker.trace_id).status_code == HTTPStatus.OK, "the sentinel in fusescope-engine", explain=explain)


def docker_logs(signoz: types.SigNoz, tail: int) -> str:
    return docker.from_env().containers.get(signoz.self.id).logs(tail=tail).decode(errors="replace")


@pytest.fixture(name="dataset", scope="package")
def dataset(engine: EngineStack, engine_collector: EngineCollector, clickhouse: types.TestContainerClickhouse, engine_backend: Backend, clickhouse_backend: Backend) -> Dataset:  # pylint: disable=unused-argument
    now = datetime.datetime.now(datetime.UTC)
    traces = [small_trace(now, 0)]
    traces += [small_trace(now, i, linked=traces[0][0].trace_id) for i in range(1, 5)]
    traces.append(windowed_trace(now))
    spans = [span for trace in traces for span in trace]
    send_and_wait(engine_collector, clickhouse, engine_backend, spans, engine)
    end_ms = int(time.time() * 1000) + 60_000
    return Dataset(
        spans=spans,
        traces={trace[0].trace_id: trace for trace in traces},
        small=traces[0][0].trace_id,
        windowed=traces[-1][0].trace_id,
        start_ms=end_ms - 20 * 60_000,
        end_ms=end_ms,
    )
