import datetime
from collections.abc import Callable

import pytest

from fixtures import types
from fixtures.archive import publish_day, request_restoration, wait_for_restoration
from fixtures.logs import Logs


def test_restore_loads_a_day_from_published_objects_and_refuses_a_replaced_one(
    signoz: types.SigNoz,
    insert_logs: Callable[[list[Logs]], None],
    archive_named_collection: str,
    archive_restore_state: None,  # pylint: disable=unused-argument
    request: pytest.FixtureRequest,
) -> None:
    conn = signoz.telemetrystore.conn
    day = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=5)).replace(hour=12)
    insert_logs(
        [
            Logs(timestamp=day, body="restored one", resources={"service.name": "archive-restore"}),
            Logs(timestamp=day + datetime.timedelta(minutes=1), body="restored two", resources={"service.name": "archive-restore"}),
        ]
    )
    objects = {table: publish_day(signoz, archive_named_collection, table, day.date()) for table in ("logs_v2", "logs_v2_resource")}

    request.getfixturevalue("signoz_archive")
    restored = request_restoration(signoz, day)
    row = wait_for_restoration(signoz, restored)
    assert row["status"] == "ready", row
    assert row["rows"] >= 3 and row["bytes"] > 0, row
    assert "CREATE TABLE IF NOT EXISTS `signoz_logs`.`rehydrated_logs_v2`" in row["ddl"], "the effective DDL is recorded"

    bodies = conn.query("SELECT body FROM signoz_logs.rehydrated_distributed_logs_v2 WHERE rehydration_id = {id:UUID} ORDER BY body", parameters={"id": restored}).result_rows
    assert bodies == [("restored one",), ("restored two",)]
    live = conn.query("SELECT ts_bucket_start, timestamp, severity_number, attributes_string FROM signoz_logs.logs_v2 WHERE body = 'restored one'").result_rows
    copy = conn.query("SELECT ts_bucket_start, timestamp, severity_number, attributes_string FROM signoz_logs.rehydrated_distributed_logs_v2 WHERE body = 'restored one' AND rehydration_id = {id:UUID}", parameters={"id": restored}).result_rows
    assert copy == live, "archived columns are cast back to their source types"
    labels = conn.query("SELECT labels FROM signoz_logs.rehydrated_distributed_logs_v2_resource WHERE rehydration_id = {id:UUID}", parameters={"id": restored}).result_rows
    assert any("archive-restore" in label for (label,) in labels), labels
    engine = conn.query("SELECT engine_full FROM system.tables WHERE database = 'signoz_logs' AND name = 'rehydrated_logs_v2'").result_rows[0][0]
    assert "PARTITION BY rehydration_id" in engine and "TTL expires_at" in engine, engine

    # Replaced in the bucket, the object no longer matches its commit.
    key = objects["logs_v2"][0]
    conn.query(f"INSERT INTO FUNCTION s3({archive_named_collection}, filename = '{key}', format = 'Parquet') SELECT 'forged' AS body SETTINGS s3_truncate_on_insert = 1")
    refused = request_restoration(signoz, day)
    row = wait_for_restoration(signoz, refused)
    assert (row["status"], row["failure_reason"]) == ("failed", "corrupt"), row
    count = conn.query("SELECT count() FROM signoz_logs.rehydrated_distributed_logs_v2 WHERE rehydration_id = {id:UUID}", parameters={"id": refused}).result_rows[0][0]
    assert count == 0, "a corrupt restoration loads nothing"
