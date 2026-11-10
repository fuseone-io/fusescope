"""A trace with more spans than the engine answers at once is trace_too_large, a
413, on the summary and the waterfall; ClickHouse serves it."""

import datetime
import uuid
from http import HTTPStatus

import requests

from fixtures import types
from fixtures.engine import MAX_ROWS, EngineStack
from fixtures.enginecollector import EngineCollector
from fixtures.engineparity import off_engine, on_engine
from fixtures.traces import Traces
from integration.tests.queriertraces_engine.conftest import Backend, send_and_wait, span_id


def test_a_trace_past_the_row_cap_is_too_large(
    engine: EngineStack,
    engine_collector: EngineCollector,
    clickhouse: types.TestContainerClickhouse,
    engine_backend: Backend,
    clickhouse_backend: Backend,
) -> None:
    now = datetime.datetime.now(datetime.UTC)
    trace_id = uuid.uuid4().hex
    root = Traces(timestamp=now, trace_id=trace_id, span_id=span_id(), name="GET /large", resources={"service.name": "eng-large"})
    children = [Traces(timestamp=now + datetime.timedelta(microseconds=n), trace_id=trace_id, span_id=span_id(), parent_span_id=root.span_id, name=f"large-{n:04d}", resources={"service.name": "eng-large"}) for n in range(MAX_ROWS + 100)]
    send_and_wait(engine_collector, clickhouse, engine_backend, [root, *children])
    headers = {"authorization": f"Bearer {engine_backend.token()}"}
    url = engine_backend.signoz.self.host_configs["8080"].get

    for call in (
        lambda: requests.get(url(f"/api/v1/traces/{trace_id}/summary"), headers=headers, timeout=30),
        lambda: requests.post(url(f"/api/v4/traces/{trace_id}/waterfall"), json={"selectedSpanId": "", "uncollapsedSpans": []}, headers=headers, timeout=30),
    ):
        refused = on_engine(engine.a, call)
        assert refused.status_code == HTTPStatus.REQUEST_ENTITY_TOO_LARGE, refused.text
        assert refused.json()["error"]["code"] == "trace_too_large"

    served = off_engine(engine.a, lambda: requests.get(clickhouse_backend.signoz.self.host_configs["8080"].get(f"/api/v1/traces/{trace_id}/summary"), headers={"authorization": f"Bearer {clickhouse_backend.token()}"}, timeout=30))
    assert served.status_code == HTTPStatus.OK
    assert served.json()["data"]["totalSpansCount"] == len(children) + 1
