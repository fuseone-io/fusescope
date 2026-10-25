import datetime
import time
from collections.abc import Callable
from http import HTTPStatus

import pytest
import requests

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.logs import Logs
from fixtures.seaweedfs import archived_object_keys, latest_archive_index


def test_export_archives_partitions_past_retention_and_holds_late_parts(
    signoz: types.SigNoz,
    create_user_admin: None,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
    insert_logs: Callable[[list[Logs]], None],
    archive_named_collection: str,
    request: pytest.FixtureRequest,
) -> None:
    conn = signoz.telemetrystore.conn
    cluster = signoz.telemetrystore.env["SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_CLUSTER"]
    response = requests.post(
        signoz.self.host_configs["8080"].get("/api/v2/settings/ttl"),
        json={"type": "logs", "defaultTTLDays": 15, "ttlConditions": []},
        headers={"Authorization": f"Bearer {get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)}"},
        timeout=30,
    )
    assert response.status_code == HTTPStatus.OK, response.text

    request.getfixturevalue("signoz_archive")
    deadline = time.time() + 120
    while "toDateTime(created_at)" not in conn.query("SELECT engine_full FROM system.tables WHERE database = 'signoz_logs' AND name = 'logs_v2'").result_rows[0][0]:
        assert time.time() < deadline, "the backstop, which keeps rows past retention until they are archived, was never applied"
        time.sleep(2)

    now = datetime.datetime.now(datetime.UTC)
    old = now - datetime.timedelta(days=18)
    insert_logs(
        [
            Logs(timestamp=old, body="archived", resources={"service.name": "archive-export"}),
            Logs(timestamp=now - datetime.timedelta(hours=1), body="live", resources={"service.name": "archive-export"}),
        ]
    )
    old_day = f"day={old.date()}"

    deadline = time.time() + 120
    while time.time() < deadline:
        index = latest_archive_index(conn, archive_named_collection, "fusescope", "logs_v2")
        resource_index = latest_archive_index(conn, archive_named_collection, "fusescope", "logs_v2_resource")
        if index and resource_index and any(old_day in o["key"] for o in index["objects"]) and any(old_day in o["key"] for o in resource_index["objects"]):
            break
        time.sleep(2)
    else:
        pytest.fail(f"the partition past retention was never archived: {index}, {resource_index}")

    assert all(old_day in o["key"] for o in index["objects"]), f"only the partition past retention is archived: {index}"
    [archived] = [o for o in index["objects"] if old_day in o["key"]]
    assert archived["rows"] == 1
    rows = conn.query(f"SELECT body, _shard, _part, _size, _etag FROM s3({archive_named_collection}, filename = '{archived['key']}', format = 'Parquet')").result_rows
    assert [(body, shard) for body, shard, *_ in rows] == [("archived", 1)]
    assert rows[0][2] in archived["key"], "each row names its source part"
    assert (rows[0][3], rows[0][4].strip('"')) == (archived["bytes"], archived["etag"])

    conn.query("SYSTEM FLUSH LOGS")
    settings = conn.query("SELECT Settings['max_threads'], Settings['output_format_parquet_row_group_size'] FROM system.query_log WHERE type = 'QueryFinish' AND query_kind = 'Insert' AND query LIKE 'INSERT INTO FUNCTION s3(%' AND query LIKE '%fusescope/logs_v2/%'").result_rows
    assert settings and all(row == ("2", "1000") for row in settings), f"exports run under archive.limits: {settings}"

    objects = archived_object_keys(conn, archive_named_collection, "fusescope", "logs_v2")
    time.sleep(6)
    assert archived_object_keys(conn, archive_named_collection, "fusescope", "logs_v2") == objects, "published parts are not exported again"

    # Merged into the published part, a late row would make a two-row candidate of its own.
    conn.query(f"SYSTEM STOP MERGES ON CLUSTER '{cluster}' signoz_logs.logs_v2")
    try:
        insert_logs([Logs(timestamp=old, body="late one", resources={"service.name": "archive-export"})])
        time.sleep(6)
        assert archived_object_keys(conn, archive_named_collection, "fusescope", "logs_v2") == objects, "a late part below late_min_rows is held"

        insert_logs([Logs(timestamp=old, body="late two", resources={"service.name": "archive-export"})])
        deadline = time.time() + 60
        while time.time() < deadline:
            late = [o["key"] for o in latest_archive_index(conn, archive_named_collection, "fusescope", "logs_v2")["objects"] if o["key"] not in objects]
            if late:
                break
            time.sleep(2)
        else:
            pytest.fail("held late parts were never exported once they reached late_min_rows")

        bodies = conn.query(f"SELECT body FROM s3({archive_named_collection}, filename = '{{{','.join(late)}}}', format = 'Parquet') ORDER BY body").result_rows
        assert bodies == [("late one",), ("late two",)]
    finally:
        conn.query(f"SYSTEM START MERGES ON CLUSTER '{cluster}' signoz_logs.logs_v2")
