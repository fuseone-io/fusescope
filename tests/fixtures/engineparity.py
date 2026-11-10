"""Comparing an answer served by fusescope-engine with the same view served by
ClickHouse: semantically, on what the API contracts.

A query range answer compares on its type, its data and its warnings; meta holds
execution statistics, zero over Flight (a difference reserved for D5). Only
collections without a contractual order are sorted, and only quantiles get a
tolerance: the two stores estimate them with different algorithms."""

import math
import time
from collections import Counter
from collections.abc import Callable
from typing import Any

import requests

from fixtures.engine import Engine

QUANTILE_TOLERANCE = 0.1
# What fusescope-engine counts per answer it serves: SQL statements and trace lookups.
ENGINE_SERVED = ("fusescope_query_statements_total", "fusescope_query_trace_lookups_total")


def served(engine: Engine) -> float:
    return sum(engine.metric(name) for name in ENGINE_SERVED)


def on_engine(engine: Engine, call: Callable[[], requests.Response]) -> requests.Response:
    """call, which must reach fusescope-engine: its statement or lookup counters grow."""
    before = served(engine)
    response = call()
    assert served(engine) > before, "the answer did not come from fusescope-engine"
    return response


def off_engine(engine: Engine, call: Callable[[], requests.Response]) -> requests.Response:
    """call, which must not reach fusescope-engine."""
    before = served(engine)
    response = call()
    assert served(engine) == before, "the answer reached fusescope-engine"
    return response


def labels_of(series: dict) -> list:
    return sorted((label["key"]["name"], str(label["value"])) for label in series.get("labels") or [])


def semantic_query_range(body: dict, *, ordered_rows: bool) -> dict:
    """type, data and warnings of a query range envelope, with the series of every aggregation
    sorted by their labels and, unless ordered_rows, the rows of a scalar sorted."""
    data = body["data"]
    results = []
    for result in data["data"]["results"]:
        result = dict(result)
        if "aggregations" in result:
            result["aggregations"] = [dict(agg, series=sorted(agg.get("series") or [], key=labels_of)) for agg in result["aggregations"] or []]
        if "data" in result and not ordered_rows:
            result["data"] = sorted(result["data"] or [], key=repr)
        results.append(result)
    warning = data.get("warning") or {}
    return {"type": data["type"], "results": results, "warnings": sorted(w["message"] for w in warning.get("warnings") or [])}


def assert_close(engine: Any, clickhouse: Any, path: str, quantile: Callable[[str], bool]) -> None:
    """Equal, but for a number under a quantile path, which may differ by QUANTILE_TOLERANCE."""
    if isinstance(engine, dict) and isinstance(clickhouse, dict):
        assert engine.keys() == clickhouse.keys(), f"{path}: keys {sorted(engine)} != {sorted(clickhouse)}"
        for key in engine:
            assert_close(engine[key], clickhouse[key], f"{path}.{key}", quantile)
        return
    if isinstance(engine, list) and isinstance(clickhouse, list):
        assert len(engine) == len(clickhouse), f"{path}: {len(engine)} items != {len(clickhouse)}"
        for i, (e, c) in enumerate(zip(engine, clickhouse, strict=True)):
            assert_close(e, c, f"{path}[{i}]", quantile)
        return
    if quantile(path) and isinstance(engine, (int, float)) and isinstance(clickhouse, (int, float)):
        assert math.isclose(engine, clickhouse, rel_tol=QUANTILE_TOLERANCE), f"{path}: quantile {engine} not within {QUANTILE_TOLERANCE:.0%} of {clickhouse}"
        return
    assert engine == clickhouse, f"{path}: {engine!r} != {clickhouse!r}"


def top_level_ops_order(ops: list[str]) -> tuple[str, Counter]:
    """What the order of a service's top-level operations contracts: the sentinel first, then
    latest first, but the stores keep different clocks (ClickHouse the ingestion second, the
    engine the span's nanosecond), so the rest compares as a multiset."""
    return (ops[0] if ops else "", Counter(ops[1:]))


def no_quantile(_: str) -> bool:
    return False


def wait_until(check: Callable[[], bool], what: str, timeout: float = 90, every: float = 1, explain: Callable[[], str] | None = None) -> None:
    """Polls check; on timeout, the error carries what explain says about the state."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(every)
    detail = f"\n{explain()}" if explain else ""
    raise TimeoutError(f"{what} did not happen within {timeout:.0f}s{detail}")
