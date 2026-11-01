import time
import uuid
from collections.abc import Callable

from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD
from fixtures.rum import RUM_APPLICATIONS, create_rum_application, rum_event, send_rum, wait_for_rum_query
from fixtures.types import Operation, SigNoz


def test_android_native_crashes_group_by_library_offset_and_build(
    signoz: SigNoz,
    create_user_admin: Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
):
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    app = create_rum_application(signoz, token, {"name": f"native-{uuid.uuid4().hex[:8]}", "platform": "android", "environment": "test", "allowedPackageNames": ["com.example.native"]})
    start = time.time_ns() - 30_000_000_000
    for index, (release, directory, offset, build) in enumerate(
        [
            ("1.0", "first", "42", "abcd"),
            ("1.1", "second", "00000042", "abcd"),
            ("1.1", "second", "52", "abcd"),
            ("1.2", "third", "42", "ffff"),
        ]
    ):
        send_rum(
            signoz,
            app["key"]["key"],
            {"service.name": "native-shop", "service.version": release, "app.package.name": "com.example.native"},
            events=[
                rum_event(
                    "exception",
                    start + index * 1_000_000_000,
                    {
                        "exception.type": "SIGSEGV",
                        "exception.message": "Native process terminated by signal 11",
                        "exception.stacktrace": f"#00 pc {offset} /data/app/{directory}/lib/arm64/libcheckout.so (pay+4) (BuildId: {build})",
                        "fusescope.rum.error.source": "native",
                        "session.id": f"native-{index}-{uuid.uuid4().hex}",
                    },
                )
            ],
            origin=None,
        )
    params = {"start": start // 1_000_000 - 10_000, "end": start // 1_000_000 + 20_000, "source": "native"}
    base = f"{RUM_APPLICATIONS}/{app['id']}/errors"
    listed = wait_for_rum_query(signoz, token, base, params, lambda data: data["events"] == 4)
    assert sorted(group["events"] for group in listed["groups"]) == [1, 1, 2]
    grouped = next(group for group in listed["groups"] if group["events"] == 2)
    assert grouped["source"] == "native"
    assert grouped["topFrame"]["original"] is None
    detail = wait_for_rum_query(signoz, token, f"{base}/{grouped['fingerprint']}", params, lambda data: len(data["latestEvents"]) == 2)
    for event in detail["latestEvents"]:
        assert event["type"] == "SIGSEGV"
        assert len(event["frames"]) == 1
        assert "pc 0x42" in event["frames"][0]["function"]
        assert event["missingSourceMap"] is None
        assert event["symbolicated"] is False
        assert event["causes"] == []
