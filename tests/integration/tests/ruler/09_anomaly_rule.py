import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest
from wiremock.client import HttpMethods, Mapping, MappingRequest, MappingResponse

from fixtures import types
from fixtures.alerts import verify_webhook_alert_expectation
from fixtures.metrics import Metrics
from fixtures.metrics_generators import generate_simple_gauge_series

# The ruler evaluates every 15 s; alertmanager's group delays and one resend fit in 90 s.
ALERT_WAIT_SECONDS = 90
# Wider than the evaluation window plus the ruler's delay, around each season's end.
SPAN = timedelta(minutes=40)
# Four seasons at these offsets from 100: median 100, scale 1.4826.
SEASON_OFFSETS = [-1.5, -0.5, 0.5, 1.5]


@pytest.mark.parametrize(
    "seasonality,period,spike,should_alert",
    [
        ("daily", timedelta(days=1), 400.0, True),
        ("daily", timedelta(days=1), None, False),
        ("hourly", timedelta(hours=1), 400.0, True),
    ],
    ids=["daily_spike_fires", "daily_steady_stays_quiet", "hourly_spike_fires"],
)
def test_anomaly_rule(
    notification_channel: types.TestContainerDocker,
    make_http_mocks: Callable[[types.TestContainerDocker, list[Mapping]], None],
    create_webhook_notification_channel: Callable[[str, str, dict, bool], str],
    create_alert_rule: Callable[[dict], str],
    insert_metrics: Callable[[list[Metrics]], None],
    seasonality: str,
    period: timedelta,
    spike: float | None,
    should_alert: bool,
):
    channel = str(uuid.uuid4())
    path = f"/alert/{channel}"
    make_http_mocks(
        notification_channel,
        [Mapping(request=MappingRequest(method=HttpMethods.POST, url=path), response=MappingResponse(status=200, json_body={}), persistent=False)],
    )
    create_webhook_notification_channel(
        channel_name=channel,
        webhook_url=notification_channel.container_configs["8080"].get(path),
        http_config={},
        send_resolved=False,
    )

    suffix = uuid.uuid4().hex[:8]
    metric_name = f"anomaly_requests_{suffix}"
    labels = {"service": "api"}
    now = datetime.now(tz=UTC).replace(second=0, microsecond=0)
    points = int(SPAN / timedelta(minutes=1)) + 1
    metrics: list[Metrics] = []
    for season, offset in enumerate(SEASON_OFFSETS, start=1):
        metrics += generate_simple_gauge_series(metric_name, labels, [100 + offset] * points, start_time=now - season * period - SPAN)
    current = [100.0] * points
    if spike is not None:
        # The last ten minutes, inside the evaluation window whatever the ruler's delay.
        current[-10:] = [spike] * 10
    metrics += generate_simple_gauge_series(metric_name, labels, current, start_time=now - SPAN)
    insert_metrics(metrics)

    name = f"anomaly_{suffix}"
    create_alert_rule(
        {
            "alert": name,
            "alertType": "METRIC_BASED_ALERT",
            "ruleType": "anomaly_rule",
            "version": "v5",
            "evalWindow": "10m0s",
            "frequency": "15s",
            "condition": {
                "compositeQuery": {
                    "queryType": "builder",
                    "panelType": "graph",
                    "queries": [
                        {
                            "type": "builder_query",
                            "spec": {
                                "name": "A",
                                "signal": "metrics",
                                "stepInterval": 60,
                                "aggregations": [{"metricName": metric_name, "timeAggregation": "avg", "spaceAggregation": "avg"}],
                                "groupBy": [{"name": "service", "fieldContext": "attribute", "fieldDataType": "string"}],
                                "functions": [{"name": "anomaly", "args": [{"name": "z_score_threshold", "value": 3}]}],
                            },
                        }
                    ],
                },
                "target": 3,
                "op": "1",
                "matchType": "1",
                "algorithm": "standard",
                "seasonality": seasonality,
                "selectedQueryName": "A",
            },
            "labels": {"severity": "warning"},
            "annotations": {"summary": "z-score {{$value}} above {{$threshold}}"},
            "preferredChannels": [channel],
        }
    )

    verify_webhook_alert_expectation(
        notification_channel,
        channel,
        types.AlertExpectation(
            should_alert=should_alert,
            wait_time_seconds=ALERT_WAIT_SECONDS,
            expected_alerts=[types.FiringAlert(labels={"alertname": name, "service": "api"})] if should_alert else [],
        ),
    )
