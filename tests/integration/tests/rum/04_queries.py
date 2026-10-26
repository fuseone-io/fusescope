import time
import urllib.parse
import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, RUM_ORIGIN, create_rum_application, rum_event, rum_span, send_backend_span, send_rum, wait_for_rum_query
from fixtures.types import Operation, SigNoz, TestContainerDocker

CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"


def test_views_query(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"views-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [RUM_ORIGIN]})
    base = f"{RUM_APPLICATIONS}/{created['id']}"
    session = f"views-{uuid.uuid4().hex}"
    odd_route = "/we'ird`\\$0"
    t0 = time.time_ns() - 600 * 1_000_000_000
    second = 1_000_000_000

    def view(route: str, path: str, loading: str, start: int, duration: int, navigation: str = "push") -> dict:
        return rum_span("view", t0 + start * second, duration * second, {"session.id": session, "fusescope.rum.view.route": route, "url.path": path, "fusescope.rum.view.loading_type": loading, "fusescope.rum.view.navigation_type": navigation})

    def request(url: str, start: int, duration_ms: int) -> dict:
        return rum_span("GET", t0 + start * second, duration_ms * 1_000_000, {"session.id": session, "fusescope.rum.view.route": "/product/:id", "url.full": url, "http.request.method": "GET", "http.response.status_code": 200}, kind=3)

    def vital(name: str, value: float, rating: str) -> dict:
        return rum_event("browser.web_vital", t0 + 2 * second, {"session.id": session, "fusescope.rum.view.route": "/product/:id", "browser.web_vital.name": name, "browser.web_vital.value": value, "browser.web_vital.rating": rating})

    send_rum(
        signoz,
        created["key"]["key"],
        {"service.name": "shop", "service.version": "1.8.0", "deployment.environment.name": "production", "user_agent.original": CHROME},
        spans=[
            view("/product/:id", "/product/88213", "initial_load", 0, 2),
            view("/product/:id", "/product/90417", "route_change", 3, 4),
            view("/product/:id", "/product/90417", "route_change", 8, 1, navigation="restore"),
            view("/cart", "/cart", "route_change", 10, 5),
            view(odd_route, "/odd", "route_change", 16, 1),
            request("https://shop.example.com/api/products/88213", 1, 1200),
            request("https://shop.example.com/api/products/90417?ref=x", 4, 800),
            request("https://cdn.example.com/img/hero", 4, 100),
        ],
        events=[
            vital("lcp", 3420.0, "needs-improvement"),
            vital("lcp", 1800.0, "good"),
            vital("inp", 210.0, "needs-improvement"),
            vital("cls", 0.08, "good"),
            rum_event("exception", t0 + 5 * second, {"session.id": session, "fusescope.rum.view.route": "/product/:id", "exception.type": "TypeError", "exception.message": "x is undefined", "exception.stacktrace": "TypeError: x\n    at f (https://shop.example.com/main.js:1:1)"}),
        ],
    )

    params = {"start": t0 // 1_000_000 - 60_000, "end": t0 // 1_000_000 + 60_000}
    views = wait_for_rum_query(signoz, token, f"{base}/views", params, lambda data: len(data["routes"]) == 3 and all(route["lcp"] for route in data["routes"] if route["route"] == "/product/:id") and any(route["errors"] for route in data["routes"]))
    routes = {route["route"]: route for route in views["routes"]}
    assert set(routes) == {"/product/:id", "/cart", odd_route}

    product = routes["/product/:id"]
    assert (product["views"], product["pageLoads"], product["routeChanges"], product["unknownLoads"]) == (3, 1, 1, 0)
    assert product["errors"] == 1
    assert product["lcp"]["samples"] == 2
    assert (product["lcp"]["good"], product["lcp"]["needsImprovement"], product["lcp"]["poor"]) == (1, 1, 0)
    assert product["inp"]["samples"] == 1
    assert product["slowestRequest"]["host"] == "shop.example.com"
    assert product["slowestRequest"]["path"] == "/api/products/:id"
    assert product["slowestRequest"]["calls"] == 2
    assert routes["/cart"]["lcp"] is None

    detail = wait_for_rum_query(signoz, token, f"{base}/views/{urllib.parse.quote(product['route'], safe='')}", params, lambda data: data["views"] == 3)
    assert [vitals["name"] for vitals in detail["vitals"]] == ["lcp", "inp", "cls"]
    assert {line["name"] for line in detail["series"]["vitals"]} == {"lcp", "inp", "cls"}
    assert detail["errors"] == 1
    assert set(detail["examplePaths"]) == {"/product/88213", "/product/90417"}
    assert [release["release"] for release in detail["releases"]] == ["1.8.0"]
    assert [(template["path"], template["calls"]) for template in detail["slowRequests"]] == [("/api/products/:id", 2), ("/img/hero", 1)]
    assert detail["slowRequests"][0]["exampleTraceId"] != ""
    assert detail["browsers"][0]["name"] == "Chrome 130"
    assert detail["browsers"][0]["pageLoads"] == 1
    assert detail["operatingSystems"][0]["name"] == "Windows 10"
    assert [recent["sessionId"] for recent in detail["recentSessions"]] == [session]
    assert detail["recentSessions"][0]["loadingType"] == "initial_load"
    assert detail["recentSessions"][0]["errors"] == 1

    odd = wait_for_rum_query(signoz, token, f"{base}/views/{urllib.parse.quote(odd_route, safe='')}", params, lambda data: data["views"] == 1)
    assert odd["route"] == odd_route


def test_errors_query(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"errors-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [RUM_ORIGIN]})
    base = f"{RUM_APPLICATIONS}/{created['id']}"
    key = created["key"]["key"]
    old_session, session = f"old-{uuid.uuid4().hex}", f"new-{uuid.uuid4().hex}"
    second = 1_000_000_000
    t0 = time.time_ns() - 600 * second

    def order_error(session_id: str, at: int, order: str, bundle: str) -> dict:
        return rum_event(
            "exception",
            at,
            {
                "session.id": session_id,
                "fusescope.rum.view.route": "/account/orders",
                "exception.type": "NotFoundError",
                "exception.message": f"Order {order} not found",
                "exception.stacktrace": f"NotFoundError: Order {order} not found\n    at loadOrder (https://shop.example.com/assets/{bundle}:1:100)",
                "fusescope.rum.error.source": "onerror",
            },
        )

    send_rum(signoz, key, {"service.name": "shop", "service.version": "1.7.4", "user_agent.original": CHROME}, events=[order_error(old_session, t0 - 120 * second, "0d2e71c4-9f3a-4b8e-9d1c-6a2f7b80a4c9", "main.4f9c2a.js")])
    send_rum(
        signoz,
        key,
        {"service.name": "shop", "service.version": "1.8.0", "user_agent.original": CHROME},
        spans=[
            rum_span("view", t0 - 30 * second, 40 * second, {"session.id": session, "fusescope.rum.view.route": "/cart", "url.path": "/cart", "fusescope.rum.view.loading_type": "route_change"}),
            rum_span("POST", t0 - second, 300_000_000, {"session.id": session, "fusescope.rum.view.route": "/cart", "url.full": "https://shop.example.com/api/cart", "http.request.method": "POST", "http.response.status_code": 502}, kind=3, status_error=True),
        ],
        events=[
            order_error(session, t0 - 60 * second, "5a77d2c9-e8f1-4b6a-9c3d-7e0f1b25b3c8", "main.71be04.js"),
            rum_event("browser.user_action.click", t0 - 2 * second, {"session.id": session, "fusescope.rum.view.route": "/cart", "fusescope.rum.action.type": "click", "fusescope.rum.action.target": "button.qty-increase"}),
            rum_event(
                "exception",
                t0,
                {
                    "session.id": session,
                    "fusescope.rum.view.route": "/cart",
                    "exception.type": "HttpError",
                    "exception.message": "POST /api/cart returned 502",
                    "exception.stacktrace": "HttpError: POST /api/cart returned 502\n    at updateQuantity (https://shop.example.com/assets/cart.9b1e07.js:1:3381)",
                    "fusescope.rum.error.source": "unhandledrejection",
                },
            ),
        ],
    )

    params = {"start": t0 // 1_000_000 - 300_000, "end": t0 // 1_000_000 + 60_000}
    listed = wait_for_rum_query(signoz, token, f"{base}/errors", params, lambda data: data["events"] == 3)
    assert listed["total"] == 2
    groups = {group["type"]: group for group in listed["groups"]}

    orders = groups["NotFoundError"]
    assert orders["events"] == 2
    assert orders["sessions"] == 2
    assert orders["normalizedMessage"] == "Order <id> not found"
    assert orders["firstSeenRelease"] == "1.7.4"
    assert orders["lastSeenRelease"] == "1.8.0"
    assert orders["releases"] == ["1.7.4", "1.8.0"]
    assert orders["newInRelease"] is False
    assert sum(orders["sparkline"]["counts"]) == 2

    http_error = groups["HttpError"]
    assert http_error["newInRelease"] is True
    assert http_error["topFrame"]["function"] == "updateQuantity"
    assert http_error["source"] == "unhandledrejection"

    filtered = wait_for_rum_query(signoz, token, f"{base}/errors", {**params, "release": "1.8.0"}, lambda data: data["events"] == 2)
    filtered_orders = next(group for group in filtered["groups"] if group["type"] == "NotFoundError")
    assert filtered_orders["events"] == 1
    assert filtered_orders["firstSeenRelease"] == "1.7.4"

    detail = wait_for_rum_query(signoz, token, f"{base}/errors/{http_error['fingerprint']}", params, lambda data: data["linkedRequest"] is not None)
    assert detail["linkedRequest"]["request"]["statusCode"] == 502
    assert detail["linkedRequest"]["request"]["path"] == "/api/cart"
    assert detail["linkedRequest"]["request"]["traceId"] != ""
    assert [crumb["kind"] for crumb in detail["breadcrumbs"]] == ["view", "click", "request"]
    assert detail["breadcrumbs"][1]["action"]["target"] == "button.qty-increase"
    event = detail["latestEvents"][0]
    assert event["sessionId"] == session
    assert event["symbolicated"] is False
    assert event["frames"][0]["file"] == "https://shop.example.com/assets/cart.9b1e07.js"
    assert detail["selectedEventId"] == event["id"]
    assert [(affected["sessionId"], affected["views"], affected["release"]) for affected in detail["affectedSessions"]] == [(session, 1, "1.8.0")]

    response = requests.get(signoz.self.host_configs["8080"].get(f"{base}/errors/0000000000000000"), params=params, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert response.status_code == HTTPStatus.NOT_FOUND


def test_sessions_query(  # pylint: disable=too-many-locals
    signoz: SigNoz,
    otel_collector: TestContainerDocker,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"sessions-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [RUM_ORIGIN]})
    base = f"{RUM_APPLICATIONS}/{created['id']}"
    key = created["key"]["key"]
    busy, quiet = f"busy-{uuid.uuid4().hex}", f"quiet-{uuid.uuid4().hex}"
    second = 1_000_000_000
    t0 = time.time_ns() - 600 * second
    backend_trace = uuid.uuid4().hex
    user = "9f2c" + uuid.uuid4().hex

    common = {"session.id": busy, "session.previous_id": "previous-session", "user.id": user}
    send_rum(
        signoz,
        key,
        {"service.name": "shop", "service.version": "1.8.0", "deployment.environment.name": "production", "user_agent.original": FIREFOX},
        spans=[
            rum_span("view", t0, 30 * second, {**common, "fusescope.rum.view.route": "/", "url.path": "/", "fusescope.rum.view.loading_type": "initial_load"}),
            rum_span("view", t0 + 30 * second, 90 * second, {**common, "fusescope.rum.view.route": "/product/:id", "url.path": "/product/7", "fusescope.rum.view.loading_type": "route_change"}),
            rum_span("GET", t0 + 31 * second, 200_000_000, {**common, "fusescope.rum.view.route": "/product/:id", "url.full": "https://shop.example.com/api/products/7", "http.request.method": "GET", "http.response.status_code": 200}, kind=3, trace_id=backend_trace),
        ],
        events=[
            rum_event("browser.web_vital", t0 + 2 * second, {**common, "fusescope.rum.view.route": "/", "browser.web_vital.name": "lcp", "browser.web_vital.value": 1200.0, "browser.web_vital.rating": "good"}),
            rum_event("browser.user_action.click", t0 + 29 * second, {**common, "fusescope.rum.view.route": "/", "fusescope.rum.action.type": "click", "fusescope.rum.action.target": "a.product-card"}),
            rum_event("fusescope.rum.action", t0 + 60 * second, {**common, "fusescope.rum.view.route": "/product/:id", "fusescope.rum.action.type": "custom", "fusescope.rum.action.name": "add_to_cart"}),
            rum_event("exception", t0 + 70 * second, {**common, "fusescope.rum.view.route": "/product/:id", "exception.type": "TypeError", "exception.message": "boom", "exception.stacktrace": "TypeError: boom\n    at f (https://shop.example.com/main.js:1:1)"}),
        ],
    )
    send_rum(
        signoz,
        key,
        {"service.name": "shop", "service.version": "1.7.4", "deployment.environment.name": "production", "user_agent.original": CHROME},
        spans=[rum_span("view", t0 + 5 * second, 3 * second, {"session.id": quiet, "fusescope.rum.view.route": "/", "url.path": "/", "fusescope.rum.view.loading_type": "initial_load"})],
    )
    send_backend_span(otel_collector, "catalog", backend_trace, t0 + 31 * second + 10_000_000)

    params = {"start": t0 // 1_000_000 - 60_000, "end": t0 // 1_000_000 + 300_000}
    listed = wait_for_rum_query(signoz, token, f"{base}/sessions", params, lambda data: data["total"] == 2 and all(s["errors"] for s in data["sessions"] if s["sessionId"] == busy))
    assert [s["sessionId"] for s in listed["sessions"]] == [quiet, busy]
    summary = listed["sessions"][1]
    assert summary["previousSessionId"] == "previous-session"
    assert summary["userId"] == user
    assert (summary["views"], summary["actions"], summary["errors"]) == (2, 2, 1)
    assert summary["durationMs"] == 120_000
    assert summary["client"] == {"browser": "Firefox", "browserVersion": "131", "device": "", "os": "Linux", "osVersion": ""}
    assert summary["release"] == "1.8.0"
    assert summary["environment"] == "production"

    for filters, expected in [
        ({"hasError": "true"}, [busy]),
        ({"hasError": "false"}, [quiet]),
        ({"browser": "firefox"}, [busy]),
        ({"browser": "Safari"}, []),
        ({"route": "/product/:id"}, [busy]),
        ({"userId": user}, [busy]),
        ({"release": "1.7.4"}, [quiet]),
        ({"minDurationMs": "60000"}, [busy]),
        ({"maxDurationMs": "60000"}, [quiet]),
        ({"limit": "1", "offset": "1"}, [busy]),
    ]:
        response = requests.get(signoz.self.host_configs["8080"].get(f"{base}/sessions"), params={**params, **filters}, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert response.status_code == HTTPStatus.OK, response.text
        assert [s["sessionId"] for s in response.json()["data"]["sessions"]] == expected, filters

    detail = wait_for_rum_query(signoz, token, f"{base}/sessions/{busy}", params, lambda data: len(data["timeline"]) == 2 and len(data["timeline"][1]["events"]) == 3 and data["timeline"][1]["events"][0]["request"]["hasBackend"])
    assert (detail["views"], detail["pageLoads"], detail["requests"], detail["actions"], detail["errors"], detail["vitals"]) == (2, 1, 1, 2, 1, 1)
    assert [view["route"] for view in detail["timeline"]] == ["/", "/product/:id"]
    assert [event["kind"] for event in detail["timeline"][0]["events"]] == ["vital", "click"]
    assert [event["kind"] for event in detail["timeline"][1]["events"]] == ["request", "action", "error"]
    request = detail["timeline"][1]["events"][0]["request"]
    assert request["traceId"] == backend_trace
    assert request["backendService"] == "catalog"
    assert request["path"] == "/api/products/:id"
    assert detail["timeline"][1]["events"][1]["action"]["name"] == "add_to_cart"
    assert detail["leadingEvents"] == []
    assert detail["truncated"] is False

    response = requests.get(signoz.self.host_configs["8080"].get(f"{base}/sessions/missing-session"), params=params, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert response.status_code == HTTPStatus.NOT_FOUND
