import time
import uuid
from collections.abc import Callable

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, create_rum_application, rum_event, rum_span, send_rum, wait_for_rum_query
from fixtures.types import FuseScopeCollector, Operation, SigNoz, TestContainerClickhouse


def test_android_app_start_session_timeline(
    signoz: SigNoz,
    fusescope_collector: FuseScopeCollector,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    app = create_rum_application(signoz, token, {"name": f"app-start-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "production", "allowedPackageNames": ["com.example.launch"]})
    session = uuid.uuid4().hex
    now = time.time_ns() - 60_000_000_000
    common = {"session.id": session}
    send_rum(
        fusescope_collector,
        app["key"]["key"],
        {"app.package.name": "com.example.launch", "service.version": "3.1.0", "deployment.environment.name": "production"},
        spans=[rum_span("view", now + 1_000_000_000, 2_000_000_000, common | {"fusescope.rum.view.route": "Home", "fusescope.rum.view.loading_type": "initial_load"})],
        events=[
            rum_event("rum.vital", now, common | {"fusescope.rum.vital.name": "app_start", "fusescope.rum.vital.value": 137.5, "fusescope.rum.vital.rating": "good", "browser.web_vital.name": "cls", "browser.web_vital.value": 0.25, "browser.web_vital.rating": "poor"}),
            rum_event("rum.vital", now + 2_000_000_000, common | {"fusescope.rum.view.route": "Home", "fusescope.rum.vital.name": "app_start", "fusescope.rum.vital.value": 2750.0, "fusescope.rum.vital.rating": "needs-improvement"}),
            rum_event("rum.vital", now + 2_100_000_000, common | {"fusescope.rum.vital.name": "unknown", "fusescope.rum.vital.value": 15.0}),
        ],
        origin=None,
    )
    params = {"start": now // 1_000_000 - 60_000, "end": now // 1_000_000 + 60_000}
    wait_for_rum_query(signoz, token, f"{RUM_APPLICATIONS}/{app['id']}/sessions", params, lambda data: any(item["sessionId"] == session and item["views"] == 1 for item in data["sessions"]))
    detail = wait_for_rum_query(signoz, token, f"{RUM_APPLICATIONS}/{app['id']}/sessions/{session}", params, lambda data: data["vitals"] == 2 and data["views"] == 1)
    assert detail["actions"] == 0
    assert detail["release"] == "3.1.0"
    assert detail["leadingEvents"][0]["vital"] == {"name": "app_start", "value": 137.5, "rating": "good"}
    assert detail["timeline"][0]["events"][0]["vital"] == {"name": "app_start", "value": 2750.0, "rating": "needs-improvement"}


def test_android_app_start_filters_before_timeline_limit(  # pylint: disable=too-many-locals
    signoz: SigNoz,
    fusescope_collector: FuseScopeCollector,
    clickhouse: TestContainerClickhouse,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    app = create_rum_application(signoz, token, {"name": f"vital-limit-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "production", "allowedPackageNames": ["com.example.launch"]})
    session = uuid.uuid4().hex
    now = time.time_ns() - 60_000_000_000
    common = {"session.id": session}
    resource = {"app.package.name": "com.example.launch", "service.version": "3.2.0"}
    # More unsupported vitals than the 5000-row timeline cap, all before the real events.
    for offset in range(0, 5005, 500):
        send_rum(
            fusescope_collector,
            app["key"]["key"],
            resource,
            events=[rum_event("rum.vital", now + index * 1_000_000, common | {"fusescope.rum.vital.name": "frozen_frames", "fusescope.rum.vital.value": 1.0}) for index in range(offset, min(offset + 500, 5005))],
            origin=None,
        )
    events = [
        rum_event("rum.vital", now + 6_000_000_000, common | {"fusescope.rum.vital.name": "app_start", "fusescope.rum.vital.rating": "good"}),
        rum_event("rum.vital", now + 7_000_000_000, common | {"fusescope.rum.vital.name": "app_start", "fusescope.rum.vital.value": 0.0}),
        rum_event("rum.vital", now + 8_000_000_000, common | {"fusescope.rum.vital.name": "APP_START", "fusescope.rum.vital.value": 2500.0}),
        rum_event("rum.vital", now + 9_000_000_000, common | {"fusescope.rum.vital.name": "app_start", "fusescope.rum.vital.value": 5000.0, "fusescope.rum.vital.rating": "typo"}),
        rum_event("rum.vital", now + 10_000_000_000, common | {"fusescope.rum.vital.name": "app_start", "fusescope.rum.vital.value": 1100.0, "fusescope.rum.vital.rating": "poor"}),
        rum_event("fusescope.rum.action", now + 11_000_000_000, common | {"app.screen.name": "Home", "fusescope.rum.action.name": "checkout", "fusescope.rum.action.type": "custom"}),
        rum_event("exception", now + 12_000_000_000, common | {"exception.type": "LaterError", "exception.message": "after noisy vitals", "fusescope.rum.error.source": "manual"}),
    ]
    send_rum(fusescope_collector, app["key"]["key"], resource, events=events, origin=None)

    deadline = time.monotonic() + 60
    count = 0
    while count < 5012 and time.monotonic() < deadline:
        count = clickhouse.conn.query("SELECT count() FROM signoz_logs.distributed_logs_v2 WHERE attributes_string['session.id'] = {session:String}", parameters={"session": session}).first_row[0]
        if count < 5012:
            time.sleep(0.5)
    assert count == 5012, "the unsupported and malformed vitals must really exist in storage to exercise the query cap"

    params = {"start": now // 1_000_000 - 60_000, "end": now // 1_000_000 + 60_000}
    detail = wait_for_rum_query(signoz, token, f"{RUM_APPLICATIONS}/{app['id']}/sessions/{session}", params, lambda data: data["errors"] == 1)
    timeline = detail["leadingEvents"] + [event for view in detail["timeline"] for event in view["events"]]
    assert detail["truncated"] is False
    assert (detail["vitals"], detail["actions"], detail["errors"]) == (4, 1, 1)
    assert [event["vital"] for event in timeline if event["kind"] == "vital"] == [
        {"name": "app_start", "value": 0.0, "rating": "good"},
        {"name": "app_start", "value": 2500.0, "rating": "needs-improvement"},
        {"name": "app_start", "value": 5000.0, "rating": "poor"},
        {"name": "app_start", "value": 1100.0, "rating": "poor"},
    ]
    assert any(event["kind"] == "action" and event["action"]["name"] == "checkout" for event in timeline)
    assert any(event["kind"] == "error" for event in timeline)
