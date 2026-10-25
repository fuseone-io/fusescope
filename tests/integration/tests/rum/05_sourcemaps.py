import time
import uuid
from collections.abc import Callable
from http import HTTPStatus
from pathlib import Path

import requests

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, RUM_KEY_HEADER, RUM_ORIGIN, SIGNOZ_API_KEY_HEADER, create_rum_application, padded_source_map, rum_event, send_rum, upload_source_maps, wait_for_rum_query
from fixtures.serviceaccount import create_service_account_with_key
from fixtures.types import Operation, SigNoz

FIXTURES = Path(__file__).resolve().parents[4] / "pkg" / "types" / "rumtypes" / "testdata" / "sourcemap"
SOURCE_MAP = (FIXTURES / "main.js.map").read_bytes()
STACK = (FIXTURES / "stack.txt").read_text()


def test_sourcemaps_upload_list_delete(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"maps-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    _, api_key = create_service_account_with_key(signoz, token, f"ci-{uuid.uuid4().hex[:8]}", role="signoz-editor")
    editor = {SIGNOZ_API_KEY_HEADER: api_key}
    url = signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/sourcemaps")

    response = upload_source_maps(signoz, created["id"], "1.8.0", editor, {"/assets/main.js.map": SOURCE_MAP, "/assets/bad.js.map": b"console.log(1)"}, debug_ids={"/assets/main.js.map": "85314830-023f-4cf1-a267-535f4e37bb17"})
    assert response.status_code == HTTPStatus.CREATED, response.text
    uploaded = response.json()["data"]
    assert [(file["path"], file["generatedPath"], file["debugId"]) for file in uploaded["files"]] == [("/assets/main.js.map", "/assets/main.js", "85314830-023f-4cf1-a267-535f4e37bb17")]
    assert [rejected["path"] for rejected in uploaded["rejected"]] == ["/assets/bad.js.map"]

    response = upload_source_maps(signoz, created["id"], "1.8.0", editor, {"/assets/main.js.map": SOURCE_MAP})
    assert response.status_code == HTTPStatus.CREATED, response.text
    assert response.json()["data"]["replaced"] == 1

    response = upload_source_maps(signoz, created["id"], "1.7.4", editor, {"/assets/main.js.map": SOURCE_MAP, "/assets/vendor.js.map": SOURCE_MAP})
    assert response.status_code == HTTPStatus.CREATED, response.text

    response = requests.get(url, headers=editor, timeout=10)
    assert response.status_code == HTTPStatus.OK, response.text
    listed = response.json()["data"]
    assert [(release["release"], release["files"]) for release in listed["releases"]] == [("1.7.4", 2), ("1.8.0", 1)]
    assert listed["sizeBytes"] == 3 * len(SOURCE_MAP)
    assert listed["releases"][0]["uploadedBy"] != ""
    assert listed["releases"][0]["expiresAt"] is None
    assert listed["settings"] == {"retention": "90d", "keepNewestReleases": True}

    response = requests.get(url, params={"release": "1.7.4"}, headers=editor, timeout=10)
    assert response.status_code == HTTPStatus.OK, response.text
    files = response.json()["data"]["files"]
    assert [file["path"] for file in files] == ["/assets/main.js.map", "/assets/vendor.js.map"]

    response = requests.delete(f"{url}/{files[1]['id']}", headers=editor, timeout=10)
    assert response.status_code == HTTPStatus.NO_CONTENT, response.text
    response = requests.delete(url, params={"release": "1.7.4"}, headers=editor, timeout=10)
    assert response.status_code == HTTPStatus.NO_CONTENT, response.text
    response = requests.get(url, params={"release": "1.7.4"}, headers=editor, timeout=10)
    assert response.status_code == HTTPStatus.NOT_FOUND
    response = requests.delete(url, headers=editor, timeout=10)
    assert response.status_code == HTTPStatus.BAD_REQUEST, "deleting needs a release"

    response = requests.put(
        signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}"),
        json={"name": created["name"], "environment": "production", "sourceMaps": {"retention": "30d", "keepNewestReleases": False}},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    assert response.status_code == HTTPStatus.OK, response.text
    assert response.json()["data"]["sourceMaps"] == {"retention": "30d", "keepNewestReleases": False}
    response = requests.get(url, headers=editor, timeout=10)
    assert response.json()["data"]["releases"][0]["expiresAt"] is not None


def test_sourcemaps_access(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"maps-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    _, viewer_key = create_service_account_with_key(signoz, token, f"viewer-{uuid.uuid4().hex[:8]}", role="signoz-viewer")

    response = upload_source_maps(signoz, created["id"], "1.0.0", {SIGNOZ_API_KEY_HEADER: viewer_key}, {"/main.js.map": SOURCE_MAP})
    assert response.status_code == HTTPStatus.FORBIDDEN, response.text

    response = upload_source_maps(signoz, created["id"], "1.0.0", {RUM_KEY_HEADER: created["key"]["key"]}, {"/main.js.map": SOURCE_MAP})
    assert response.status_code == HTTPStatus.UNAUTHORIZED, "the public RUM key never uploads"

    response = upload_source_maps(signoz, created["id"], "1.0.0", {"Authorization": f"Bearer {token}"}, {"/main.js.map": SOURCE_MAP})
    assert response.status_code == HTTPStatus.CREATED, "an admin session uploads"

    response = requests.get(signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/sourcemaps"), headers={SIGNOZ_API_KEY_HEADER: viewer_key}, timeout=10)
    assert response.status_code == HTTPStatus.OK, "a viewer lists"


def test_sourcemaps_limits(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    """The rum suite runs with a 64 KiB file limit, 5 files per release and a 256 KiB quota."""
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"maps-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production"})
    _, api_key = create_service_account_with_key(signoz, token, f"ci-{uuid.uuid4().hex[:8]}", role="signoz-editor")
    editor = {SIGNOZ_API_KEY_HEADER: api_key}

    response = upload_source_maps(signoz, created["id"], "1.0.0", editor, {"/big.js.map": padded_source_map(70_000), "/ok.js.map": SOURCE_MAP})
    assert response.status_code == HTTPStatus.CREATED, response.text
    assert [rejected["path"] for rejected in response.json()["data"]["rejected"]] == ["/big.js.map"]

    response = upload_source_maps(signoz, created["id"], "1.0.0", editor, {f"/chunk-{i}.js.map": SOURCE_MAP for i in range(5)})
    assert response.status_code == HTTPStatus.BAD_REQUEST, response.text

    response = upload_source_maps(signoz, created["id"], "2.0.0", editor, {f"/chunk-{i}.js.map": padded_source_map(60_000) for i in range(5)})
    assert response.status_code == HTTPStatus.REQUEST_ENTITY_TOO_LARGE, response.text

    response = requests.get(signoz.self.host_configs["8080"].get(f"{RUM_APPLICATIONS}/{created['id']}/sourcemaps"), headers=editor, timeout=10)
    assert [(release["release"], release["files"]) for release in response.json()["data"]["releases"]] == [("1.0.0", 1)], "failed uploads store nothing"


def test_sourcemaps_symbolicate_error(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    created = create_rum_application(signoz, token, {"name": f"maps-{uuid.uuid4().hex[:8]}", "platform": "web", "environment": "production", "allowedOrigins": [RUM_ORIGIN]})
    base = f"{RUM_APPLICATIONS}/{created['id']}"
    _, api_key = create_service_account_with_key(signoz, token, f"ci-{uuid.uuid4().hex[:8]}", role="signoz-editor")
    second = 1_000_000_000
    t0 = time.time_ns() - 300 * second

    def exception(at: int, session: str) -> dict:
        return rum_event("exception", at, {"session.id": session, "fusescope.rum.view.route": "/cart", "exception.type": "TypeError", "exception.message": "price is undefined", "exception.stacktrace": STACK})

    send_rum(signoz, created["key"]["key"], {"service.name": "shop", "service.version": "1.8.0"}, events=[exception(t0, f"mapped-{uuid.uuid4().hex}")])
    send_rum(signoz, created["key"]["key"], {"service.name": "shop", "service.version": "1.7.0"}, events=[exception(t0 - second, f"unmapped-{uuid.uuid4().hex}")])

    response = upload_source_maps(signoz, created["id"], "1.8.0", {SIGNOZ_API_KEY_HEADER: api_key}, {"/assets/main.js.map": SOURCE_MAP})
    assert response.status_code == HTTPStatus.CREATED, response.text

    params = {"start": t0 // 1_000_000 - 60_000, "end": t0 // 1_000_000 + 60_000}
    listed = wait_for_rum_query(signoz, token, f"{base}/errors", params, lambda data: data["events"] == 2)
    assert listed["total"] == 1, "symbolication does not change the fingerprint"
    assert listed["groups"][0]["topFrame"]["function"] == "e"

    detail = wait_for_rum_query(signoz, token, f"{base}/errors/{listed['groups'][0]['fingerprint']}", params, lambda data: len(data["latestEvents"]) == 2)
    events = {event["release"]: event for event in detail["latestEvents"]}

    mapped = events["1.8.0"]
    assert mapped["symbolicated"] is True
    assert mapped["missingSourceMap"] is None
    top = mapped["frames"][0]
    assert (top["function"], top["file"], top["line"], top["column"]) == ("e", "https://shop.example.com/assets/main.js", 1, 41)
    original = top["original"]
    assert (original["function"], original["file"], original["line"], original["column"]) == ("formatPrice", "src/price.ts", 3, 11)
    assert original["inApp"] is True
    assert original["sourceMap"] == "/assets/main.js.map"
    assert '    throw new TypeError("price is undefined");' in original["context"]["lines"]
    assert mapped["frames"][2]["original"] is None, "Array.map (<anonymous>) has no map"

    unmapped = events["1.7.0"]
    assert unmapped["symbolicated"] is False
    assert unmapped["missingSourceMap"] == {"release": "1.7.0", "kind": "source-map"}
    assert unmapped["frames"][0]["original"] is None
