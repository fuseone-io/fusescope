"""The summary and the waterfall of a trace from the engine answer as ClickHouse's,
in full and windowed, and as the spans sent say."""

from http import HTTPStatus

import requests

from fixtures.engine import EngineStack
from fixtures.engineparity import assert_close, no_quantile, off_engine, on_engine
from integration.tests.queriertraces_engine.conftest import WATERFALL_ALL_SPANS, Backend, Dataset


def summary(backend: Backend, trace_id: str) -> requests.Response:
    return requests.get(backend.signoz.self.host_configs["8080"].get(f"/api/v1/traces/{trace_id}/summary"), headers={"authorization": f"Bearer {backend.token()}"}, timeout=30)


def waterfall(backend: Backend, trace_id: str, uncollapsed: list[str] | None = None) -> requests.Response:
    return requests.post(
        backend.signoz.self.host_configs["8080"].get(f"/api/v4/traces/{trace_id}/waterfall"),
        json={"selectedSpanId": "", "uncollapsedSpans": uncollapsed or []},
        headers={"authorization": f"Bearer {backend.token()}"},
        timeout=30,
    )


def both(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, call) -> tuple[dict, dict]:
    on = on_engine(engine.a, lambda: call(engine_backend))
    off = off_engine(engine.a, lambda: call(clickhouse_backend))
    assert on.status_code == HTTPStatus.OK, on.text
    assert off.status_code == HTTPStatus.OK, off.text
    return on.json(), off.json()


def test_the_summary(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: summary(b, dataset.small))
    assert on.get("warnings") == off.get("warnings")
    assert_close(on["data"], off["data"], "summary", no_quantile)

    spans = dataset.traces[dataset.small]
    root = next(span for span in spans if not span.parent_span_id)
    assert on["data"]["totalSpansCount"] == len(spans)
    assert on["data"]["totalErrorSpansCount"] == sum(span.has_error for span in spans)
    assert on["data"]["rootServiceName"] == root.service_name
    assert on["data"]["rootServiceEntryPoint"] == root.name
    assert on["data"]["hasMissingSpans"] is False


def test_a_full_waterfall(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: waterfall(b, dataset.small))
    assert on.get("warnings") == off.get("warnings")
    assert_close(on["data"], off["data"], "waterfall", no_quantile)

    spans = dataset.traces[dataset.small]
    assert on["data"]["hasMore"] is False
    assert [span["span_id"] for span in on["data"]["spans"]] == [span.span_id for span in spans], "pre-order: root, cart, db"


def test_a_windowed_waterfall(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    spans = dataset.traces[dataset.windowed]
    assert len(spans) > WATERFALL_ALL_SPANS
    root = spans[0]
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: waterfall(b, dataset.windowed, [root.span_id]))
    assert_close(on["data"], off["data"], "waterfall", no_quantile)

    assert on["data"]["hasMore"] is True
    assert on["data"]["totalSpansCount"] == len(spans)
    assert on["data"]["rootServiceEntryPoint"] == root.name
    names = [span["name"] for span in on["data"]["spans"][1:]]
    assert names == sorted(names), "siblings tied in time order by name"
    assert len(on["data"]["spans"]) < len(spans), "only the window comes in full"
