import datetime
import time
from collections.abc import Callable
from http import HTTPStatus

import pytest
import requests
from sqlalchemy import sql

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.logs import Logs
from fixtures.seaweedfs import latest_archive_index


def test_delete_drops_archived_parts_only_and_records_lost_parts(
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
        assert time.time() < deadline, "the backstop was never applied"
        time.sleep(2)

    old = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=20)
    old_day = f"day={old.date()}"
    insert_logs([Logs(timestamp=old, body="dropped once archived", resources={"service.name": "archive-delete"})])

    deadline = time.time() + 120
    while time.time() < deadline:
        index = latest_archive_index(conn, archive_named_collection, "fusescope", "logs_v2") or {"objects": []}
        archived = [o["key"] for o in index["objects"] if old_day in o["key"]]
        remaining = conn.query("SELECT count() FROM signoz_logs.logs_v2 WHERE body = 'dropped once archived'").result_rows[0][0]
        if archived and remaining == 0:
            break
        time.sleep(2)
    else:
        pytest.fail(f"the archived part was never dropped: archived {archived}, {remaining} rows left")

    bodies = conn.query(f"SELECT body FROM s3({archive_named_collection}, filename = '{{{','.join(archived)}}}', format = 'Parquet')").result_rows
    assert ("dropped once archived",) in bodies, "the dropped rows are in the archive"
    with signoz.sqlstore.conn.connect() as sqlconn:
        dropped = sqlconn.execute(sql.text("SELECT count(*) FROM archive_part WHERE table_name = 'logs_v2' AND dropped_at IS NOT NULL")).scalar()
    assert dropped > 0, "dropped parts are recorded"

    # Held below late_min_rows, a late part is inventoried but never dropped; removed behind the
    # archive's back, as a TTL merge would, it is recorded as lost.
    conn.query(f"SYSTEM STOP MERGES ON CLUSTER '{cluster}' signoz_logs.logs_v2")
    try:
        insert_logs([Logs(timestamp=old, body="held then lost", resources={"service.name": "archive-delete"})])
        [(part,)] = conn.query("SELECT _part FROM signoz_logs.logs_v2 WHERE body = 'held then lost'").result_rows

        deadline = time.time() + 60
        while time.time() < deadline:
            with signoz.sqlstore.conn.connect() as sqlconn:
                inventoried = sqlconn.execute(sql.text("SELECT count(*) FROM archive_inventory WHERE part_name = :part"), {"part": part}).scalar()
            if inventoried:
                break
            time.sleep(2)
        else:
            pytest.fail(f"the late part {part} was never inventoried")

        time.sleep(6)
        assert conn.query("SELECT count() FROM signoz_logs.logs_v2 WHERE body = 'held then lost'").result_rows[0][0] == 1, "an unarchived part is never dropped"

        conn.query(f"ALTER TABLE signoz_logs.logs_v2 ON CLUSTER '{cluster}' DROP PART '{part}'")
        deadline = time.time() + 60
        while time.time() < deadline:
            with signoz.sqlstore.conn.connect() as sqlconn:
                lost = sqlconn.execute(sql.text("SELECT rows, kind FROM archive_loss WHERE part_name = :part"), {"part": part}).fetchall()
            if lost:
                break
            time.sleep(2)
        else:
            pytest.fail(f"the part {part} that disappeared unarchived was never recorded as lost")
        assert [tuple(row) for row in lost] == [(1, "lost")]
    finally:
        conn.query(f"SYSTEM START MERGES ON CLUSTER '{cluster}' signoz_logs.logs_v2")
