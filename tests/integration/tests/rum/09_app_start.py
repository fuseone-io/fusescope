import time
import uuid
from collections.abc import Callable

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, create_rum_application, rum_event, rum_span, send_rum, wait_for_rum_query
from fixtures.types import FuseScopeCollector, Operation, SigNoz


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
