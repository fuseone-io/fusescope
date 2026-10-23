import time
import uuid
from http import HTTPStatus

import requests

from fixtures import types
from fixtures.rum import otlp_attributes

ONBOARDING_STATUS = "/api/v1/onboarding/status"
ONBOARDING_INGESTION = "/api/v1/onboarding/ingestion"


def get_ingestion(signoz: types.SigNoz, token: str) -> requests.Response:
    return requests.get(signoz.self.host_configs["8080"].get(ONBOARDING_INGESTION), headers={"Authorization": f"Bearer {token}"}, timeout=10)


def update_ingestion(signoz: types.SigNoz, token: str, ingestion_url: str) -> requests.Response:
    return requests.put(
        signoz.self.host_configs["8080"].get(ONBOARDING_INGESTION),
        json={"ingestionUrl": ingestion_url},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )


def get_onboarding_status(signoz: types.SigNoz, token: str, params: dict) -> requests.Response:
    return requests.get(signoz.self.host_configs["8080"].get(ONBOARDING_STATUS), params=params, headers={"Authorization": f"Bearer {token}"}, timeout=10)


def send_otlp_telemetry(otel_collector: types.TestContainerDocker, service: str, time_ns: int) -> None:
    """Posts one span, one gauge point and one log record for service to the collector, as an instrumented app would."""
    resource = {"attributes": otlp_attributes({"service.name": service, "telemetry.sdk.language": "python"})}
    bodies = {
        "/v1/traces": {
            "resourceSpans": [
                {
                    "resource": resource,
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "traceId": uuid.uuid4().hex,
                                    "spanId": uuid.uuid4().hex[:16],
                                    "name": "GET /checkout",
                                    "kind": 2,
                                    "startTimeUnixNano": str(time_ns),
                                    "endTimeUnixNano": str(time_ns + 5_000_000),
                                }
                            ]
                        }
                    ],
                }
            ]
        },
        "/v1/metrics": {
            "resourceMetrics": [
                {
                    "resource": resource,
                    "scopeMetrics": [{"metrics": [{"name": "onboarding_checkout_requests", "gauge": {"dataPoints": [{"asDouble": 1, "timeUnixNano": str(time_ns)}]}}]}],
                }
            ]
        },
        "/v1/logs": {
            "resourceLogs": [
                {
                    "resource": resource,
                    "scopeLogs": [{"logRecords": [{"timeUnixNano": str(time_ns), "severityNumber": 9, "body": {"stringValue": "checkout started"}}]}],
                }
            ]
        },
    }
    for path, body in bodies.items():
        response = requests.post(otel_collector.host_configs["4318"].get(path), json=body, timeout=10)
        assert response.status_code == HTTPStatus.OK, response.text


def wait_for_onboarding_status(signoz: types.SigNoz, token: str, params: dict, attempts: int = 60) -> dict:
    """Polls the status until every requested signal is received, since ingestion is asynchronous."""
    data: dict = {}
    for _ in range(attempts):
        response = get_onboarding_status(signoz, token, params)
        assert response.status_code == HTTPStatus.OK, response.text
        data = response.json()["data"]
        if all(data[signal]["received"] for signal in params["signals"].split(",")):
            return data
        time.sleep(1)
    raise AssertionError(f"onboarding status never received every signal: {data}")
