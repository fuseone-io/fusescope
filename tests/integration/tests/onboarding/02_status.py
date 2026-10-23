import time
import uuid
from collections.abc import Callable
from http import HTTPStatus

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD, create_active_user
from fixtures.onboarding import get_onboarding_status, send_otlp_telemetry, wait_for_onboarding_status


def test_status_before_and_after_sending_otlp(
    signoz: types.SigNoz,
    otel_collector: types.TestContainerDocker,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    service = f"checkout-{uuid.uuid4().hex[:8]}"
    since = int(time.time() * 1000) - 60_000
    params = {"service": service, "signals": "traces,metrics,logs", "since": since}

    response = get_onboarding_status(signoz, token, params)
    assert response.status_code == HTTPStatus.OK, response.text
    before = response.json()["data"]
    assert before["service"] == service
    assert before["since"] == since
    for signal in ("traces", "metrics", "logs"):
        assert before[signal]["received"] is False, signal
        assert before[signal]["count"] == 0, signal
        assert before[signal]["firstSeen"] is None, signal

    sent_ns = time.time_ns()
    send_otlp_telemetry(otel_collector, service, sent_ns)

    after = wait_for_onboarding_status(signoz, token, params)
    for signal in ("traces", "metrics", "logs"):
        assert after[signal]["count"] >= 1, signal
        assert after[signal]["firstSeen"] == sent_ns // 1_000_000, signal
        assert after[signal]["lastSeen"] == sent_ns // 1_000_000, signal
    assert after["traces"]["operations"] == 1
    assert after["metrics"]["series"] == 1

    response = get_onboarding_status(signoz, token, {"service": f"other-{uuid.uuid4().hex[:8]}", "since": since})
    assert response.status_code == HTTPStatus.OK, response.text
    other = response.json()["data"]
    assert [other[signal]["received"] for signal in ("traces", "metrics", "logs")] == [False, False, False]

    response = get_onboarding_status(signoz, token, {"signals": "logs", "since": since})
    assert response.status_code == HTTPStatus.OK, response.text
    unfiltered = response.json()["data"]
    assert unfiltered["service"] is None
    assert unfiltered["traces"] is None
    assert unfiltered["metrics"] is None
    assert unfiltered["logs"]["received"] is True


def test_status_rejects_invalid_queries(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)

    for params in ({"signals": "profiles"}, {"since": int(time.time() * 1000) + 3_600_000}, {"since": "yesterday"}):
        response = get_onboarding_status(signoz, token, params)
        assert response.status_code == HTTPStatus.BAD_REQUEST, params


def test_viewer_reads_status(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    admin_token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    email = f"onboarding-status-viewer-{uuid.uuid4().hex[:8]}@integration.test"
    create_active_user(signoz, admin_token, email, "signoz-viewer", "password123Z$")

    response = get_onboarding_status(signoz, get_token(email, "password123Z$"), {"signals": "traces"})
    assert response.status_code == HTTPStatus.OK, response.text
    assert response.json()["data"]["traces"] is not None
