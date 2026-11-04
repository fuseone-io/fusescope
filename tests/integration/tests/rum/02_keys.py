import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD, create_active_user
from fixtures.rum import REPORT_WAIT_SECONDS, RUM_APPLICATIONS, RUM_KEY_HEADER, create_rum_application, post_rum_until, wait_for_rum_query
from fixtures.types import FuseScopeCollector, Operation, SigNoz

TRACE = '{"resourceSpans":[]}'


def test_key_rotation(
    signoz: SigNoz,
    fusescope_collector: FuseScopeCollector,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}
    created = create_rum_application(signoz, token, {"name": f"keys-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    keys_url = signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/keys")
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
        post_rum_until(fusescope_collector, "traces", TRACE, {RUM_KEY_HEADER: plaintext, "Content-Type": "application/json"}, HTTPStatus.OK)

    response = requests.post(f"{keys_url}/{second['id']}/rotate", json={"overlap": "24h"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.CONFLICT, "one rotation at a time"

    response = requests.delete(f"{keys_url}/{first['id']}", headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.NO_CONTENT, response.text

    post_rum_until(fusescope_collector, "traces", TRACE, {RUM_KEY_HEADER: first["key"], "Content-Type": "application/json"}, HTTPStatus.UNAUTHORIZED)

    response = requests.get(keys_url, headers=headers, timeout=5)
    assert [key["id"] for key in response.json()["data"]] == [second["id"]]

    response = requests.post(f"{keys_url}/{second['id']}/rotate", json={"overlap": "7d"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.CREATED, response.text

    wait_for_rum_query(signoz, token, f"{RUM_APPLICATIONS}/{created['id']}/keys", {}, lambda data: any(key["id"] == second["id"] and key["lastUsedAt"] for key in data), attempts=REPORT_WAIT_SECONDS)


def test_viewer_cannot_see_or_manage_keys(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    admin_token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, admin_token, {"name": f"viewer-keys-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    email = f"rum-viewer-{uuid.uuid4().hex[:8]}@integration.test"
    create_active_user(signoz, admin_token, email, "signoz-viewer", "password123Z$")
    headers = {"Authorization": f"Bearer {get_token(email, 'password123Z$')}"}
    keys_url = signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/keys")
    key_url = f"{keys_url}/{created['key']['id']}"

    response = requests.get(keys_url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN, "last4 and usage are operational details"

    response = requests.post(keys_url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text

    response = requests.post(f"{key_url}/rotate", json={"overlap": "1h"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text

    response = requests.delete(key_url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text

    response = requests.get(keys_url, headers={"Authorization": f"Bearer {admin_token}"}, timeout=5)
    assert [key["id"] for key in response.json()["data"]] == [created["key"]["id"]]
