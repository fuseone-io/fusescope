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


def test_backstop_reaches_existing_parts(
    signoz: types.SigNoz,
    insert_logs: Callable[[list[Logs]], None],
    request: pytest.FixtureRequest,
) -> None:
    insert_logs([Logs(timestamp=datetime.datetime.now() - datetime.timedelta(days=14), body="old", resources={"service.name": "archive-backstop"})])
    parts = signoz.telemetrystore.conn.query("SELECT name, toUnixTimestamp(delete_ttl_info_max) FROM system.parts WHERE database = 'signoz_logs' AND table = 'logs_v2' AND active").result_rows
    assert len(parts) >= 1
    assert all(expiry < time.time() + 2 * 86400 for _, expiry in parts), "under the default 15-day retention the 14-day-old part expires within two days"

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
