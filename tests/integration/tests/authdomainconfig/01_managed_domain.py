import time
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.types import Operation, SigNoz
from integration.tests.authdomainconfig.conftest import MANAGED_CLIENT_SECRET, MANAGED_DOMAIN, MANAGED_ISSUER


def test_managed_domain_is_applied_after_the_first_organization_exists(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)

    domain = None
    for _ in range(30):
        response = requests.get(
            signoz.self.host_configs["8080"].get("/api/v2/auth_domains"),
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        assert response.status_code == HTTPStatus.OK, response.text
        domain = next((d for d in response.json()["data"] if d["name"] == MANAGED_DOMAIN), None)
        if domain is not None:
            break
        time.sleep(1)

    assert domain is not None, f"{MANAGED_DOMAIN} was not reconciled from the configuration file"
    assert domain["managedBy"] == "config"
    assert domain["enabled"] is True
    assert domain["config"]["kind"] == "oidc"
    assert domain["config"]["spec"]["issuer"] == MANAGED_ISSUER
    assert domain["config"]["spec"]["clientSecret"] == MANAGED_CLIENT_SECRET
    assert domain["config"]["spec"]["scopes"] == ["groups"]
    assert domain["roleMapping"]["groupMappings"]["fusescope-admins"]


def test_managed_domain_is_read_only_through_the_api(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(signoz.self.host_configs["8080"].get("/api/v2/auth_domains"), headers=headers, timeout=5)
    domain = next(d for d in response.json()["data"] if d["name"] == MANAGED_DOMAIN)

    response = requests.put(
        signoz.self.host_configs["8080"].get(f"/api/v2/auth_domains/{domain['id']}"),
        json={"enabled": False, "config": domain["config"], "roleMapping": domain["roleMapping"]},
        headers=headers,
        timeout=5,
    )
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text
    assert response.json()["error"]["code"] == "auth_domain_managed"

    response = requests.delete(signoz.self.host_configs["8080"].get(f"/api/v2/auth_domains/{domain['id']}"), headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text
    assert response.json()["error"]["code"] == "auth_domain_managed"


def test_domain_created_through_the_api_stays_editable(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}
    config = {"kind": "oidc", "spec": {"issuer": "https://idp.ui.integration.test", "clientId": "ui", "clientSecret": "ui-secret"}}

    response = requests.post(
        signoz.self.host_configs["8080"].get("/api/v2/auth_domains"),
        json={"name": "ui.integration.test", "enabled": True, "config": config},
        headers=headers,
        timeout=5,
    )
    assert response.status_code == HTTPStatus.CREATED, response.text
    domain_id = response.json()["data"]["id"]

    # Wait past a reconcile cycle: a domain the file does not declare must survive it.
    time.sleep(2)

    response = requests.put(
        signoz.self.host_configs["8080"].get(f"/api/v2/auth_domains/{domain_id}"),
        json={"enabled": False, "config": config},
        headers=headers,
        timeout=5,
    )
    assert response.status_code == HTTPStatus.NO_CONTENT, response.text

    response = requests.delete(signoz.self.host_configs["8080"].get(f"/api/v2/auth_domains/{domain_id}"), headers=headers, timeout=5)
    assert response.status_code == HTTPStatus.NO_CONTENT, response.text
