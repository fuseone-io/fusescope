"""An ingester that does not answer makes the answer partial: the engine says so,
and the backend reports it as ingester_unavailable in the query range warnings and
in the success envelope. The engine counts a paused ingester as live only until its
heartbeat is 10 s old, so the reads follow the pause at once."""

import datetime
import time
import uuid
from http import HTTPStatus

import pytest
import requests

from fixtures.engine import EngineStack
from fixtures.enginecollector import EngineCollector
from fixtures.engineparity import on_engine, wait_until
from fixtures.querier import build_order_by, build_raw_query, make_query_request
from fixtures.traces import Traces
from integration.tests.queriertraces_engine.conftest import Backend, span_id

UNAVAILABLE = "Some recent data may be missing: an engine ingester did not answer."


@pytest.fixture(name="paused_engine_b")
def paused_engine_b(engine: EngineStack):
    yield engine.b
    engine.b.unpause()


def test_a_paused_ingester_makes_the_answer_partial(engine: EngineStack, engine_b_collector: EngineCollector, engine_backend: Backend, paused_engine_b) -> None:
    now = datetime.datetime.now(datetime.UTC)
    trace_id = uuid.uuid4().hex
    engine_b_collector.send([Traces(timestamp=now, trace_id=trace_id, span_id=span_id(), name="GET /partial", resources={"service.name": "eng-partial"})])
    end_ms = int(time.time() * 1000) + 60_000
    start_ms = end_ms - 10 * 60_000
    query = build_raw_query("A", "traces", filter_expression="service.name = 'eng-partial'", order=[build_order_by("timestamp", "desc")], limit=10, select_fields=[{"name": "trace_id"}])

    # Logged in once: the reads after the pause have only a few seconds.
    token = engine_backend.token()

    def listed() -> requests.Response:
        return make_query_request(engine_backend.signoz, token, start_ms, end_ms, [query], request_type="raw")

    def found() -> bool:
        rows = listed().json()["data"]["data"]["results"][0].get("rows") or []
        return any(row["data"]["trace_id"] == trace_id for row in rows)

    wait_until(found, "the span in engine-b")
    services = {"start": str(start_ms * 1_000_000), "end": str(end_ms * 1_000_000), "tags": []}

    paused_engine_b.pause()
    response = on_engine(engine.a, listed)
    envelope = on_engine(engine.a, lambda: requests.post(engine_backend.signoz.self.host_configs["8080"].get("/api/v2/services"), json=services, headers={"authorization": f"Bearer {token}"}, timeout=30))
    paused_engine_b.unpause()

    assert response.status_code == HTTPStatus.OK, response.text
    warnings = [w["message"] for w in (response.json()["data"].get("warning") or {}).get("warnings") or []]
    assert warnings == [UNAVAILABLE]

    assert envelope.status_code == HTTPStatus.OK, envelope.text
    assert envelope.json()["warnings"] == [UNAVAILABLE]
