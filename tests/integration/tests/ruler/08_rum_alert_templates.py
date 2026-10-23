from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from http import HTTPStatus

import pytest
import requests

from fixtures import types
from fixtures.alerts import get_rule, labels_to_map, wait_for_firing_timeline_entry
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD

# The rules are the payloads the frontend RUM alert templates build
# (frontend/src/lib/rum/alertTemplates.ts), with a test channel and a 15s
# frequency so they fire within the wait.


@pytest.mark.parametrize(
    "scenario,label,firing,quiet",
    [
        pytest.param("rum_lcp_p75", "fusescope.rum.view.route", {"/product/:id"}, {"/cart", "/other-app"}, id="lcp_p75_per_route"),
        pytest.param("rum_session_error_rate", None, {None}, set(), id="session_error_rate"),
        pytest.param("rum_js_error_count", "service.version", {"1.8.0"}, {"1.7.4"}, id="js_error_count_per_release"),
    ],
)
def test_rum_alert_template_fires(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    signoz: types.SigNoz,
    create_alert_rule_with_channel: Callable[[str], str],
    insert_alert_data: Callable[[list[types.AlertData], datetime], None],
    get_token: Callable[[str, str], str],
    scenario: str,
    label: str | None,
    firing: set,
    quiet: set,
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    query_start_ms = int((datetime.now(tz=UTC) - timedelta(minutes=30)).timestamp() * 1000)

    insert_alert_data(
        [types.AlertData(type="logs", data_path=f"ruler/test_scenarios/{scenario}/alert_data.jsonl")],
        base_time=datetime.now(tz=UTC) - timedelta(minutes=5),
    )
    rule_id = create_alert_rule_with_channel(f"ruler/test_scenarios/{scenario}/rule.json")

    wait_for_firing_timeline_entry(signoz, token, rule_id, query_start_ms)

    assert get_rule(signoz, token, rule_id)["condition"]["compositeQuery"]["queries"][0]["spec"]["signal"] == "logs"

    response = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v2/rules/{rule_id}/history/timeline"),
        params={"start": query_start_ms, "end": int(datetime.now(tz=UTC).timestamp() * 1000) + 60_000, "limit": 50, "order": "desc"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    fired = {labels_to_map(item["labels"]).get(label) if label else None for item in response.json()["data"]["items"] or [] if item["state"] == "firing"}

    assert fired == firing
    assert not fired & quiet
