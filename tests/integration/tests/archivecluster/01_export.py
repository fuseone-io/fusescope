import datetime
import time
from collections.abc import Callable
from http import HTTPStatus

import pytest
import requests

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.logs import Logs
from fixtures.seaweedfs import latest_archive_index


def test_export_archives_each_shard_from_its_own_replicas(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    signoz: types.SigNoz,
    create_user_admin: None,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
    insert_logs: Callable[[list[Logs]], None],
    archive_named_collection: str,
    clickhouse_node_conns: list,
    request: pytest.FixtureRequest,
) -> None:
    conn = signoz.telemetrystore.conn
    response = requests.post(
        signoz.self.host_configs["8080"].get("/api/v2/settings/ttl"),
        json={"type": "logs", "defaultTTLDays": 15, "ttlConditions": []},
        headers={"Authorization": f"Bearer {get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)}"},
        timeout=30,
    )
    assert response.status_code == HTTPStatus.OK, response.text

    request.getfixturevalue("signoz_archive")
    deadline = time.time() + 120
    while not all("toDateTime(created_at)" in node.query("SELECT engine_full FROM system.tables WHERE database = 'signoz_logs' AND name = 'logs_v2'").result_rows[0][0] for node in clickhouse_node_conns):
        assert time.time() < deadline, "the backstop was never applied on every shard"
        time.sleep(2)

    old = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=18)
    insert_logs([Logs(timestamp=old, body=f"archived {i}", resources={"service.name": f"archive-cluster-{i}"}) for i in range(40)])
    per_shard = [sorted(body for (body,) in node.query("SELECT body FROM signoz_logs.logs_v2 WHERE body LIKE 'archived %'").result_rows) for node in clickhouse_node_conns]
    assert all(per_shard), f"the rows must land on both shards: {[len(bodies) for bodies in per_shard]}"

    old_day = f"day={old.date()}"
    deadline = time.time() + 120
    while time.time() < deadline:
        index = latest_archive_index(conn, archive_named_collection, "fusescope", "logs_v2")
        if index and sum(o["rows"] for o in index["objects"] if old_day in o["key"]) == 40:
            break
        time.sleep(2)
    else:
        pytest.fail(f"the partition past retention was never archived on both shards: {index}")

    for shard, expected in enumerate(per_shard, start=1):
        keys = [o["key"] for o in index["objects"] if old_day in o["key"] and f"/shard={shard}/" in o["key"]]
        assert keys, f"shard {shard} has no archived object: {index}"
        rows = conn.query(f"SELECT body, _shard FROM s3({archive_named_collection}, filename = '{{{','.join(keys)}}}', format = 'Parquet') ORDER BY body").result_rows
        assert rows == [(body, shard) for body in expected], f"shard {shard}'s objects hold exactly the rows on its replicas"

    deadline = time.time() + 60
    while any(node.query("SELECT count() FROM signoz_logs.logs_v2 WHERE body LIKE 'archived %'").result_rows[0][0] for node in clickhouse_node_conns):
        assert time.time() < deadline, "archived parts were never dropped on every shard"
        time.sleep(2)
