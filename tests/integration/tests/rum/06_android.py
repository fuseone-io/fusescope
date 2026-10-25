import time
import uuid
from collections.abc import Callable
from http import HTTPStatus
from pathlib import Path

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, RUM_KEY_HEADER, RUM_ORIGIN, SIGNOZ_API_KEY_HEADER, create_rum_application, otlp_attributes, rum_event, send_rum, upload_r8_mapping, wait_for_rum_query
from fixtures.serviceaccount import create_service_account_with_key
from fixtures.types import Operation, SigNoz

FIXTURES = Path(__file__).resolve().parents[4] / "pkg" / "types" / "rumtypes" / "testdata" / "r8"
MAPPING = (FIXTURES / "mapping.txt").read_bytes()
CRASH = (FIXTURES / "crash.txt").read_text()
ANR = (FIXTURES / "anr.txt").read_text()
PACKAGE = "com.example.shop"


def test_android_application_package_names(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    url = signoz.self.host_configs["8080"].get(RUM_APPLICATIONS)
    created = create_rum_application(signoz, token, {"name": f"android-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "production", "allowedPackageNames": [PACKAGE, "com.example.shop.*"]})
    assert created["platform"] == "android"
    assert created["allowedPackageNames"] == [PACKAGE, "com.example.shop.*"]
    assert created["allowedOrigins"] == []

    response = requests.post(url, json={"name": f"android-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "production", "allowedOrigins": [RUM_ORIGIN]}, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert response.status_code == HTTPStatus.BAD_REQUEST, "android applications allow package names, not origins"
    response = requests.post(url, json={"name": f"web-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedPackageNames": [PACKAGE]}, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert response.status_code == HTTPStatus.BAD_REQUEST, "web applications allow origins, not package names"

    key = created["key"]["key"]
    now = time.time_ns()
    for package, status in [(PACKAGE, HTTPStatus.OK), ("com.example.shop.debug", HTTPStatus.OK), ("com.evil.app", HTTPStatus.FORBIDDEN), (None, HTTPStatus.FORBIDDEN)]:
        resource = {"service.name": "shop-android", "service.version": "2.1.0"} | ({"app.package.name": package} if package else {})
        body = {"resourceLogs": [{"resource": {"attributes": otlp_attributes(resource)}, "scopeLogs": [{"logRecords": [rum_event("app.screen.click", now, {"app.screen.name": "CartScreen"})]}]}]}
        response = requests.post(signoz.self.host_configs["8080"].get("/rum/v1/logs"), json=body, headers={RUM_KEY_HEADER: key, "Content-Type": "application/json"}, timeout=10)
        assert response.status_code == status, f"{package}: {response.text}"
        assert "Access-Control-Allow-Origin" not in response.headers

    response = requests.post(
        signoz.self.host_configs["8080"].get("/rum/v1/logs"),
        json={"resourceLogs": [{"resource": {"attributes": otlp_attributes({"app.package.name": PACKAGE})}, "scopeLogs": [{"logRecords": []}]}]},
        headers={RUM_KEY_HEADER: key, "Content-Type": "application/json", "Origin": RUM_ORIGIN},
        timeout=10,
    )
    assert response.status_code == HTTPStatus.FORBIDDEN, "a browser cannot use an android key"

    status = requests.get(f"{url}/{created['id']}/status", headers={"Authorization": f"Bearer {token}"}, timeout=10).json()["data"]
    reasons = {rejection["reason"]: rejection["lastOrigin"] for rejection in status["rejections"]}
    assert reasons == {"package_not_allowed": "", "origin_not_allowed": RUM_ORIGIN}
    assert "io.fuseone.fusescope:android" in [sdk["name"] for sdk in status["supportedSdks"]]


def test_android_r8_mapping_upload(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    android = create_rum_application(signoz, token, {"name": f"android-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "production", "allowedPackageNames": [PACKAGE]})
    web = create_rum_application(signoz, token, {"name": f"web-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    _, editor_key = create_service_account_with_key(signoz, token, f"gradle-{uuid.uuid4().hex[:8]}", role="signoz-editor")
    _, viewer_key = create_service_account_with_key(signoz, token, f"viewer-{uuid.uuid4().hex[:8]}", role="signoz-viewer")
    editor = {SIGNOZ_API_KEY_HEADER: editor_key}

    response = upload_r8_mapping(signoz, android["id"], "2.1.0", editor, MAPPING)
    assert response.status_code == HTTPStatus.CREATED, response.text
    uploaded = response.json()["data"]
    assert uploaded["release"] == "2.1.0"
    assert [(file["kind"], file["path"], file["debugId"], file["sizeBytes"]) for file in uploaded["files"]] == [("r8-mapping", "/mapping.txt", "7e4c1a9", len(MAPPING))]

    response = upload_r8_mapping(signoz, android["id"], "2.1.0", editor, MAPPING, compress=True)
    assert response.status_code == HTTPStatus.CREATED, response.text
    assert response.json()["data"]["replaced"] == 1

    response = requests.post(
        signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{android['id']}/mappings"),
        data={"release": "2.2.0"},
        files={"file": ("mapping.txt", MAPPING, "text/plain")},
        headers=editor,
        timeout=30,
    )
    assert response.status_code == HTTPStatus.CREATED, response.text

    assert upload_r8_mapping(signoz, android["id"], "2.1.0", editor, b"not a mapping").status_code == HTTPStatus.BAD_REQUEST
    assert upload_r8_mapping(signoz, android["id"], "", editor, MAPPING).status_code == HTTPStatus.BAD_REQUEST
    assert upload_r8_mapping(signoz, web["id"], "1.0.0", editor, MAPPING).status_code == HTTPStatus.BAD_REQUEST, "web applications take source maps"
    assert upload_r8_mapping(signoz, android["id"], "2.1.0", {SIGNOZ_API_KEY_HEADER: viewer_key}, MAPPING).status_code == HTTPStatus.FORBIDDEN
    assert upload_r8_mapping(signoz, android["id"], "2.1.0", {RUM_KEY_HEADER: android["key"]["key"]}, MAPPING).status_code == HTTPStatus.UNAUTHORIZED

    listed = requests.get(signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{android['id']}/sourcemaps"), headers=editor, timeout=10).json()["data"]
    assert sorted((release["release"], release["files"]) for release in listed["releases"]) == [("2.1.0", 1), ("2.2.0", 1)]
    assert listed["sizeBytes"] == 2 * len(MAPPING)


def test_android_crash_grouped_and_retraced(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"android-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "production", "allowedPackageNames": [PACKAGE]})
    base = f"{RUM_APPLICATIONS}/{created['id']}"
    _, api_key = create_service_account_with_key(signoz, token, f"gradle-{uuid.uuid4().hex[:8]}", role="signoz-editor")
    key = created["key"]["key"]
    second = 1_000_000_000
    t0 = time.time_ns() - 300 * second

    crash = {"exception.type": "a.a", "exception.message": "Cart is empty", "exception.stacktrace": CRASH, "fusescope.rum.error.source": "crash", "app.screen.name": "CheckoutScreen"}
    send_rum(signoz, key, {"service.name": "shop-android", "service.version": "2.1.0", "app.package.name": PACKAGE}, events=[rum_event("exception", t0 + i * second, crash | {"session.id": f"mapped-{uuid.uuid4().hex}"}) for i in range(2)], origin=None)
    send_rum(signoz, key, {"service.name": "shop-android", "service.version": "2.0.0", "app.package.name": PACKAGE}, events=[rum_event("exception", t0 - second, crash | {"session.id": f"unmapped-{uuid.uuid4().hex}"})], origin=None)
    send_rum(signoz, key, {"service.name": "shop-android", "service.version": "2.1.0", "app.package.name": PACKAGE}, events=[rum_event("device.anr", t0 + 5 * second, {"exception.stacktrace": ANR, "session.id": f"anr-{uuid.uuid4().hex}"})], origin=None)

    response = upload_r8_mapping(signoz, created["id"], "2.1.0", {SIGNOZ_API_KEY_HEADER: api_key}, MAPPING)
    assert response.status_code == HTTPStatus.CREATED, response.text

    params = {"start": t0 // 1_000_000 - 60_000, "end": t0 // 1_000_000 + 60_000}
    listed = wait_for_rum_query(signoz, token, f"{base}/errors", params, lambda data: data["events"] == 4)
    groups = {group["type"]: group for group in listed["groups"]}
    assert set(groups) == {"com.example.shop.CartException", "a.a", "ANR"}, "a release without its mapping groups on obfuscated frames"

    crashes = groups["com.example.shop.CartException"]
    assert (crashes["events"], crashes["source"], crashes["route"]) == (2, "crash", "CheckoutScreen")
    assert crashes["topFrame"]["function"] == "a.b.a"
    assert (crashes["topFrame"]["original"]["function"], crashes["topFrame"]["original"]["file"], crashes["topFrame"]["original"]["line"]) == ("com.example.shop.Item.price", "Item.kt", 15)

    anr = groups["ANR"]
    assert anr["source"] == "anr", "an upstream device.anr event is an error with source anr"
    assert anr["topFrame"]["original"]["function"] == "com.example.shop.CheckoutActivity.onPay"

    detail = wait_for_rum_query(signoz, token, f"{base}/errors/{crashes['fingerprint']}", params, lambda data: len(data["latestEvents"]) == 2)
    mapped = detail["latestEvents"][0]
    assert mapped["release"] == "2.1.0"
    assert mapped["symbolicated"] is True
    assert mapped["missingSourceMap"] is None
    assert mapped["type"] == "com.example.shop.CartException"
    assert [frame["original"]["function"] for frame in mapped["frames"][:3]] == ["com.example.shop.Item.price", "com.example.shop.Cart.subtotal", "com.example.shop.Cart.checkout"]
    assert mapped["frames"][0]["original"]["inlined"] is True
    assert mapped["frames"][4]["original"] is None, "framework frames are not in the mapping"
    assert [(cause["relation"], cause["type"], cause["omittedFrames"]) for cause in mapped["causes"]] == [("caused_by", "java.lang.NullPointerException", 5)]
    assert mapped["stacktrace"] == CRASH

    detail = wait_for_rum_query(signoz, token, f"{base}/errors/{groups['a.a']['fingerprint']}", params, lambda data: len(data["latestEvents"]) == 1)
    unmapped = detail["latestEvents"][0]
    assert unmapped["symbolicated"] is False
    assert unmapped["missingSourceMap"] == {"release": "2.0.0", "kind": "r8-mapping"}
    assert unmapped["frames"][0]["original"] is None


def test_android_r8_mapping_multipart_field_order(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    android = create_rum_application(signoz, token, {"name": f"android-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "production", "allowedPackageNames": [PACKAGE]})
    _, editor_key = create_service_account_with_key(signoz, token, f"gradle-{uuid.uuid4().hex[:8]}", role="signoz-editor")
    url = signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{android['id']}/mappings")
    mapping = ("file", ("mapping.txt", MAPPING, "text/plain"))

    for release, parts in [
        ("3.0.0", [("release", (None, "3.0.0")), ("version_code", (None, "300")), ("map_id", (None, "7e4c1a9")), mapping]),
        ("3.0.1", [("build_type", (None, "release")), mapping, ("variant", (None, "prodRelease")), ("release", (None, "3.0.1"))]),
    ]:
        response = requests.post(url, files=parts, headers={SIGNOZ_API_KEY_HEADER: editor_key}, timeout=30)
        assert response.status_code == HTTPStatus.CREATED, response.text
        uploaded = response.json()["data"]
        assert (uploaded["release"], [(file["path"], file["sizeBytes"]) for file in uploaded["files"]]) == (release, [("/mapping.txt", len(MAPPING))]), "only the part named file is the mapping"

    response = requests.post(url, params={"release": "3.0.2"}, files=[("mapping", ("mapping.txt", MAPPING, "text/plain"))], headers={SIGNOZ_API_KEY_HEADER: editor_key}, timeout=30)
    assert response.status_code == HTTPStatus.BAD_REQUEST, "a body without a file part has no mapping"


def test_android_crash_anr_and_handled_grouped_apart(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    package = "io.fusescope.sample"
    created = create_rum_application(signoz, token, {"name": f"android-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "production", "allowedPackageNames": [package]})
    base = f"{RUM_APPLICATIONS}/{created['id']}"
    _, api_key = create_service_account_with_key(signoz, token, f"gradle-{uuid.uuid4().hex[:8]}", role="signoz-editor")
    response = upload_r8_mapping(signoz, created["id"], "0.1.0", {SIGNOZ_API_KEY_HEADER: api_key}, (FIXTURES / "sample" / "mapping.txt").read_bytes())
    assert response.status_code == HTTPStatus.CREATED, response.text

    crash, handled, anr = [(FIXTURES / "sample" / f"{name}.txt").read_text() for name in ("crash", "handled", "anr")]
    second = 1_000_000_000
    t0 = time.time_ns() - 300 * second
    events = [
        ("java.lang.IllegalStateException", "Payment provider unavailable", crash, "crash"),
        ("java.lang.IllegalStateException", "Checkout failed for https://shop.example/cart", handled, "manual"),
        ("ApplicationNotResponding", "Application Not Responding: the main thread was blocked for at least 5 s", anr, "anr"),
        ("java.lang.IllegalStateException", "Payment provider unavailable", crash, "manual"),
    ]
    send_rum(
        signoz,
        created["key"]["key"],
        {"service.name": "android-sample", "service.version": "0.1.0", "app.package.name": package},
        events=[rum_event("exception", t0 + i * second, {"exception.type": exception_type, "exception.message": message, "exception.stacktrace": stacktrace, "fusescope.rum.error.source": source, "session.id": f"sample-{uuid.uuid4().hex}"}) for i, (exception_type, message, stacktrace, source) in enumerate(events)],
        origin=None,
    )

    params = {"start": t0 // 1_000_000 - 60_000, "end": t0 // 1_000_000 + 60_000}
    listed = wait_for_rum_query(signoz, token, f"{base}/errors", params, lambda data: data["events"] == 4)
    groups = {(group["source"], group["topFrame"]["original"]["function"]): group for group in listed["groups"]}
    assert set(groups) == {
        ("crash", "io.fusescope.sample.Checkout.pay"),
        ("manual", "io.fusescope.sample.MainActivity.onCreate$lambda$0"),
        ("anr", "io.fusescope.sample.MainActivity.onCreate$lambda$2"),
        ("manual", "io.fusescope.sample.Checkout.pay"),
    }, "each source groups apart, on real in-app frames rather than the synthetic lambda"
    assert all(group["events"] == 1 for group in groups.values())

    fingerprint = groups[("crash", "io.fusescope.sample.Checkout.pay")]["fingerprint"]
    detail = wait_for_rum_query(signoz, token, f"{base}/errors/{fingerprint}", params, lambda data: len(data["latestEvents"]) == 1)
    frames = [(frame["original"]["function"], frame["original"]["line"], frame["original"]["inApp"], frame["original"]["inlined"]) for frame in detail["latestEvents"][0]["frames"][:3]]
    assert frames == [
        ("io.fusescope.sample.Checkout.pay", 103, True, True),
        ("io.fusescope.sample.MainActivity.onCreate$lambda$1", 32, True, True),
        ("io.fusescope.sample.MainActivity.onNewIntent", 60, True, False),
    ]
