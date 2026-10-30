from collections.abc import Callable
from http import HTTPStatus
from uuid import uuid4

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.dashboards import create_public_dashboard
from fixtures.types import Operation, SigNoz

# Limits set by signoz_public_ratelimit: client burst 2, link burst 4, no refill within a run.
# Buckets outlive a --reuse run, so every run uses fresh links and client addresses.


def test_public_dashboard_client_rate_limit(
    signoz: SigNoz,
    signoz_public_ratelimit: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    first_link = create_public_dashboard(signoz, token, f"ratelimit-client-{uuid4().hex}")
    second_link = create_public_dashboard(signoz, token, f"ratelimit-client-{uuid4().hex}")
    octets = uuid4().bytes
    client = f"10.{octets[0]}.{octets[1]}.{octets[2]}"
    other_client = f"10.{octets[0]}.{octets[1]}.{(octets[2] + 1) % 256}"

    statuses = [
        requests.get(
            signoz_public_ratelimit.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{link}"),
            headers={"X-Forwarded-For": client},
            timeout=5,
        ).status_code
        for link in (first_link, second_link)
    ]
    assert statuses == [HTTPStatus.OK, HTTPStatus.OK]

    # The client budget spans every link and both public routes.
    limited = requests.get(
        signoz_public_ratelimit.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{first_link}/panels/missing/query_range"),
        headers={"X-Forwarded-For": client},
        timeout=5,
    )
    assert limited.status_code == HTTPStatus.TOO_MANY_REQUESTS, limited.text
    assert limited.headers["Retry-After"] == "1"
    assert limited.json()["error"]["code"] == "public_dashboard_rate_limited"

    other = requests.get(
        signoz_public_ratelimit.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{first_link}"),
        headers={"X-Forwarded-For": other_client},
        timeout=5,
    )
    assert other.status_code == HTTPStatus.OK, other.text


def test_public_dashboard_link_rate_limit(
    signoz: SigNoz,
    signoz_public_ratelimit: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    link = create_public_dashboard(signoz, token, f"ratelimit-link-{uuid4().hex}")
    other_link = create_public_dashboard(signoz, token, f"ratelimit-link-{uuid4().hex}")
    octets = uuid4().bytes
    clients = [f"10.{octets[0]}.{octets[1]}.{i}" for i in range(6)]

    statuses = [
        requests.get(
            signoz_public_ratelimit.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{link}"),
            headers={"X-Forwarded-For": client},
            timeout=5,
        ).status_code
        for client in clients[:5]
    ]
    assert statuses == [HTTPStatus.OK] * 4 + [HTTPStatus.TOO_MANY_REQUESTS]

    limited = requests.get(
        signoz_public_ratelimit.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{link}/panels/missing/query_range"),
        headers={"X-Forwarded-For": clients[5]},
        timeout=5,
    )
    assert limited.status_code == HTTPStatus.TOO_MANY_REQUESTS, limited.text

    other = requests.get(
        signoz_public_ratelimit.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{other_link}"),
        headers={"X-Forwarded-For": clients[0]},
        timeout=5,
    )
    assert other.status_code == HTTPStatus.OK, other.text
