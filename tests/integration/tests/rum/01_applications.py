import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD, create_active_user
from fixtures.rum import RUM_APPLICATIONS, create_rum_application
from fixtures.types import Operation, SigNoz


def test_application_crud(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}
    name = f"crud-{uuid.uuid4().hex[:8]}"

    created = create_rum_application(
        signoz,
        token,
        {
            "name": name,
            "platform": "web",
            "environment": "production",
            "allowedOrigins": ["https://shop.example.com", "https://*.example.com"],
            "tracePropagationUrls": ["https://api.example.com"],
            "sampleRate": 0.5,
            "piiPolicy": {"queryAllowlist": ["page"], "requireConsent": True},
        },
    )
    assert created["name"] == name
    assert created["platform"] == "web"
    assert created["createdBy"] == USER_ADMIN_EMAIL
    assert created["firstSeenAt"] is None
    assert created["piiPolicy"]["dropQuery"] is True
    assert created["piiPolicy"]["requireConsent"] is True
    assert created["key"]["key"].startswith("rum_pub_")
    assert created["key"]["last4"] == created["key"]["key"][-4:]
    assert created["key"]["status"] == "active"
    url = signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}")

    response = requests.get(url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text
    assert response.json()["data"]["sampleRate"] == 0.5
    assert "key" not in response.json()["data"]

    response = requests.get(signoz.self.host_configs["8080"].get(RUM_APPLICATIONS), headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text
    assert created["id"] in [application["id"] for application in response.json()["data"]]

    response = requests.put(
        url,
        json={"name": name, "environment": "staging", "allowedOrigins": ["*"], "sampleRate": 1, "piiPolicy": {"dropQuery": False}},
        headers=headers,
        timeout=5,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    assert response.json()["data"]["environment"] == "staging"
    assert response.json()["data"]["allowedOrigins"] == ["*"]
    assert response.json()["data"]["piiPolicy"]["dropQuery"] is False
    assert response.json()["data"]["platform"] == "web"

    response = requests.delete(url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.NO_CONTENT, response.text

    response = requests.get(url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.json()["error"]["code"] == "rum_application_not_found"


def test_application_validation(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    payloads = [
        {"name": "reserved", "platform": "ios", "environment": "production"},
        {"name": "bad-origin", "platform": "web", "environment": "production", "allowedOrigins": ["shop.example.com"]},
        {"name": "bad-rate", "platform": "web", "environment": "production", "sampleRate": 2},
    ]

    for payload in payloads:
        response = requests.post(
            signoz.self.host_configs["8080"].get(RUM_APPLICATIONS),
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST, payload
        assert response.json()["error"]["code"] == "rum_application_invalid_input"


def test_application_name_is_unique(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    payload = {"name": f"dup-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"}
    create_rum_application(signoz, token, payload)

    response = requests.post(
        signoz.self.host_configs["8080"].get(RUM_APPLICATIONS),
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    assert response.status_code == HTTPStatus.CONFLICT, response.text


def test_viewer_reads_but_cannot_manage_applications(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    admin_token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, admin_token, {"name": f"viewed-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    email = f"rum-viewer-{uuid.uuid4().hex[:8]}@integration.test"
    create_active_user(signoz, admin_token, email, "signoz-viewer", "password123Z$")
    headers = {"Authorization": f"Bearer {get_token(email, 'password123Z$')}"}
    applications_url = signoz.self.host_configs["8080"].get(RUM_APPLICATIONS)
    application_url = signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}")

    response = requests.get(applications_url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text
    assert created["id"] in [application["id"] for application in response.json()["data"]]

    response = requests.get(application_url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text
    assert response.json()["data"]["name"] == created["name"]

    response = requests.get(f"{application_url}/status", headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text

    response = requests.post(applications_url, json={"name": "viewer-app", "platform": "web", "environment": "production"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text

    response = requests.put(application_url, json={"name": created["name"], "environment": "staging"}, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text

    response = requests.delete(application_url, headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text

    response = requests.get(application_url, headers={"Authorization": f"Bearer {admin_token}"}, timeout=5)
    assert response.status_code == HTTPStatus.OK, "the viewer's delete must not have removed the application"


def test_rum_fields_promoted_on_first_application(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    create_rum_application(
        signoz,
        get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD),
        {"name": f"promote-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"},
    )

    expected = {
        "attribute_string_session$$id",
        "attribute_string_fusescope$$rum$$view$$route",
        "resource_string_fusescope$$rum$$platform",
        "resource_string_fusescope$$rum$$application$$id",
    }
    for database, table in [("signoz_traces", "signoz_index_v3"), ("signoz_traces", "distributed_signoz_index_v3"), ("signoz_logs", "logs_v2"), ("signoz_logs", "distributed_logs_v2")]:
        rows = signoz.telemetrystore.conn.query(
            "SELECT name FROM system.columns WHERE database = {database:String} AND table = {table:String}",
            parameters={"database": database, "table": table},
        ).result_rows
        columns = {row[0] for row in rows}
        assert expected <= columns, f"{database}.{table} misses {expected - columns}"
        assert {f"{column}_exists" for column in expected} <= columns

    rows = signoz.telemetrystore.conn.query("SELECT name FROM system.data_skipping_indices WHERE database = 'signoz_traces' AND table = 'signoz_index_v3'").result_rows
    assert "attribute_string_session$$id_idx" in {row[0] for row in rows}
