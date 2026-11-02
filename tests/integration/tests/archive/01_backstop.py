import datetime
import time
from collections.abc import Callable
from http import HTTPStatus

import pytest
import requests

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.logs import Logs

BACKSTOP_TTL = "toDateTime(created_at)"


@pytest.fixture(name="archive_test_suite_setup", scope="package", autouse=True)
def archive_test_suite_setup(create_user_admin):  # pylint: disable=unused-argument
    pass


def test_backstop_reaches_existing_parts_and_keeps_the_cold_storage_delay(
    signoz: types.SigNoz,
    get_token: Callable[[str, str], str],
    insert_logs: Callable[[list[Logs]], None],
    request: pytest.FixtureRequest,
) -> None:
    now = datetime.datetime.now(datetime.UTC)
    insert_logs(
        [
            Logs(timestamp=now - datetime.timedelta(days=14), body="old", resources={"service.name": "archive-backstop"}),
            Logs(timestamp=now - datetime.timedelta(hours=1), body="young", resources={"service.name": "archive-backstop"}),
        ]
    )
    response = requests.post(
        signoz.self.host_configs["8080"].get("/api/v2/settings/ttl"),
        json={"type": "logs", "defaultTTLDays": 15, "ttlConditions": [], "coldStorageVolume": "cold", "coldStorageDurationDays": 7},
        headers={"Authorization": f"Bearer {get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)}"},
        timeout=30,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    parts = signoz.telemetrystore.conn.query("SELECT name, toUnixTimestamp(delete_ttl_info_max) FROM system.parts WHERE database = 'signoz_logs' AND table = 'logs_v2' AND active").result_rows
    assert len(parts) >= 1
    assert any(expiry < time.time() + 2 * 86400 for _, expiry in parts), "under the 15-day retention the 14-day-old part expires within two days"

    request.getfixturevalue("signoz_archive")

    deadline = time.time() + 120
    while time.time() < deadline:
        engine_full = signoz.telemetrystore.conn.query("SELECT engine_full FROM system.tables WHERE database = 'signoz_logs' AND name = 'logs_v2'").result_rows[0][0]
        expiries = signoz.telemetrystore.conn.query("SELECT toUnixTimestamp(delete_ttl_info_max) FROM system.parts WHERE database = 'signoz_logs' AND table = 'logs_v2' AND active").result_rows
        if BACKSTOP_TTL in engine_full and all(expiry > time.time() + 21 * 86400 for (expiry,) in expiries):
            break
        time.sleep(2)
    else:
        pytest.fail(f"the backstop never reached the existing parts: {engine_full}, {expiries}")

    resource_engine_full = signoz.telemetrystore.conn.query("SELECT engine_full FROM system.tables WHERE database = 'signoz_logs' AND name = 'logs_v2_resource'").result_rows[0][0]
    assert "toIntervalDay(7)" in resource_engine_full
    assert "toIntervalDay(if(_retention_days_cold = 0, 7, _retention_days_cold)) TO VOLUME 'cold'" in engine_full, "the move rule is kept"

    old_partition = str((now - datetime.timedelta(days=14)).date())
    deadline = time.time() + 120
    while time.time() < deadline:
        # Partitions are ('<date>', _retention_days, _retention_days_cold).
        parts = signoz.telemetrystore.conn.query("SELECT partition, disk_name FROM system.parts WHERE database = 'signoz_logs' AND table = 'logs_v2' AND active").result_rows
        disks = {partition.split("'")[1]: disk_name for partition, disk_name in parts}
        if disks.get(old_partition) == "cold":
            break
        time.sleep(2)
    assert disks.get(str((now - datetime.timedelta(hours=1)).date())) != "cold", f"a recent row written before cold storage was set was moved by MATERIALIZE TTL: {disks}"
    assert disks.get(old_partition) == "cold", f"a row older than the cold-storage delay stayed hot: {disks}"


@pytest.mark.parametrize(
    "payload",
    [
        {"type": "logs", "defaultTTLDays": 20, "ttlConditions": [], "coldStorageVolume": "cold", "coldStorageDurationDays": 5},
        {"type": "logs", "defaultTTLDays": 25, "ttlConditions": []},
    ],
    ids=["with_cold_storage", "without_cold_storage"],
)
def test_backstop_survives_retention_change(
    signoz: types.SigNoz,
    signoz_archive: types.SigNoz,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
    payload: dict,
) -> None:
    response = requests.post(
        signoz.self.host_configs["8080"].get("/api/v2/settings/ttl"),
        json=payload,
        headers={"Authorization": f"Bearer {get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)}"},
        timeout=30,
    )
    assert response.status_code == HTTPStatus.OK, response.text

    for table in ["logs_v2", "logs_v2_resource"]:
        engine_full = signoz.telemetrystore.conn.query(f"SELECT engine_full FROM system.tables WHERE database = 'signoz_logs' AND name = '{table}'").result_rows[0][0]
        assert "toIntervalDay(7)" in engine_full, engine_full
        if "coldStorageVolume" in payload:
            assert "TO VOLUME 'cold'" in engine_full, engine_full

    engine_full = signoz.telemetrystore.conn.query("SELECT engine_full FROM system.tables WHERE database = 'signoz_logs' AND name = 'logs_v2'").result_rows[0][0]
    assert BACKSTOP_TTL in engine_full, engine_full
