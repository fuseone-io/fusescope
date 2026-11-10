"""A trace part compacted into Parquet and part still in the ingester comes whole,
and the services read the compacted top_level_operations together with the hot
spans, as ClickHouse answers both."""

import datetime
import uuid
from http import HTTPStatus

import requests

from fixtures import types
from fixtures.engine import EngineStack
from fixtures.enginecollector import EngineCollector
from fixtures.engineparity import assert_close, no_quantile, off_engine, on_engine, top_level_ops_order, wait_until
from fixtures.traces import Traces, TracesKind
from integration.tests.queriertraces_engine.conftest import Backend, send_and_wait, span_id

COMPACTION_PASSES = "fusescope_compaction_passes_total"
TOP_LEVEL_OPERATIONS = "fusescope_compaction_top_level_operations_total"


def get(backend: Backend, path: str) -> requests.Response:
    return requests.get(backend.signoz.self.host_configs["8080"].get(path), headers={"authorization": f"Bearer {backend.token()}"}, timeout=30)


def post(backend: Backend, path: str, body: dict) -> requests.Response:
    return requests.post(backend.signoz.self.host_configs["8080"].get(path), json=body, headers={"authorization": f"Bearer {backend.token()}"}, timeout=30)


def spans_at(trace_id: str, root: Traces | None, at: datetime.datetime, service: str, names: list[str]) -> list[Traces]:
    spans = []
    for n, name in enumerate(names):
        parent = root.span_id if root else ""
        span = Traces(
            timestamp=at + datetime.timedelta(milliseconds=n),
            duration=datetime.timedelta(milliseconds=10 + n),
            trace_id=trace_id,
            span_id=span_id(),
            parent_span_id=parent,
            name=name,
            kind=TracesKind.SPAN_KIND_SERVER,
            resources={"service.name": service},
        )
        root = root or span
        spans.append(span)
    return spans


def test_a_trace_part_compacted_part_hot_comes_whole(
    engine: EngineStack,
    engine_collector: EngineCollector,
    clickhouse: types.TestContainerClickhouse,
    engine_backend: Backend,
    clickhouse_backend: Backend,
) -> None:
    now = datetime.datetime.now(datetime.UTC)
    trace_id = uuid.uuid4().hex
    # Two hours back: an hour the compactor closes once the delay passes.
    old = spans_at(trace_id, None, now - datetime.timedelta(hours=2), "eng-old", ["GET /old", "old.child", "old.leaf"])
    passes = engine.a.metric(COMPACTION_PASSES)
    send_and_wait(engine_collector, clickhouse, engine_backend, old)
    wait_until(lambda: engine.a.metric(COMPACTION_PASSES) > passes and engine.a.metric(TOP_LEVEL_OPERATIONS) > 0, "a compaction of the old hour", timeout=180, every=3)

    hot = spans_at(trace_id, old[0], now, "eng-old", ["hot.a", "hot.b"])
    send_and_wait(engine_collector, clickhouse, engine_backend, hot)

    on = on_engine(engine.a, lambda: get(engine_backend, f"/api/v1/traces/{trace_id}/summary"))
    off = off_engine(engine.a, lambda: get(clickhouse_backend, f"/api/v1/traces/{trace_id}/summary"))
    assert on.status_code == off.status_code == HTTPStatus.OK, (on.text, off.text)
    assert_close(on.json()["data"], off.json()["data"], "summary", no_quantile)
    assert on.json()["data"]["totalSpansCount"] == len(old) + len(hot)
    assert on.json()["data"]["rootServiceEntryPoint"] == "GET /old"

    body = {"selectedSpanId": "", "uncollapsedSpans": []}
    on = on_engine(engine.a, lambda: post(engine_backend, f"/api/v4/traces/{trace_id}/waterfall", body))
    off = off_engine(engine.a, lambda: post(clickhouse_backend, f"/api/v4/traces/{trace_id}/waterfall", body))
    assert on.status_code == off.status_code == HTTPStatus.OK, (on.text, off.text)
    assert_close(on.json()["data"], off.json()["data"], "waterfall", no_quantile)
    assert sorted(span["span_id"] for span in on.json()["data"]["spans"]) == sorted(span.span_id for span in old + hot)

    start = str(int((now - datetime.timedelta(hours=3)).timestamp() * 1e9))
    end = str(int((now + datetime.timedelta(minutes=1)).timestamp() * 1e9))
    services = {"start": start, "end": end, "tags": []}
    on = on_engine(engine.a, lambda: post(engine_backend, "/api/v2/services", services))
    off = off_engine(engine.a, lambda: post(clickhouse_backend, "/api/v2/services", services))
    assert on.status_code == off.status_code == HTTPStatus.OK, (on.text, off.text)

    def eng_old(body: dict) -> dict:
        return next(item for item in body["data"] if item["serviceName"] == "eng-old")

    assert top_level_ops_order(eng_old(on.json())["dataWarning"]["topLevelOps"]) == top_level_ops_order(eng_old(off.json())["dataWarning"]["topLevelOps"])
    assert eng_old(on.json())["dataWarning"]["topLevelOps"] == ["overflow_operation", "GET /old"], "the compacted operation, read from top_level_operations"
