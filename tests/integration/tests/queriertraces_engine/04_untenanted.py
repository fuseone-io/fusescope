"""An org the provider lists but the engine has no tenant for fails closed: an
error, and no read of ClickHouse in its place."""

import datetime
from http import HTTPStatus

import requests

from fixtures import types
from fixtures.enginecollector import EngineCollector
from integration.tests.queriertraces_engine.conftest import Backend, send_and_wait, small_trace


def summary(backend: Backend, trace_id: str) -> requests.Response:
    return requests.get(backend.signoz.self.host_configs["8080"].get(f"/api/v1/traces/{trace_id}/summary"), headers={"authorization": f"Bearer {backend.token()}"}, timeout=30)


def clickhouse_reads(clickhouse: types.TestContainerClickhouse, trace_id: str) -> int:
    """Statements that named trace_id, started or finished, failed or not."""
    clickhouse.conn.command("SYSTEM FLUSH LOGS")
    result = clickhouse.conn.query("SELECT count() FROM system.query_log WHERE position(query, {trace:String}) > 0 AND query NOT LIKE '%query_log%'", parameters={"trace": trace_id})
    return result.result_rows[0][0]


def test_an_untenanted_org_fails_without_reading_clickhouse(
    engine_collector: EngineCollector,
    clickhouse: types.TestContainerClickhouse,
    engine_backend: Backend,
    clickhouse_backend: Backend,
    untenanted_backend: Backend,
) -> None:
    spans = small_trace(datetime.datetime.now(datetime.UTC), 0)
    trace_id = spans[0].trace_id
    send_and_wait(engine_collector, clickhouse, engine_backend, spans)

    before = clickhouse_reads(clickhouse, trace_id)
    assert summary(clickhouse_backend, trace_id).status_code == HTTPStatus.OK
    after_clickhouse = clickhouse_reads(clickhouse, trace_id)
    assert after_clickhouse > before, "the control: the same read through ClickHouse names the trace id"

    refused = summary(untenanted_backend, trace_id)
    assert refused.status_code >= HTTPStatus.BAD_REQUEST, refused.text
    assert refused.status_code != HTTPStatus.NOT_FOUND, "a refusal, not an empty answer"
    assert clickhouse_reads(clickhouse, trace_id) == after_clickhouse, "no fallback to ClickHouse"
