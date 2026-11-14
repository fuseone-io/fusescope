"""The engine's quantiles pass the parity's rule against the exact distribution of what was sent
(#5): between the order statistics around the exact rank where one value is coarser than the rank
tolerance, within the rank tolerance otherwise. Both stores are judged alike; every miss is listed
in one failure."""

import datetime
import math
import random
import uuid
from http import HTTPStatus

from fixtures import types
from fixtures.engine import EngineStack
from fixtures.enginecollector import EngineCollector
from fixtures.engineparity import off_engine, on_engine
from fixtures.querier import build_aggregation, build_group_by_field, build_traces_scalar_query, make_query_request
from fixtures.traces import Traces, TracesKind
from integration.tests.queriertraces_engine.conftest import Backend, send_and_wait, span_id

QUANTILES = {"p50": 0.50, "p95": 0.95, "p99": 0.99, "p999": 0.999}
# Groups in the order statistics regime at the p99 and p999, and one in the rank regime at the p99.
GROUPS = {"small": 800, "large": 5000}
# The parity's δ: a quantile q may be off by δ·q·(1 − q) in rank.
RANK_TOLERANCE = 0.1


def judge(values: list[int], q: float, v: float) -> bool:
    """The parity's JudgeQuantile against the exact distribution of values."""
    s, n = sorted(values), len(values)
    if RANK_TOLERANCE * q * (1 - q) <= 1 / n:
        h = q * (n - 1)
        return s[math.floor(h)] <= v <= s[math.ceil(h)]
    below = sum(x < v for x in s) / n
    at_or_below = sum(x <= v for x in s) / n
    error = below - q if q < below else (q - at_or_below if q > at_or_below else 0.0)
    return error <= RANK_TOLERANCE * q * (1 - q)


def spans(prefix: str, now: datetime.datetime) -> tuple[list[Traces], dict[str, list[int]]]:
    """Log-normal durations around 50 ms, whole microseconds, for each group's service."""
    rng = random.Random(5)
    out, durations = [], {}
    for group, n in GROUPS.items():
        service = f"{prefix}-{group}"
        durations[service] = []
        for i in range(n):
            micros = max(1, int(rng.lognormvariate(math.log(50_000), 0.6)))
            durations[service].append(micros * 1000)
            out.append(
                Traces(
                    timestamp=now - datetime.timedelta(milliseconds=i % 60_000),
                    duration=datetime.timedelta(microseconds=micros),
                    trace_id=uuid.uuid4().hex,
                    span_id=span_id(),
                    name="quantile",
                    kind=TracesKind.SPAN_KIND_SERVER,
                    resources={"service.name": service},
                )
            )
    return out, durations


def test_quantiles_pass_the_parity_rule(engine: EngineStack, engine_collector: EngineCollector, clickhouse: types.TestContainerClickhouse, engine_backend: Backend, clickhouse_backend: Backend) -> None:
    now = datetime.datetime.now(datetime.UTC)
    prefix = f"eng-q-{uuid.uuid4().hex[:8]}"
    sent, durations = spans(prefix, now)
    send_and_wait(engine_collector, clickhouse, engine_backend, sent)
    window = (int((now - datetime.timedelta(minutes=5)).timestamp() * 1000), int((now + datetime.timedelta(minutes=1)).timestamp() * 1000))
    query = build_traces_scalar_query(
        [build_aggregation(f"{name}(duration_nano)") for name in QUANTILES],
        group_by=[build_group_by_field("service.name")],
        filter_expression=f"service.name LIKE '{prefix}-%'",
    )

    misses = []
    for store, run in (("engine", on_engine), ("clickhouse", off_engine)):
        backend = engine_backend if store == "engine" else clickhouse_backend
        response = run(engine.a, lambda b=backend: make_query_request(b.signoz, b.token(), window[0], window[1], [query], request_type="scalar"))
        assert response.status_code == HTTPStatus.OK, response.text
        rows = response.json()["data"]["data"]["results"][0]["data"]
        assert sorted(row[0] for row in rows) == sorted(durations), f"{store}: {rows}"
        for row in rows:
            for (name, q), v in zip(QUANTILES.items(), row[1:], strict=True):
                if not judge(durations[row[0]], q, v):
                    misses.append(f"{store} {row[0]} {name}: {v}")
    assert not misses, f"{len(misses)} quantiles outside the parity's rule:\n" + "\n".join(misses)
