"""A span whose parent is in another service and whose remoteness is unknown: ClickHouse
counts it as a top-level operation of its service, the engine does not. The engine's
rule (no parent, or a remote one) was approved for D4; matching ClickHouse needs the
parent's service, across compaction passes and hours, and is left for D5. This test
records both answers so a change to either shows; it is not a parity check."""

import datetime
import uuid
from http import HTTPStatus

import requests

from fixtures import types
from fixtures.engine import EngineStack
from fixtures.enginecollector import EngineCollector
from fixtures.engineparity import off_engine, on_engine
from fixtures.traces import Traces, TracesKind
from integration.tests.queriertraces_engine.conftest import Backend, send_and_wait, span_id


def services(backend: Backend, body: dict) -> requests.Response:
    return requests.post(backend.signoz.self.host_configs["8080"].get("/api/v2/services"), json=body, headers={"authorization": f"Bearer {backend.token()}"}, timeout=30)


def test_a_child_of_another_service_is_top_level_only_for_clickhouse(
    engine: EngineStack,
    engine_collector: EngineCollector,
    clickhouse: types.TestContainerClickhouse,
    engine_backend: Backend,
    clickhouse_backend: Backend,
) -> None:
    now = datetime.datetime.now(datetime.UTC)
    trace_id = uuid.uuid4().hex
    root = Traces(timestamp=now, trace_id=trace_id, span_id=span_id(), name="GET /x", kind=TracesKind.SPAN_KIND_SERVER, resources={"service.name": "eng-x-front"})
    child = Traces(
        timestamp=now + datetime.timedelta(milliseconds=1),
        trace_id=trace_id,
        span_id=span_id(),
        parent_span_id=root.span_id,
        name="x.handle",
        kind=TracesKind.SPAN_KIND_SERVER,
        resources={"service.name": "eng-x-back"},
    )
    send_and_wait(engine_collector, clickhouse, engine_backend, [root, child])
    body = {"start": str(int((now - datetime.timedelta(minutes=5)).timestamp() * 1e9)), "end": str(int((now + datetime.timedelta(minutes=1)).timestamp() * 1e9)), "tags": []}

    on = on_engine(engine.a, lambda: services(engine_backend, body))
    off = off_engine(engine.a, lambda: services(clickhouse_backend, body))
    assert on.status_code == off.status_code == HTTPStatus.OK, (on.text, off.text)

    def back(response: requests.Response) -> list[dict]:
        return [item for item in response.json()["data"] if item["serviceName"] == "eng-x-back"]

    assert [item["dataWarning"]["topLevelOps"] for item in back(off)] == [["overflow_operation", "x.handle"]], "ClickHouse: a service boundary makes a top-level operation"
    assert back(on) == [], "the engine: no parent nor a remote one, so no call of eng-x-back (D5)"
