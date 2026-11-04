import gzip
import json
import time
import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures import types

RUM_APPLICATIONS = "/api/v1/rum/applications"
RUM_KEY_HEADER = "FuseScope-RUM-Key"
SIGNOZ_API_KEY_HEADER = "SigNoz-Api-Key"


def create_rum_application(signoz: types.SigNoz, token: str, payload: dict) -> dict:
    response = requests.post(
        signoz.self.host_configs["8080"].get(RUM_APPLICATIONS),
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    assert response.status_code == HTTPStatus.CREATED, response.text
    return response.json()["data"]


RUM_ORIGIN = "https://shop.example.com"


def otlp_attributes(attributes: dict) -> list[dict]:
    values = []
    for key, value in attributes.items():
        if isinstance(value, bool):
            values.append({"key": key, "value": {"boolValue": value}})
        elif isinstance(value, int):
            values.append({"key": key, "value": {"intValue": str(value)}})
        elif isinstance(value, float):
            values.append({"key": key, "value": {"doubleValue": value}})
        else:
            values.append({"key": key, "value": {"stringValue": value}})
    return values


def rum_span(name: str, start_ns: int, duration_ns: int, attributes: dict, kind: int = 1, trace_id: str | None = None, status_error: bool = False) -> dict:
    span = {
        "traceId": trace_id or uuid.uuid4().hex,
        "spanId": uuid.uuid4().hex[:16],
        "name": name,
        "kind": kind,
        "startTimeUnixNano": str(start_ns),
        "endTimeUnixNano": str(start_ns + duration_ns),
        "attributes": otlp_attributes(attributes),
    }
    if status_error:
        span["status"] = {"code": 2}
    return span


def rum_event(event_name: str, time_ns: int, attributes: dict) -> dict:
    return {"timeUnixNano": str(time_ns), "eventName": event_name, "severityNumber": 17 if event_name == "exception" else 9, "attributes": otlp_attributes(attributes)}


POLICY_WAIT_SECONDS = 30
REPORT_WAIT_SECONDS = 150
NOT_YET_IN_POLICY = (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN, HTTPStatus.SERVICE_UNAVAILABLE)


def post_rum(collector: types.FuseScopeCollector, signal: str, data: bytes | str, headers: dict) -> requests.Response:
    return requests.post(collector.self.host_configs["4319"].get(f"/rum/v1/{signal}"), data=data, headers=headers, verify=collector.ca_cert_path, timeout=10)


def post_rum_until(collector: types.FuseScopeCollector, signal: str, data: bytes | str, headers: dict, expected: HTTPStatus) -> requests.Response:
    """Posts until the collector answers expected: the policy reaches it some
    time after an application or key changes."""
    response = post_rum(collector, signal, data, headers)
    deadline = time.monotonic() + POLICY_WAIT_SECONDS
    while response.status_code != expected and time.monotonic() < deadline:
        time.sleep(0.5)
        response = post_rum(collector, signal, data, headers)
    assert response.status_code == expected, f"{response.status_code}: {response.text}"
    return response


def send_rum(collector: types.FuseScopeCollector, key: str, resource: dict, spans: list[dict] | None = None, events: list[dict] | None = None, origin: str | None = RUM_ORIGIN) -> None:
    """Posts spans and log events to the collector as the browser SDK does; with
    origin None, as a native app does. Refusals a policy not yet received
    explains (401, 403, 503) are retried."""
    headers = {RUM_KEY_HEADER: key, "Content-Type": "application/json"}
    if origin is not None:
        headers["Origin"] = origin
    bodies = []
    if spans:
        bodies.append(("traces", {"resourceSpans": [{"resource": {"attributes": otlp_attributes(resource)}, "scopeSpans": [{"spans": spans}]}]}))
    if events:
        bodies.append(("logs", {"resourceLogs": [{"resource": {"attributes": otlp_attributes(resource)}, "scopeLogs": [{"logRecords": events}]}]}))
    for signal, body in bodies:
        data = json.dumps(body)
        response = post_rum(collector, signal, data, headers)
        deadline = time.monotonic() + POLICY_WAIT_SECONDS
        while response.status_code in NOT_YET_IN_POLICY and time.monotonic() < deadline:
            time.sleep(0.5)
            response = post_rum(collector, signal, data, headers)
        assert response.status_code == HTTPStatus.OK, response.text


def wait_for_rum_status(signoz: types.SigNoz, token: str, application_id: str, ready: Callable[[dict], bool]) -> dict:
    """Polls an application's setup status until ready accepts it: it is built
    from the collector's reports, sent once a minute."""
    return wait_for_rum_query(signoz, token, f"{RUM_APPLICATIONS}/{application_id}/status", {}, ready, attempts=REPORT_WAIT_SECONDS)


def send_backend_span(otel_collector: types.TestContainerDocker, service: str, trace_id: str, start_ns: int) -> None:
    """Posts a server span straight to the collector, as an instrumented backend would."""
    body = {
        "resourceSpans": [
            {
                "resource": {"attributes": otlp_attributes({"service.name": service})},
                "scopeSpans": [{"spans": [rum_span("GET /api/products/:id", start_ns, 50_000_000, {"http.route": "/api/products/:id"}, kind=2, trace_id=trace_id)]}],
            }
        ]
    }
    response = requests.post(otel_collector.host_configs["4318"].get("/v1/traces"), json=body, timeout=10)
    assert response.status_code == HTTPStatus.OK, response.text


def wait_for_rum_query(signoz: types.SigNoz, token: str, path: str, params: dict, ready: Callable[[dict], bool], attempts: int = 30) -> dict:
    """Polls a RUM query endpoint until ready accepts its data, since ingestion is asynchronous."""
    data: dict = {}
    for _ in range(attempts):
        response = requests.get(signoz.self.host_configs["8080"].get(path), params=params, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert response.status_code == HTTPStatus.OK, response.text
        data = response.json()["data"]
        if ready(data):
            return data
        time.sleep(1)
    raise AssertionError(f"{path} never became ready: {data}")


def upload_source_maps(signoz: types.SigNoz, application_id: str, release: str, headers: dict, maps: dict[str, bytes], debug_ids: dict | None = None) -> requests.Response:
    """Uploads as @fusescope/cli does: one part per map, named by its URL path."""
    files = [(path, (path.rsplit("/", 1)[-1], content, "application/json")) for path, content in maps.items()]
    data = {"debug_ids": json.dumps(debug_ids)} if debug_ids else None
    return requests.post(signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{application_id}/sourcemaps"), params={"release": release}, files=files, data=data, headers=headers, timeout=30)


def upload_r8_mapping(signoz: types.SigNoz, application_id: str, release: str, headers: dict, mapping: bytes, compress: bool = False) -> requests.Response:
    """Uploads as the FuseScope Gradle plugin does: the mapping as the raw body, gzip optional."""
    body, upload_headers = mapping, {**headers, "Content-Type": "text/plain"}
    if compress:
        body, upload_headers["Content-Encoding"] = gzip.compress(mapping), "gzip"
    return requests.post(signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{application_id}/mappings"), params={"release": release}, data=body, headers=upload_headers, timeout=30)


def padded_source_map(size: int) -> bytes:
    """A valid source map of about size bytes, padded through sourcesContent."""
    content = "x" * max(size - 100, 0)
    return json.dumps({"version": 3, "sources": ["a.ts"], "sourcesContent": [content], "names": [], "mappings": "AAAA"}).encode()
