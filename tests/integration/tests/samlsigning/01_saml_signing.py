from collections.abc import Callable
from http import HTTPStatus
from typing import Any
from xml.etree import ElementTree

import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait

from fixtures.auth import (
    USER_ADMIN_EMAIL,
    USER_ADMIN_PASSWORD,
    USERS_BASE,
    assert_user_has_role,
    find_user_with_roles_by_email,
)
from fixtures.idp import convert_saml_sp_metadata, get_saml_domain, perform_saml_login
from fixtures.types import SigNoz, TestContainerIDP

NAMESPACES = {"md": "urn:oasis:names:tc:SAML:2.0:metadata", "ds": "http://www.w3.org/2000/09/xmldsig#"}


def test_publish_service_provider_metadata(signoz: SigNoz) -> None:
    response = requests.get(signoz.self.host_configs["8080"].get("/api/v1/saml/metadata"), timeout=5)

    assert response.status_code == HTTPStatus.OK
    assert response.headers["Content-Type"] == "application/samlmetadata+xml"

    root = ElementTree.fromstring(response.content)
    descriptor = root.find("md:SPSSODescriptor", NAMESPACES)
    acs = descriptor.find("md:AssertionConsumerService", NAMESPACES)
    certificate = descriptor.find("md:KeyDescriptor[@use='signing']/ds:KeyInfo/ds:X509Data/ds:X509Certificate", NAMESPACES)

    assert root.get("entityID") == f"{signoz.self.host_configs['8080'].address}:{signoz.self.host_configs['8080'].port}"
    assert descriptor.get("AuthnRequestsSigned") == "true"
    assert descriptor.get("WantAssertionsSigned") == "true"
    assert acs.get("Location") == signoz.self.host_configs["8080"].get("/api/v1/complete/saml")
    assert acs.get("Binding") == "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
    assert certificate is not None and certificate.text


def test_create_auth_domain_requiring_signed_requests(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    signoz: SigNoz,
    idp: TestContainerIDP,
    create_saml_client: Callable[[str, str], None],
    update_saml_client_attributes: Callable[[str, dict[str, Any]], None],
    get_saml_settings: Callable[[], dict],
    create_user_admin: Callable[[], None],  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    client_id = f"{signoz.self.host_configs['8080'].address}:{signoz.self.host_configs['8080'].port}"
    create_saml_client("saml.integration.test", "/api/v1/complete/saml")

    # Configure the client the way an IdP admin would: by importing the published metadata.
    metadata = requests.get(signoz.self.host_configs["8080"].get("/api/v1/saml/metadata"), timeout=5).content
    imported = convert_saml_sp_metadata(idp, metadata)

    assert imported["clientId"] == client_id
    assert imported["attributes"]["saml.client.signature"] == "true"
    assert imported["attributes"]["saml.signing.certificate"]

    update_saml_client_attributes(
        client_id,
        {
            "saml.client.signature": "true",
            "saml.signing.certificate": imported["attributes"]["saml.signing.certificate"],
        },
    )

    settings = get_saml_settings()
    response = requests.post(
        signoz.self.host_configs["8080"].get("/api/v2/auth_domains"),
        json={
            "name": "saml.integration.test",
            "enabled": True,
            "config": {
                "kind": "saml",
                "spec": {
                    "entityId": settings["entityID"],
                    "location": settings["singleSignOnServiceLocation"],
                    "certificate": settings["certificate"],
                },
            },
        },
        headers={"Authorization": f"Bearer {get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)}"},
        timeout=2,
    )

    assert response.status_code == HTTPStatus.CREATED


def test_signed_saml_authn(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    signoz: SigNoz,
    idp: TestContainerIDP,  # pylint: disable=unused-argument
    driver: webdriver.Chrome,
    create_user_idp: Callable[[str, str, bool, str, str], None],
    idp_login: Callable[[str, str], None],
    get_token: Callable[[str, str], str],
    get_session_context: Callable[[str], dict],
) -> None:
    email = "signed@saml.integration.test"
    create_user_idp(email, "password", True)

    perform_saml_login(signoz, driver, get_session_context, idp_login, email, "password")

    found_user = find_user_with_roles_by_email(signoz, get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD), email)
    assert_user_has_role(found_user, "signoz-viewer")


def test_unsigned_saml_authn_rejected_by_idp(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    signoz: SigNoz,
    idp: TestContainerIDP,  # pylint: disable=unused-argument
    driver: webdriver.Chrome,
    create_user_idp: Callable[[str, str, bool, str, str], None],
    get_saml_settings: Callable[[], dict],
    get_token: Callable[[str, str], str],
    get_session_context: Callable[[str], dict],
) -> None:
    admin_token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    domain = get_saml_domain(signoz, admin_token)
    settings = get_saml_settings()

    response = requests.put(
        signoz.self.host_configs["8080"].get(f"/api/v2/auth_domains/{domain['id']}"),
        json={
            "enabled": True,
            "config": {
                "kind": "saml",
                "spec": {
                    "entityId": settings["entityID"],
                    "location": settings["singleSignOnServiceLocation"],
                    "certificate": settings["certificate"],
                    "insecureSkipAuthNRequestsSigned": True,
                },
            },
        },
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=2,
    )
    assert response.status_code == HTTPStatus.NO_CONTENT

    email = "unsigned@saml.integration.test"
    create_user_idp(email, "password", True)

    login_url = get_session_context(email)["orgs"][0]["authNSupport"]["callback"][0]["url"]
    assert "Signature=" not in login_url

    driver.get(login_url)
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "kc-error-message")))
    assert not driver.find_elements(By.ID, "username")

    response = requests.get(
        signoz.self.host_configs["8080"].get(USERS_BASE),
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert response.status_code == HTTPStatus.OK
    assert all(user["email"] != email for user in response.json()["data"])
