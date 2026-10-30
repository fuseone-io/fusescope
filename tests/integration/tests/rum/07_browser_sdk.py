import base64
import hashlib
import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, create_rum_application
from fixtures.types import Operation, SigNoz


def test_browser_sdk_is_served_anonymously(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"sdk-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    response = requests.get(
        signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/status"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    bundle = response.json()["data"]["browserBundle"]
    assert bundle["name"] == "@fusescope/browser"
    assert bundle["path"] == f"/rum/v1/sdk/browser/{bundle['version']}/fusescope.min.js"

    response = requests.get(signoz.self.host_configs["8080"].get(bundle["path"]), headers={"Origin": "https://shop.example.com"}, timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text
    assert response.headers["Content-Type"] == "application/javascript"
    assert response.headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert f"sha384-{base64.b64encode(hashlib.sha384(response.content).digest()).decode()}" == bundle["integrity"]

    response = requests.get(signoz.self.host_configs["8080"].get(f"{bundle['path']}.map"), timeout=5)
    assert response.status_code == HTTPStatus.OK, response.text
    assert response.headers["Content-Type"] == "application/json"
    assert response.json()["version"] == 3

    response = requests.get(signoz.self.host_configs["8080"].get("/rum/v1/sdk/browser/0.0.0/fusescope.min.js"), timeout=5)
    assert response.status_code == HTTPStatus.NOT_FOUND
