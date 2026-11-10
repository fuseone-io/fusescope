"""The views the engine serves answer as ClickHouse answers them, over the same
spans written to both by one collector pipeline, and as the spans sent say."""

from collections import Counter
from http import HTTPStatus

import requests

from fixtures.engine import EngineStack
from fixtures.engineparity import assert_close, no_quantile, off_engine, on_engine, semantic_query_range, top_level_ops_order
from fixtures.querier import build_aggregation, build_group_by_field, build_order_by, build_raw_query, build_traces_scalar_query, make_query_request
from integration.tests.queriertraces_engine.conftest import SERVICE_FILTER, SERVICES, Backend, Dataset


def query_range(backend: Backend, dataset: Dataset, query: dict, request_type: str) -> requests.Response:
    return make_query_request(backend.signoz, backend.token(), dataset.start_ms, dataset.end_ms, [query], request_type=request_type)


def both(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, call) -> tuple[dict, dict]:
    on = on_engine(engine.a, lambda: call(engine_backend))
    off = off_engine(engine.a, lambda: call(clickhouse_backend))
    assert on.status_code == HTTPStatus.OK, on.text
    assert off.status_code == HTTPStatus.OK, off.text
    return on.json(), off.json()


def test_a_span_list(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    query = build_raw_query(
        "A",
        "traces",
        filter_expression=SERVICE_FILTER,
        order=[build_order_by("timestamp", "desc"), build_order_by("span_id", "asc")],
        limit=100,
        select_fields=[{"name": name} for name in ("name", "service.name", "duration_nano", "trace_id", "span_id", "has_error", "kind_string", "is_remote", "events", "links")],
    )
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: query_range(b, dataset, query, "raw"))
    on_semantic = semantic_query_range(on, ordered_rows=True)
    assert_close(on_semantic, semantic_query_range(off, ordered_rows=True), "raw", no_quantile)

    rows = on["data"]["data"]["results"][0]["rows"]
    assert sorted(row["data"]["span_id"] for row in rows) == sorted(span.span_id for span in dataset.viewed())
    assert Counter(row["data"]["service.name"] for row in rows) == Counter(span.service_name for span in dataset.viewed())
    assert sum(row["data"]["has_error"] for row in rows) == sum(span.has_error for span in dataset.viewed())
    sent = {span.span_id: span for span in dataset.viewed()}
    for row in rows:
        span = sent[row["data"]["span_id"]]
        parent = {"traceId": span.trace_id, "spanId": span.parent_span_id} if span.parent_span_id else {"traceId": span.trace_id}
        assert row["data"]["links"][0] == parent, "the span's own reference first"
        # The fixture lists the parent's reference ahead of a child's links; a root has its own.
        links = span.links[1:] if span.parent_span_id else span.links
        assert row["data"]["links"][1:] == links, "then its links"
        assert row["data"]["is_remote"] == ("yes" if span.flags & 0x200 else "unknown")
        assert [event["name"] for event in row["data"]["events"]] == [event["name"] for event in span.events]


def test_a_time_series(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    query = build_traces_scalar_query([build_aggregation("count()")], group_by=[build_group_by_field("service.name")], filter_expression=SERVICE_FILTER, step_interval=60)
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: query_range(b, dataset, query, "time_series"))
    assert_close(semantic_query_range(on, ordered_rows=False), semantic_query_range(off, ordered_rows=False), "time_series", no_quantile)

    totals = Counter()
    for series in on["data"]["data"]["results"][0]["aggregations"][0]["series"]:
        service = next(label["value"] for label in series["labels"] if label["key"]["name"] == "service.name")
        totals[service] += sum(point["value"] for point in series["values"])
    assert totals == Counter(span.service_name for span in dataset.viewed())


def test_a_scalar(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    query = build_traces_scalar_query(
        [build_aggregation("count()"), build_aggregation("p99(duration_nano)"), build_aggregation("avg(duration_nano)")],
        group_by=[build_group_by_field("service.name")],
        order=[build_order_by("count()", "desc")],
        filter_expression=SERVICE_FILTER,
    )
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: query_range(b, dataset, query, "scalar"))
    assert_close(semantic_query_range(on, ordered_rows=True), semantic_query_range(off, ordered_rows=True), "scalar", lambda path: path.endswith("][2]"))

    counts = Counter(span.service_name for span in dataset.viewed())
    rows = on["data"]["data"]["results"][0]["data"]
    assert [(row[0], row[1]) for row in rows] == sorted(counts.items(), key=lambda item: -item[1])


def services_body(dataset: Dataset, **extra) -> dict:
    start, end = dataset.window_ns()
    return {"start": start, "end": end, "tags": [], **extra}


def post(backend: Backend, path: str, body: dict) -> requests.Response:
    return requests.post(backend.signoz.self.host_configs["8080"].get(path), json=body, headers={"authorization": f"Bearer {backend.token()}"}, timeout=30)


def by_service(items: list[dict]) -> list[dict]:
    return sorted((item for item in items if item["serviceName"] in SERVICES), key=lambda item: item["serviceName"])


def without_top_level_ops(items: list[dict]) -> list[dict]:
    return [{key: value for key, value in item.items() if key != "dataWarning"} for item in items]


def test_the_services(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: post(b, "/api/v2/services", services_body(dataset)))
    assert on.get("warnings") == off.get("warnings")
    on_items, off_items = by_service(on["data"]), by_service(off["data"])
    assert [top_level_ops_order(item["dataWarning"]["topLevelOps"]) for item in on_items] == [top_level_ops_order(item["dataWarning"]["topLevelOps"]) for item in off_items]
    assert_close(without_top_level_ops(on_items), without_top_level_ops(off_items), "services", lambda path: path.endswith(".p99"))

    # A service's calls are its roots and its entry points, eng-cart's spans under a remote parent.
    roots = Counter(span.service_name for span in dataset.viewed() if not span.parent_span_id)
    entries = Counter(span.service_name for span in dataset.viewed() if span.parent_span_id and span.flags & 0x200)
    assert {item["serviceName"]: item["numCalls"] for item in on_items} == dict(roots + entries) == {"eng-frontend": 5, "eng-cart": 5}
    top_level = {item["serviceName"]: item["dataWarning"]["topLevelOps"] for item in on_items}
    assert top_level["eng-frontend"][0] == "overflow_operation"
    assert Counter(top_level["eng-frontend"][1:]) == Counter({"GET /cart": 1, "GET /checkout": 1})
    assert Counter(top_level["eng-cart"][1:]) == Counter({"cart.get": 1}), "a span under a remote parent is a top-level operation"


def test_the_top_operations(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    body = services_body(dataset, service="eng-frontend", limit=10)
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: post(b, "/api/v2/service/top_operations", body))
    assert on.get("warnings") == off.get("warnings")
    assert_close(on["data"], off["data"], "top_operations", lambda path: path.split(".")[-1] in {"p50", "p95", "p99"})
    assert [op["name"] for op in on["data"]] == ["GET /checkout", "GET /cart"], "slowest first"


def test_the_entry_point_operations(engine: EngineStack, engine_backend: Backend, clickhouse_backend: Backend, dataset: Dataset) -> None:
    body = services_body(dataset, service="eng-cart", limit=10)
    on, off = both(engine, engine_backend, clickhouse_backend, lambda b: post(b, "/api/v2/service/entry_point_operations", body))
    assert on.get("warnings") == off.get("warnings")
    assert_close(on["data"], off["data"], "entry_point_operations", lambda path: path.split(".")[-1] in {"p50", "p95", "p99"})
    assert [op["name"] for op in on["data"]] == ["cart.get"]
