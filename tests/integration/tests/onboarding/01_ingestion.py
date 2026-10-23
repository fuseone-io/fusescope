import uuid
from collections.abc import Callable
from http import HTTPStatus

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD, create_active_user
from fixtures.onboarding import get_ingestion, update_ingestion


def test_configured_ingestion_url(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    response = get_ingestion(signoz, get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD))

    assert response.status_code == HTTPStatus.OK, response.text
    data = response.json()["data"]
    assert data["source"] == "config"
    assert data["derived"] is False
    assert data["configUrl"] == "https://ingest.fusescope.test"
    assert data["organizationUrl"] is None
    assert data["otlpHttpEndpoint"] == "https://ingest.fusescope.test"
    assert data["otlpGrpcEndpoint"] == "ingest.fusescope.test:443"
    assert data["otlpGrpcInsecure"] is False
    assert data["authRequired"] is False
    assert data["collector"]["reachable"] is True


def test_derived_ingestion_url(
    signoz_derived: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    response = get_ingestion(signoz_derived, get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD))

    assert response.status_code == HTTPStatus.OK, response.text
    data = response.json()["data"]
    assert data["source"] == "derived"
    assert data["derived"] is True
    assert data["configUrl"] is None
    assert data["otlpHttpEndpoint"] == "http://fusescope.example.com:4318"
    assert data["otlpGrpcEndpoint"] == "fusescope.example.com:4317"
    assert data["otlpGrpcInsecure"] is True
    assert data["authRequired"] is False
    assert data["collector"] is None


def test_admin_override_wins_over_config_and_derivation(
    signoz: types.SigNoz,
    signoz_derived: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)

    try:
        response = update_ingestion(signoz, token, "http://otel.acme.internal:4318/")
        assert response.status_code == HTTPStatus.OK, response.text
        assert response.json()["data"]["organizationUrl"] == "http://otel.acme.internal:4318"

        for instance in (signoz, signoz_derived):
            response = get_ingestion(instance, token)
            assert response.status_code == HTTPStatus.OK, response.text
            data = response.json()["data"]
            assert data["source"] == "organization"
            assert data["derived"] is False
            assert data["otlpHttpEndpoint"] == "http://otel.acme.internal:4318"
            assert data["otlpGrpcEndpoint"] == "otel.acme.internal:4317"
            assert data["otlpGrpcInsecure"] is True
    finally:
        response = update_ingestion(signoz, token, "")
        assert response.status_code == HTTPStatus.OK, response.text

    assert get_ingestion(signoz, token).json()["data"]["source"] == "config"
    assert get_ingestion(signoz_derived, token).json()["data"]["source"] == "derived"


def test_invalid_ingestion_url_is_rejected(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)

    for invalid in ("otel.acme.internal:4317", "grpc://otel.acme.internal:4317", "https://user:secret@otel.acme.internal"):
        response = update_ingestion(signoz, token, invalid)
        assert response.status_code == HTTPStatus.BAD_REQUEST, invalid

    assert get_ingestion(signoz, token).json()["data"]["source"] == "config"


def test_viewer_reads_but_cannot_update_ingestion(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    admin_token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    email = f"onboarding-viewer-{uuid.uuid4().hex[:8]}@integration.test"
    create_active_user(signoz, admin_token, email, "signoz-viewer", "password123Z$")
    viewer_token = get_token(email, "password123Z$")

    response = get_ingestion(signoz, viewer_token)
    assert response.status_code == HTTPStatus.OK, response.text

    response = update_ingestion(signoz, viewer_token, "https://otlp.viewer.test")
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text

    assert get_ingestion(signoz, admin_token).json()["data"]["organizationUrl"] is None
