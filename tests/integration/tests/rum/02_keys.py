import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, RUM_KEY_HEADER, create_rum_application
from fixtures.types import Operation, SigNoz

TRACE = '{"resourceSpans":[]}'


def test_key_rotation(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}
    created = create_rum_application(signoz, token, {"name": f"keys-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    keys_url = signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/keys")
    traces_url = signoz.self.host_configs["8080"].get("/rum/v1/traces")
    first = created["key"]

    response = requests.post(keys_url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.CONFLICT, "a usable key must be rotated, not duplicated"

    response = requests.post(f"{keys_url}/{first['id']}/rotate", json={"overlap": "2h"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.BAD_REQUEST

    response = requests.post(f"{keys_url}/{first['id']}/rotate", json={"overlap": "1h"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.CREATED, response.text
    second = response.json()["data"]
    assert second["key"].startswith("rum_pub_") and second["key"] != first["key"]
    assert second["status"] == "active"

    response = requests.get(keys_url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text
    listed = {key["id"]: key for key in response.json()["data"]}
    assert listed[first["id"]]["status"] == "expiring"
    assert listed[first["id"]]["expiresAt"] is not None
    assert listed[second["id"]]["status"] == "active"
    assert all("key" not in key for key in listed.values())

    for plaintext in (first["key"], second["key"]):
        response = requests.post(traces_url, data=TRACE, headers={RUM_KEY_HEADER: plaintext, "Content-Type": "application/json"}, timeout=10)
        assert response.status_code == HTTPStatus.OK, response.text

    response = requests.post(f"{keys_url}/{second['id']}/rotate", json={"overlap": "24h"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.CONFLICT, "one rotation at a time"

    response = requests.delete(f"{keys_url}/{first['id']}", headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.NO_CONTENT, response.text

    response = requests.post(traces_url, data=TRACE, headers={RUM_KEY_HEADER: first["key"], "Content-Type": "application/json"}, timeout=10)
    assert response.status_code == HTTPStatus.UNAUTHORIZED

    response = requests.get(keys_url, headers=headers, timeout=5)
    assert [key["id"] for key in response.json()["data"]] == [second["id"]]

    response = requests.post(f"{keys_url}/{second['id']}/rotate", json={"overlap": "7d"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.CREATED, response.text

    response = requests.get(signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/status"), headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text
    assert {"reason": "bad_key", "count": 1} == {key: value for key, value in response.json()["data"]["rejections"][0].items() if key in ("reason", "count")}
