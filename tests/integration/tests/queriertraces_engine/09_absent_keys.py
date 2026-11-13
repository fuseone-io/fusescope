"""Promoted keys absent, empty or present read alike in both stores (D8): under every
operator the parity's absent-key cases use and selected, a span without the key reads
as ClickHouse's empty string; and a key the engine folds into one column with another
spelling reads only itself. Every difference is listed in one failure."""

import datetime
import uuid
from http import HTTPStatus

import requests

from fixtures import types
from fixtures.engine import EngineStack
from fixtures.enginecollector import EngineCollector
from fixtures.engineparity import off_engine, on_engine
from fixtures.querier import build_order_by, build_raw_query, make_query_request
from fixtures.traces import Traces, TracesKind
from integration.tests.queriertraces_engine.conftest import Backend, send_and_wait, span_id

ATTRIBUTES = ["db.name", "http.route", "peer.service", "rpc.method"]
RESOURCES = ["deployment.environment"]
STATES = {"absent": None, "empty": "", "v1": "v1", "v2": "v2"}
OPERATORS = [
    "= 'v1'",
    "!= 'v1'",
    "IN ('v1', 'v2')",
    "NOT IN ('v1', 'v2')",
    "LIKE 'v%'",
    "NOT LIKE 'v%'",
    "REGEXP '^v'",
    "NOT REGEXP '^v'",
    "CONTAINS 'v'",
    "NOT CONTAINS 'v'",
    "EXISTS",
    "NOT EXISTS",
    "= ''",
    "!= ''",
]


def spans(service: str, now: datetime.datetime) -> list[Traces]:
    out = []
    for i, key in enumerate(ATTRIBUTES + RESOURCES):
        for j, (state, value) in enumerate(STATES.items()):
            attributes, resources = {}, {"service.name": service}
            if value is not None:
                (resources if key in RESOURCES else attributes)[key] = value
            out.append(
                Traces(
                    timestamp=now + datetime.timedelta(milliseconds=10 * i + j),
                    trace_id=uuid.uuid4().hex,
                    span_id=span_id(),
                    name=f"{key}:{state}",
                    kind=TracesKind.SPAN_KIND_SERVER,
                    resources=resources,
                    attributes=attributes,
                )
            )
    return out


def rows(backend: Backend, token: str, window: tuple[int, int], expression: str, select: list[str]) -> requests.Response:
    query = build_raw_query("A", "traces", filter_expression=expression, order=[build_order_by("timestamp", "desc")], limit=100, select_fields=[{"name": n} for n in select])
    return make_query_request(backend.signoz, token, window[0], window[1], [query], request_type="raw")


def answer(response: requests.Response, key: str | None) -> object:
    if response.status_code != HTTPStatus.OK:
        return f"HTTP {response.status_code}: {response.text[:200]}"
    found = response.json()["data"]["data"]["results"][0].get("rows") or []
    if key is None:
        return sorted(row["data"]["name"] for row in found)
    return sorted((row["data"]["name"], repr(row["data"].get(key, "<missing>"))) for row in found)


def test_absent_promoted_keys_read_alike(engine: EngineStack, engine_collector: EngineCollector, clickhouse: types.TestContainerClickhouse, engine_backend: Backend, clickhouse_backend: Backend) -> None:
    now = datetime.datetime.now(datetime.UTC)
    service = f"eng-d8-{uuid.uuid4().hex[:8]}"
    send_and_wait(engine_collector, clickhouse, engine_backend, spans(service, now))
    window = (int((now - datetime.timedelta(minutes=5)).timestamp() * 1000), int((now + datetime.timedelta(minutes=1)).timestamp() * 1000))
    tokens = {"on": engine_backend.token(), "off": clickhouse_backend.token()}

    differences = []
    for key in ATTRIBUTES + RESOURCES:
        base = f"service.name = '{service}' AND name LIKE '{key}:%'"
        # ClickHouse's resource filter keeps no row for != '' (fuseone-io/fusescope#402).
        operators = [op for op in OPERATORS if not (key in RESOURCES and op == "!= ''")]
        cases = [(f"{key} {op}", f"{base} AND {key} {op}", ["name"], None) for op in operators]
        cases.append((f"select {key}", base, ["name", key], key))
        for label, expression, select, selected in cases:
            on = answer(on_engine(engine.a, lambda e=expression, s=select: rows(engine_backend, tokens["on"], window, e, s)), selected)
            off = answer(off_engine(engine.a, lambda e=expression, s=select: rows(clickhouse_backend, tokens["off"], window, e, s)), selected)
            if on != off:
                differences.append(f"{label}\n    engine:     {on}\n    clickhouse: {off}")
    assert not differences, f"{len(differences)} differences:\n" + "\n".join(differences)


# Keys the engine folds into one promoted column: the legacy name, the stable name and whether
# they are resource keys.
FOLDED = [
    ("db.name", "db.namespace", False),
    ("http.method", "http.request.method", False),
    ("db.operation", "db.operation.name", False),
    ("db.system", "db.system.name", False),
    ("messaging.operation", "messaging.operation.type", False),
    ("deployment.environment", "deployment.environment.name", True),
]
FOLDED_STATES = {
    "legacy_only": lambda legacy, stable: {legacy: "a"},
    "stable_only": lambda legacy, stable: {stable: "b"},
    "both_same": lambda legacy, stable: {legacy: "a", stable: "a"},
    "legacy_then_stable": lambda legacy, stable: {legacy: "a", stable: "b"},
    "stable_then_legacy": lambda legacy, stable: {stable: "b", legacy: "a"},
}
FOLDED_OPERATORS = ["= 'a'", "= 'b'", "!= 'a'", "EXISTS", "NOT EXISTS"]


def folded_spans(service: str, now: datetime.datetime) -> list[Traces]:
    out = []
    for i, (legacy, stable, resource) in enumerate(FOLDED):
        for j, (state, values) in enumerate(FOLDED_STATES.items()):
            keys = values(legacy, stable)
            resources = {"service.name": service, **(keys if resource else {})}
            out.append(
                Traces(
                    timestamp=now + datetime.timedelta(milliseconds=10 * i + j),
                    trace_id=uuid.uuid4().hex,
                    span_id=span_id(),
                    name=f"{legacy}|{state}",
                    kind=TracesKind.SPAN_KIND_SERVER,
                    resources=resources,
                    attributes={} if resource else keys,
                )
            )
    return out


def test_folded_promoted_keys_read_alike(engine: EngineStack, engine_collector: EngineCollector, clickhouse: types.TestContainerClickhouse, engine_backend: Backend, clickhouse_backend: Backend) -> None:
    now = datetime.datetime.now(datetime.UTC)
    service = f"eng-d8f-{uuid.uuid4().hex[:8]}"
    send_and_wait(engine_collector, clickhouse, engine_backend, folded_spans(service, now))
    window = (int((now - datetime.timedelta(minutes=5)).timestamp() * 1000), int((now + datetime.timedelta(minutes=1)).timestamp() * 1000))
    tokens = {"on": engine_backend.token(), "off": clickhouse_backend.token()}

    differences = []
    for legacy, stable, _ in FOLDED:
        base = f"service.name = '{service}' AND name LIKE '{legacy}|%'"
        for key in (legacy, stable):
            cases = [(f"{key} {op}", f"{base} AND {key} {op}", ["name"], None) for op in FOLDED_OPERATORS]
            cases.append((f"select {key}", base, ["name", key], key))
            for label, expression, select, selected in cases:
                on = answer(on_engine(engine.a, lambda e=expression, s=select: rows(engine_backend, tokens["on"], window, e, s)), selected)
                off = answer(off_engine(engine.a, lambda e=expression, s=select: rows(clickhouse_backend, tokens["off"], window, e, s)), selected)
                if on != off:
                    differences.append(f"{label}\n    engine:     {on}\n    clickhouse: {off}")
    assert not differences, f"{len(differences)} differences:\n" + "\n".join(differences)
