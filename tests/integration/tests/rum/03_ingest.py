import gzip
import json
import time
import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, RUM_KEY_HEADER, create_rum_application, post_rum, post_rum_until, wait_for_rum_status
from fixtures.types import FuseScopeCollector, Operation, SigNoz

ORIGIN = "https://shop.example.com"
EMPTY_TRACES = '{"resourceSpans":[]}'


def test_ingest_scrubs_and_stamps_telemetry(
    signoz: SigNoz,
    fusescope_collector: FuseScopeCollector,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(
        signoz,
        token,
        {"name": f"e2e-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [ORIGIN], "piiPolicy": {"queryAllowlist": ["page"]}},
    )
    key_headers = {RUM_KEY_HEADER: created["key"]["key"], "Content-Type": "application/json", "Origin": ORIGIN}
    post_rum_until(fusescope_collector, "traces", EMPTY_TRACES, key_headers, HTTPStatus.OK)
    session_id = f"session-{uuid.uuid4().hex}"
    now = time.time_ns()

    response = requests.options(
        fusescope_collector.self.host_configs["4319"].get("/rum/v1/traces"),
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type, fusescope-rum-key"},
        verify=fusescope_collector.ca_cert_path,
        timeout=5,
    )
    assert response.status_code == HTTPStatus.NO_CONTENT
    assert response.headers["Access-Control-Allow-Origin"] == ORIGIN
    assert "fusescope-rum-key" in response.headers["Access-Control-Allow-Headers"]
    assert response.headers["Access-Control-Allow-Methods"] == "POST"

    traces = {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [
                        {"key": "fusescope.rum.application.id", "value": {"stringValue": "forged"}},
                        {"key": "telemetry.sdk.name", "value": {"stringValue": "@fusescope/browser"}},
                        {"key": "telemetry.sdk.version", "value": {"stringValue": "0.2.0"}},
                    ]
                },
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
    response = post_rum(fusescope_collector, "traces", json.dumps(traces), key_headers)
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
    response = post_rum(fusescope_collector, "logs", gzip.compress(json.dumps(logs).encode()), {**key_headers, "Content-Encoding": "gzip"})
    assert response.status_code == HTTPStatus.OK, response.text

    span_rows, log_rows = [], []
    for _ in range(30):
        span_rows = signoz.telemetrystore.conn.query(
            "SELECT name, attributes_string['url.full'], resources_string['fusescope.rum.application.id'], resources_string['fusescope.rum.platform'], resources_string['fusescope.ingest.key_id'] FROM signoz_traces.distributed_signoz_index_v3 WHERE attributes_string['session.id'] = {session:String}",
            parameters={"session": session_id},
        ).result_rows
        log_rows = signoz.telemetrystore.conn.query(
            "SELECT attributes_string['event.name'], attributes_string['fusescope.rum.error.source'], resources_string['fusescope.rum.application.id'] FROM signoz_logs.distributed_logs_v2 WHERE attributes_string['session.id'] = {session:String}",
            parameters={"session": session_id},
        ).result_rows
        if span_rows and log_rows:
            break
        time.sleep(1)

    assert span_rows == [("Navigation: /customers/392", "https://shop.example.com/search?page=2", created["id"], "web", created["key"]["id"])]
    assert log_rows == [("exception", "onerror", created["id"])]

    status = wait_for_rum_status(signoz, token, created["id"], lambda data: data["firstSeenAt"] is not None and data["counts"]["sessions"] == 1 and data["counts"]["errors"] == 1)
    assert (status["sdk"]["name"], status["sdk"]["version"]) == ("@fusescope/browser", "0.2.0")
    assert status["supportedSdks"][0]["name"] == "@fusescope/browser"


def test_ingest_refuses_unknown_key_and_disallowed_origin(
    signoz: SigNoz,
    fusescope_collector: FuseScopeCollector,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"reject-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [ORIGIN]})
    key = created["key"]["key"]
    post_rum_until(fusescope_collector, "traces", EMPTY_TRACES, {RUM_KEY_HEADER: key, "Content-Type": "application/json", "Origin": ORIGIN}, HTTPStatus.OK)

    response = post_rum(fusescope_collector, "traces", EMPTY_TRACES, {"Content-Type": "application/json", "Origin": ORIGIN})
    assert response.status_code == HTTPStatus.UNAUTHORIZED

    response = post_rum(fusescope_collector, "traces", EMPTY_TRACES, {RUM_KEY_HEADER: "rum_pub_doesnotexistdoesnotexist12", "Content-Type": "application/json", "Origin": ORIGIN})
    assert response.status_code == HTTPStatus.UNAUTHORIZED

    response = post_rum(fusescope_collector, "traces", EMPTY_TRACES, {RUM_KEY_HEADER: key, "Content-Type": "application/json", "Origin": "https://evil.example.org"})
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert "Access-Control-Allow-Origin" not in response.headers

    response = requests.options(
        fusescope_collector.self.host_configs["4319"].get("/rum/v1/traces"),
        headers={"Origin": "https://evil.example.org", "Access-Control-Request-Method": "POST"},
        verify=fusescope_collector.ca_cert_path,
        timeout=5,
    )
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert "Access-Control-Allow-Origin" not in response.headers

    status = wait_for_rum_status(signoz, token, created["id"], lambda data: len(data["rejections"]) > 0)
    assert [(rejection["reason"], rejection["count"], rejection["lastOrigin"]) for rejection in status["rejections"]] == [("origin_not_allowed", 1, "https://evil.example.org")]


def test_application_changes_reach_the_collector(
    signoz: SigNoz,
    fusescope_collector: FuseScopeCollector,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"changes-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [ORIGIN]})
    staging = "https://staging.example.com"
    headers = {RUM_KEY_HEADER: created["key"]["key"], "Content-Type": "application/json"}
    post_rum_until(fusescope_collector, "traces", EMPTY_TRACES, {**headers, "Origin": ORIGIN}, HTTPStatus.OK)
    assert post_rum(fusescope_collector, "traces", EMPTY_TRACES, {**headers, "Origin": staging}).status_code == HTTPStatus.FORBIDDEN

    response = requests.put(
        signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}"),
        json={"name": created["name"], "environment": "production", "allowedOrigins": [ORIGIN, staging]},
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    post_rum_until(fusescope_collector, "traces", EMPTY_TRACES, {**headers, "Origin": staging}, HTTPStatus.OK)

    response = requests.delete(signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}"), headers={"Authorization": f"Bearer {token}"}, timeout=5)
    assert response.status_code == HTTPStatus.NO_CONTENT, response.text
    post_rum_until(fusescope_collector, "traces", EMPTY_TRACES, {**headers, "Origin": ORIGIN}, HTTPStatus.UNAUTHORIZED)
