"""An ingester that does not answer fails the reads that need a complete listing:
metadata.keys, which the routed builder reads, and top_level_operations, which the
services read. A partial listing would change the SQL or the services silently, so
the engine answers UNAVAILABLE and the backend refuses, not a partial result. The
suite's engines keep no listing (`recent_keys_ttl_secs = 0`), so no earlier read
can answer from a cache. The engine counts a paused ingester as live only until its
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

UNAVAILABLE = "fusescope-engine refused the call: Unavailable"


@pytest.fixture(name="paused_engine_b")
def paused_engine_b(engine: EngineStack):
    yield engine.b
    engine.b.unpause()


def test_a_paused_ingester_fails_the_reads_that_need_a_complete_listing(engine: EngineStack, engine_b_collector: EngineCollector, engine_backend: Backend, paused_engine_b) -> None:
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

    assert response.status_code != HTTPStatus.OK, response.text
    assert UNAVAILABLE in response.text, "the routed query: its keys listing needs every ingester"

    assert envelope.status_code != HTTPStatus.OK, envelope.text
    assert UNAVAILABLE in envelope.text, "the services: top_level_operations needs every ingester"
