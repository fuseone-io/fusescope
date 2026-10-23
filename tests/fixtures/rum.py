import time
import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures import types

RUM_APPLICATIONS = "/api/v1/rum/applications"
RUM_KEY_HEADER = "FuseScope-RUM-Key"


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


def send_rum(signoz: types.SigNoz, key: str, resource: dict, spans: list[dict] | None = None, events: list[dict] | None = None) -> None:
    """Posts spans and log events through the RUM gateway, as the browser SDK does."""
    headers = {RUM_KEY_HEADER: key, "Content-Type": "application/json", "Origin": RUM_ORIGIN}
    if spans:
        body = {"resourceSpans": [{"resource": {"attributes": otlp_attributes(resource)}, "scopeSpans": [{"spans": spans}]}]}
        response = requests.post(signoz.self.host_configs["8080"].get("/rum/v1/traces"), json=body, headers=headers, timeout=10)
        assert response.status_code == HTTPStatus.OK, response.text
    if events:
        body = {"resourceLogs": [{"resource": {"attributes": otlp_attributes(resource)}, "scopeLogs": [{"logRecords": events}]}]}
        response = requests.post(signoz.self.host_configs["8080"].get("/rum/v1/logs"), json=body, headers=headers, timeout=10)
        assert response.status_code == HTTPStatus.OK, response.text


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
