import time
from http import HTTPStatus

import requests

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD, token_getter
from fixtures.retention import delete_ttl_settings


def test_default_retention_set_when_unset(
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    signoz_retention_defaults: types.SigNoz,
    remove_traces_ttl_and_storage_settings,  # pylint: disable=unused-argument
    remove_metrics_ttl_and_storage_settings,  # pylint: disable=unused-argument
    remove_logs_ttl_settings,  # pylint: disable=unused-argument
):
    delete_ttl_settings(signoz_retention_defaults)

    url = signoz_retention_defaults.self.host_configs["8080"]
    headers = {"Authorization": f"Bearer {token_getter(signoz_retention_defaults)(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)}"}

    traces, metrics, logs = {}, {}, {}
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        traces = requests.get(url.get("/api/v1/settings/ttl"), params={"type": "traces"}, headers=headers, timeout=10).json()
        metrics = requests.get(url.get("/api/v1/settings/ttl"), params={"type": "metrics"}, headers=headers, timeout=10).json()
        logs = requests.get(url.get("/api/v2/settings/ttl"), headers=headers, timeout=10).json()
        if all(signal.get("status") == "success" for signal in (traces, metrics, logs)) and traces.get("traces_ttl_duration_hrs") == 72 and metrics.get("metrics_ttl_duration_hrs") == 72 and logs.get("default_ttl_days") == 3:
            break
        time.sleep(2)

    assert traces["status"] == "success"
    assert traces["traces_ttl_duration_hrs"] == 72
    assert traces["expected_traces_ttl_duration_hrs"] == 72
    assert metrics["status"] == "success"
    assert metrics["metrics_ttl_duration_hrs"] == 72
    assert metrics["expected_metrics_ttl_duration_hrs"] == 72
    assert logs["status"] == "success"
    assert logs["default_ttl_days"] == 3


def test_default_retention_never_overrides_admin_value(
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    signoz_retention_defaults: types.SigNoz,
):
    url = signoz_retention_defaults.self.host_configs["8080"]
    headers = {"Authorization": f"Bearer {token_getter(signoz_retention_defaults)(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)}"}

    response = requests.post(url.get("/api/v1/settings/ttl"), params={"type": "traces", "duration": "100h"}, headers=headers, timeout=30)
    assert response.status_code == HTTPStatus.OK

    response = requests.post(
        url.get("/api/v2/settings/ttl"),
        json={"type": "logs", "defaultTTLDays": 5, "ttlConditions": [], "coldStorageVolume": "", "coldStorageDurationDays": 0},
        headers=headers,
        timeout=30,
    )
    assert response.status_code == HTTPStatus.OK

    # Several reconcile intervals of the defaults instance.
    time.sleep(10)

    traces = requests.get(url.get("/api/v1/settings/ttl"), params={"type": "traces"}, headers=headers, timeout=10).json()
    assert traces["status"] == "success"
    assert traces["traces_ttl_duration_hrs"] == 100
    assert traces["expected_traces_ttl_duration_hrs"] == 100

    logs = requests.get(url.get("/api/v2/settings/ttl"), headers=headers, timeout=10).json()
    assert logs["status"] == "success"
    assert logs["default_ttl_days"] == 5
