from collections.abc import Callable
from http import HTTPStatus

import pytest
import requests

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD, create_active_user

EDITOR_EMAIL = "editor+integrationsauthz@integration.test"
VIEWER_EMAIL = "viewer+integrationsauthz@integration.test"
PASSWORD = "password123Z$"


def test_setup_managed_role_users(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    admin_token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)

    # A --reuse stack keeps the users of an earlier run, and inviting an existing address fails.
    response = requests.get(
        signoz.self.host_configs["8080"].get("/api/v2/users"),
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    existing_emails = {user["email"] for user in response.json()["data"]}

    for email, role in ((EDITOR_EMAIL, "signoz-editor"), (VIEWER_EMAIL, "signoz-viewer")):
        if email not in existing_emails:
            create_active_user(signoz, admin_token, email=email, role=role, password=PASSWORD)


@pytest.mark.parametrize(
    "path,body",
    [
        ("/api/v1/integrations/install", {"integration_id": "builtin-nginx", "config": {}}),
        ("/api/v1/integrations/uninstall", {"integration_id": "builtin-nginx"}),
        ("/api/v1/integrations/upgrade", {"integration_id": "builtin-nginx"}),
    ],
    ids=["install", "uninstall", "upgrade"],
)
def test_viewer_cannot_change_integrations(
    signoz: types.SigNoz,
    get_token: Callable[[str, str], str],
    path: str,
    body: dict,
) -> None:
    token = get_token(VIEWER_EMAIL, PASSWORD)

    response = requests.post(
        signoz.self.host_configs["8080"].get(path),
        json=body,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )

    assert response.status_code == HTTPStatus.FORBIDDEN, response.text


def test_editor_can_install_upgrade_and_uninstall(
    signoz: types.SigNoz,
    get_token: Callable[[str, str], str],
) -> None:
    headers = {"Authorization": f"Bearer {get_token(EDITOR_EMAIL, PASSWORD)}"}

    install = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/install"),
        json={"integration_id": "builtin-nginx", "config": {}},
        headers=headers,
        timeout=10,
    )
    assert install.status_code == HTTPStatus.OK, install.text
    assert install.json()["data"]["is_installed"] is True

    upgrade = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/upgrade"),
        json={"integration_id": "builtin-nginx"},
        headers=headers,
        timeout=10,
    )
    assert upgrade.status_code == HTTPStatus.OK, upgrade.text

    uninstall = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/uninstall"),
        json={"integration_id": "builtin-nginx"},
        headers=headers,
        timeout=10,
    )
    assert uninstall.status_code == HTTPStatus.OK, uninstall.text
