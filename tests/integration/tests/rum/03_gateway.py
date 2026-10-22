import gzip
import json
import time
import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, RUM_KEY_HEADER, create_rum_application
from fixtures.types import Operation, SigNoz

ORIGIN = "https://shop.example.com"


def test_gateway_ingests_scrubbed_stamped_telemetry(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(
        signoz,
        token,
        {"name": f"e2e-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [ORIGIN], "piiPolicy": {"queryAllowlist": ["page"]}},
    )
    session_id = f"session-{uuid.uuid4().hex}"
    now = time.time_ns()

    response = requests.options(
        signoz.self.host_configs["8080"].get("/rum/v1/traces"),
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type, fusescope-rum-key"},
        timeout=5,
    )
    assert response.status_code == HTTPStatus.NO_CONTENT
    assert response.headers["Access-Control-Allow-Origin"] == ORIGIN
    assert "fusescope-rum-key" in response.headers["Access-Control-Allow-Headers"]
    assert response.headers["Access-Control-Allow-Methods"] == "POST"

    traces = {
        "resourceSpans": [
            {
                "resource": {"attributes": [{"key": "fusescope.rum.application.id", "value": {"stringValue": "forged"}}]},
                "scopeSpans": [
                    {
                        "spans": [
                            {
                                "traceId": uuid.uuid4().hex,
                                "spanId": uuid.uuid4().hex[:16],
                                "name": "Navigation: /customers/392#tab?email=a@b.c",
                                "kind": 1,
                                "startTimeUnixNano": str(now),
                                "endTimeUnixNano": str(now + 1_000_000),
                                "attributes": [
                                    {"key": "url.full", "value": {"stringValue": "https://shop.example.com/search?email=a@b.c&page=2#results"}},
                                    {"key": "session.id", "value": {"stringValue": session_id}},
                                ],
                            }
                        ]
                    }
                ],
            }
        ]
    }
    response = requests.post(
        signoz.self.host_configs["8080"].get("/rum/v1/traces"),
        data=json.dumps(traces),
        headers={RUM_KEY_HEADER: created["key"]["key"], "Content-Type": "application/json", "Origin": ORIGIN},
        timeout=10,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    assert response.headers["Access-Control-Allow-Origin"] == ORIGIN

    logs = {
        "resourceLogs": [
            {
                "resource": {},
                "scopeLogs": [
                    {
                        "logRecords": [
                            {
                                "timeUnixNano": str(now),
                                "eventName": "exception",
                                "body": {"stringValue": "TypeError: x is undefined"},
                                "attributes": [
                                    {"key": "session.id", "value": {"stringValue": session_id}},
                                    {"key": "fusescope.rum.error.source", "value": {"stringValue": "onerror"}},
                                ],
                            }
                        ]
                    }
                ],
            }
        ]
    }
    response = requests.post(
        signoz.self.host_configs["8080"].get(f"/rum/v1/logs?fusescope_rum_key={created['key']['key']}"),
        data=gzip.compress(json.dumps(logs).encode()),
        headers={"Content-Type": "text/plain;charset=UTF-8", "Content-Encoding": "gzip", "Origin": ORIGIN},
        timeout=10,
    )
    assert response.status_code == HTTPStatus.OK, response.text

    span_rows, log_rows = [], []
    for _ in range(30):
        span_rows = signoz.telemetrystore.conn.query(
            "SELECT name, attributes_string['url.full'], resources_string['fusescope.rum.application.id'], resources_string['fusescope.rum.platform'] FROM signoz_traces.distributed_signoz_index_v3 WHERE attributes_string['session.id'] = {session:String}",
            parameters={"session": session_id},
        ).result_rows
        log_rows = signoz.telemetrystore.conn.query(
            "SELECT attributes_string['event.name'], attributes_string['fusescope.rum.error.source'], resources_string['fusescope.rum.application.id'] FROM signoz_logs.distributed_logs_v2 WHERE attributes_string['session.id'] = {session:String}",
            parameters={"session": session_id},
        ).result_rows
        if span_rows and log_rows:
            break
        time.sleep(1)

    assert span_rows == [("Navigation: /customers/392", "https://shop.example.com/search?page=2", created["id"], "web")]
    assert log_rows == [("exception", "onerror", created["id"])]

    response = requests.get(
        signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/status"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    status = response.json()["data"]
    assert status["firstSeenAt"] is not None
    assert status["counts"]["sessions"] == 1
    assert status["counts"]["errors"] == 1
    assert status["supportedSdks"][0]["name"] == "@fusescope/browser"


def test_gateway_rejects_bad_key_and_origin(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"reject-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [ORIGIN]})
    url = signoz.self.host_configs["8080"].get("/rum/v1/traces")

    response = requests.post(url, data='{"resourceSpans":[]}', headers={"Content-Type": "application/json", "Origin": ORIGIN}, timeout=5)
    assert response.status_code == HTTPStatus.UNAUTHORIZED

    response = requests.post(url, data='{"resourceSpans":[]}', headers={RUM_KEY_HEADER: "rum_pub_doesnotexistdoesnotexist12", "Content-Type": "application/json", "Origin": ORIGIN}, timeout=5)
    assert response.status_code == HTTPStatus.UNAUTHORIZED

    response = requests.post(url, data='{"resourceSpans":[]}', headers={RUM_KEY_HEADER: created["key"]["key"], "Content-Type": "application/json", "Origin": "https://evil.example.org"}, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert "Access-Control-Allow-Origin" not in response.headers

    response = requests.options(url, headers={"Origin": "https://evil.example.org", "Access-Control-Request-Method": "POST"}, timeout=5)
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert "Access-Control-Allow-Origin" not in response.headers

    response = requests.get(
        signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/status"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    rejections = response.json()["data"]["rejections"]
    assert [(rejection["reason"], rejection["count"], rejection["lastOrigin"]) for rejection in rejections] == [("origin_not_allowed", 1, "https://evil.example.org")]
