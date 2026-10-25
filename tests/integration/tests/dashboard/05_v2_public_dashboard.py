from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from uuid import uuid4

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.metrics import Metrics
from fixtures.types import Operation, SigNoz

V2_BASE_URL = "/api/v2/dashboards"
PANEL_KEY = "24e2697b"


def test_public_dashboard_v2(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
    insert_metrics: Callable[[list[Metrics]], None],
):
    admin_token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)

    # Insert metric data so the panel query resolves to a result.
    now = datetime.now(tz=UTC).replace(second=0, microsecond=0)
    insert_metrics(
        [
            Metrics(
                metric_name="system.cpu.time",
                labels={"service.name": "sampleapp"},
                timestamp=now - timedelta(minutes=minutes),
                value=value,
                temporality="Cumulative",
            )
            for minutes, value in ((5, 100.0), (3, 200.0), (1, 300.0))
        ]
    )

    # Create a v2 dashboard with one panel whose builder query carries a filter,
    # so we can assert the filter is redacted from the anonymous payload.
    create_response = requests.post(
        signoz.self.host_configs["8080"].get(V2_BASE_URL),
        json={
            "schemaVersion": "v6",
            "name": f"v2-public-sample-{uuid4().hex}",
            "tags": [{"key": "team", "value": "pulse"}],
            "spec": {
                "display": {"name": "Sample Dashboard", "description": "Used for integration tests"},
                "duration": "1h",
                "links": [],
                "variables": [
                    {"kind": "TextVariable", "spec": {"name": "published_service", "display": {"name": "Published service"}, "value": "sampleapp", "constant": True}},
                    {
                        "kind": "ListVariable",
                        "spec": {
                            "name": "host.name",
                            "display": {"name": "Host Name"},
                            "plugin": {
                                "kind": "signoz/QueryVariable",
                                "spec": {"queryValue": "SELECT JSONExtractString(labels, 'host.name') AS `host.name` FROM signoz_metrics.distributed_time_series_v4_1day WHERE metric_name = 'system.cpu.time' GROUP BY `host.name`"},
                            },
                        },
                    },
                ],
                "panels": {
                    PANEL_KEY: {
                        "kind": "Panel",
                        "spec": {
                            "display": {"name": "total"},
                            "links": [],
                            "plugin": {"kind": "signoz/TimeSeriesPanel", "spec": {"visualization": {"fillSpans": True}}},
                            "queries": [
                                {
                                    "kind": "time_series",
                                    "spec": {
                                        "plugin": {
                                            "kind": "signoz/BuilderQuery",
                                            "spec": {
                                                "name": "A",
                                                "signal": "metrics",
                                                "aggregations": [
                                                    {
                                                        "metricName": "system.cpu.time",
                                                        "reduceTo": "sum",
                                                        "spaceAggregation": "sum",
                                                        "timeAggregation": "rate",
                                                    }
                                                ],
                                                "filter": {"expression": "service.name = $published_service"},
                                                "groupBy": [{"name": "service.name", "fieldDataType": "string", "fieldContext": "tag"}],
                                            },
                                        }
                                    },
                                }
                            ],
                        },
                    }
                },
                "layouts": [
                    {
                        "kind": "Grid",
                        "spec": {
                            "items": [
                                {
                                    "x": 0,
                                    "y": 0,
                                    "width": 6,
                                    "height": 6,
                                    "content": {"$ref": f"#/spec/panels/{PANEL_KEY}"},
                                }
                            ]
                        },
                    }
                ],
            },
        },
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert create_response.status_code == HTTPStatus.CREATED, create_response.text
    dashboard_id = create_response.json()["data"]["id"]

    # Enable public sharing (the public-config endpoint is shape-agnostic, still v1).
    public_response = requests.post(
        signoz.self.host_configs["8080"].get(f"/api/v1/dashboards/{dashboard_id}/public"),
        json={"timeRangeEnabled": True, "defaultTimeRange": "10m"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert public_response.status_code == HTTPStatus.CREATED, public_response.text

    config_response = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v1/dashboards/{dashboard_id}/public"),
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert config_response.status_code == HTTPStatus.OK, config_response.text
    public_id = config_response.json()["data"]["publicPath"].split("/public/dashboard/")[-1]

    # ── anonymous public data (no Authorization header) ──────────────────────
    data_response = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}"),
        timeout=5,
    )
    assert data_response.status_code == HTTPStatus.OK, data_response.text
    body = data_response.json()
    assert body["status"] == "success"

    dashboard = body["data"]["dashboard"]
    assert dashboard["schemaVersion"] == "v6"
    assert dashboard["spec"]["display"]["name"] == "Sample Dashboard"
    assert {"key": "team", "value": "pulse"} in dashboard["tags"]

    # Identity/audit fields are not exposed to anonymous viewers.
    assert dashboard["createdBy"] == ""
    assert dashboard["updatedBy"] == ""

    # The public config is echoed back.
    assert body["data"]["publicDashboard"]["timeRangeEnabled"] is True

    # The builder query is redacted: the filter is gone, display fields remain.
    builder = dashboard["spec"]["panels"][PANEL_KEY]["spec"]["queries"][0]["spec"]["plugin"]["spec"]
    assert "filter" not in builder
    assert builder["name"] == "A"
    assert builder["signal"] == "metrics"
    assert builder["aggregations"][0]["metricName"] == "system.cpu.time"
    assert builder["groupBy"][0]["name"] == "service.name"

    # The query variable's query is redacted; its identity remains.
    variable = dashboard["spec"]["variables"][1]["spec"]
    assert variable["name"] == "host.name"
    assert variable["plugin"]["kind"] == "signoz/QueryVariable"
    assert variable["plugin"]["spec"]["queryValue"] == ""

    # ── anonymous panel query range ──────────────────────────────────────────
    start_time = int((now - timedelta(minutes=15)).timestamp() * 1000)
    end_time = int(now.timestamp() * 1000)

    query_response = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}/panels/{PANEL_KEY}/query_range"),
        params={"startTime": start_time, "endTime": end_time},
        timeout=10,
    )
    assert query_response.status_code == HTTPStatus.OK, query_response.text
    query_body = query_response.json()
    assert query_body["status"] == "success"

    # The inserted metric is returned as a time series for query "A".
    result = query_body["data"]
    assert result["type"] == "time_series"
    results = result["data"]["results"]
    result_a = next((r for r in results if r.get("queryName") == "A"), None)
    assert result_a is not None, results
    series = result_a["aggregations"][0]["series"]
    assert len(series) >= 1, result_a
    assert len(series[0]["values"]) >= 1, series[0]

    override = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}/panels/{PANEL_KEY}/query_range"),
        params={"startTime": start_time, "endTime": end_time, "variables": '{"published_service":{"type":"text","value":"other-service"}}'},
        timeout=10,
    )
    assert override.status_code == HTTPStatus.OK, override.text
    assert override.json()["data"]["data"]["results"] == result["data"]["results"]
    assert override.headers["Cache-Control"] == "no-store"

    # With timeRangeEnabled, the bounds are required.
    missing_range = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}/panels/{PANEL_KEY}/query_range"),
        timeout=5,
    )
    assert missing_range.status_code == HTTPStatus.BAD_REQUEST, missing_range.text

    # An unknown panel key is rejected.
    unknown_panel = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}/panels/does-not-exist/query_range"),
        params={"startTime": start_time, "endTime": end_time},
        timeout=5,
    )
    assert unknown_panel.status_code == HTTPStatus.BAD_REQUEST, unknown_panel.text

    # A bogus public id is rejected before any data is served.
    bogus = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/not-a-real-id/panels/{PANEL_KEY}/query_range"),
        params={"startTime": start_time, "endTime": end_time},
        timeout=5,
    )
    assert bogus.status_code >= HTTPStatus.BAD_REQUEST

    # The server enforces the author's fixed relative window, even with malformed client bounds.
    update = requests.put(
        signoz.self.host_configs["8080"].get(f"/api/v1/dashboards/{dashboard_id}/public"),
        json={"timeRangeEnabled": False, "defaultTimeRange": "10m"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert update.status_code == HTTPStatus.NO_CONTENT, update.text
    fixed = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}/panels/{PANEL_KEY}/query_range"),
        params={"startTime": "invalid", "endTime": "invalid"},
        timeout=10,
    )
    assert fixed.status_code == HTTPStatus.OK, fixed.text

    unpublish = requests.delete(
        signoz.self.host_configs["8080"].get(f"/api/v1/dashboards/{dashboard_id}/public"),
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert unpublish.status_code == HTTPStatus.NO_CONTENT, unpublish.text
    revoked = requests.get(signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}"), timeout=5)
    assert revoked.status_code == HTTPStatus.NOT_FOUND, revoked.text
    republish = requests.post(
        signoz.self.host_configs["8080"].get(f"/api/v1/dashboards/{dashboard_id}/public"),
        json={"timeRangeEnabled": True, "defaultTimeRange": "10m"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert republish.status_code == HTTPStatus.CREATED, republish.text
    new_public_id = republish.json()["data"]["id"]
    assert new_public_id != public_id
    revoked = requests.get(signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}"), timeout=5)
    assert revoked.status_code == HTTPStatus.NOT_FOUND, revoked.text
    public_id = new_public_id

    # ── deleting the dashboard removes public access ─────────────────────────
    # DeleteV2 drops the public-config row in the same transaction, so the public
    # id no longer resolves to a dashboard.
    delete_response = requests.delete(
        signoz.self.host_configs["8080"].get(f"{V2_BASE_URL}/{dashboard_id}"),
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=5,
    )
    assert delete_response.status_code == HTTPStatus.NO_CONTENT, delete_response.text

    deleted_data = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}"),
        timeout=5,
    )
    assert deleted_data.status_code == HTTPStatus.NOT_FOUND, deleted_data.text

    deleted_query = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/public/dashboards/{public_id}/panels/{PANEL_KEY}/query_range"),
        params={"startTime": start_time, "endTime": end_time},
        timeout=5,
    )
    assert deleted_query.status_code == HTTPStatus.NOT_FOUND, deleted_query.text
