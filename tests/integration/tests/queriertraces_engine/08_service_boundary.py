"""A span whose parent is in another service, whatever its remoteness, is a top-level
operation of its service in both stores (D7): ClickHouse finds the parent in the same
export batch, the engine in the same hour, compacted or recent. The engine
keeps a complete listing for `query.recent_keys_ttl_secs` (30 by default), so
its answer may trail the spans by that long."""

import datetime
import uuid
from http import HTTPStatus

import requests

from fixtures import types
from fixtures.engine import EngineStack
from fixtures.enginecollector import EngineCollector
from fixtures.engineparity import off_engine, on_engine, wait_until
from fixtures.traces import Traces, TracesKind
from integration.tests.queriertraces_engine.conftest import Backend, send_and_wait, span_id


def services(backend: Backend, body: dict) -> requests.Response:
    return requests.post(backend.signoz.self.host_configs["8080"].get("/api/v2/services"), json=body, headers={"authorization": f"Bearer {backend.token()}"}, timeout=30)


def test_a_child_of_another_service_is_top_level_in_both_stores(
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

    def back(response: requests.Response) -> list[dict]:
        return [item for item in response.json()["data"] if item["serviceName"] == "eng-x-back"]

    off = off_engine(engine.a, lambda: services(clickhouse_backend, body))
    assert off.status_code == HTTPStatus.OK, off.text
    assert [item["dataWarning"]["topLevelOps"] for item in back(off)] == [["overflow_operation", "x.handle"]], "ClickHouse: a service boundary makes a top-level operation"

    seen: list[requests.Response] = []

    def engine_lists_it() -> bool:
        on = on_engine(engine.a, lambda: services(engine_backend, body))
        seen.append(on)
        assert on.status_code == HTTPStatus.OK, on.text
        return [item["dataWarning"]["topLevelOps"] for item in back(on)] == [["overflow_operation", "x.handle"]]

    wait_until(engine_lists_it, "the engine: the same boundary, before compaction, once its cached listing expires", timeout=45, every=3, explain=lambda: seen[-1].text[:2000])
