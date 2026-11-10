"""The OTLP/JSON the suite sends through the collector carries every field of the
spans the other suites insert into ClickHouse, so both stores receive them."""

import datetime

from fixtures.otlp import traces_to_otlp_json
from fixtures.traces import Traces, TracesEvent, TracesKind, TracesLink, TracesRefType, TracesStatusCode

# 2025-05-22T21:40:00.654321Z: a float of its nanoseconds rounds, so exact arithmetic shows.
T0 = datetime.datetime(2025, 5, 22, 21, 40, 0, 654321, tzinfo=datetime.UTC)
TRACE = "4bf92f3577b34da6a3ce929d0e0e4736"


def span(**overrides) -> Traces:
    fields = {
        "timestamp": T0,
        "duration": datetime.timedelta(milliseconds=250),
        "trace_id": TRACE,
        "span_id": "00f067aa0ba902b7",
        "name": "GET /cart",
        "kind": TracesKind.SPAN_KIND_SERVER,
        "resources": {"service.name": "cart", "host.name": "h1"},
        "scope": {"name": "io.opentelemetry.http", "version": "1.2.0", "attributes": {"lib": "x"}},
    }
    fields.update(overrides)
    return Traces(**fields)


def test_a_span_carries_every_field() -> None:
    root = span(
        parent_span_id="53995c3f42cd8ad8",
        status_code=TracesStatusCode.STATUS_CODE_ERROR,
        status_message="boom",
        attributes={"http.request.method": "GET", "http.response.status_code": 500, "ratio": 0.5, "retry": True},
        events=[TracesEvent(name="exception", timestamp=T0 + datetime.timedelta(milliseconds=5), attribute_map={"exception.type": "IOError"})],
        links=[TracesLink(trace_id="5b8efff798038103d269b633813fc60c", span_id="eee19b7ec3c1b174", ref_type=TracesRefType.REF_TYPE_FOLLOWS_FROM)],
        trace_state="rojo=00f067aa0ba902b7",
        flags=0x301,
    )
    body = traces_to_otlp_json([root])

    assert body == {
        "resourceSpans": [
            {
                "resource": {"attributes": [{"key": "host.name", "value": {"stringValue": "h1"}}, {"key": "service.name", "value": {"stringValue": "cart"}}]},
                "scopeSpans": [
                    {
                        "scope": {"name": "io.opentelemetry.http", "version": "1.2.0", "attributes": [{"key": "lib", "value": {"stringValue": "x"}}]},
                        "spans": [
                            {
                                "traceId": TRACE,
                                "spanId": "00f067aa0ba902b7",
                                "parentSpanId": "53995c3f42cd8ad8",
                                "traceState": "rojo=00f067aa0ba902b7",
                                "flags": 0x301,
                                "name": "GET /cart",
                                "kind": 2,
                                "startTimeUnixNano": "1747950000654321000",
                                "endTimeUnixNano": "1747950000904321000",
                                "attributes": [
                                    {"key": "http.request.method", "value": {"stringValue": "GET"}},
                                    {"key": "http.response.status_code", "value": {"intValue": "500"}},
                                    {"key": "ratio", "value": {"doubleValue": 0.5}},
                                    {"key": "retry", "value": {"boolValue": True}},
                                ],
                                "events": [{"timeUnixNano": "1747950000659321088", "name": "exception", "attributes": [{"key": "exception.type", "value": {"stringValue": "IOError"}}]}],
                                "links": [{"traceId": "5b8efff798038103d269b633813fc60c", "spanId": "eee19b7ec3c1b174"}],
                                "status": {"code": 2, "message": "boom"},
                            }
                        ],
                    }
                ],
            }
        ]
    }, "the child-of link to the parent the fixture adds for ClickHouse is not a link of the span"


def test_spans_group_by_resource_then_scope() -> None:
    a = span(span_id="0000000000000001")
    b = span(span_id="0000000000000002", scope={"name": "other"})
    c = span(span_id="0000000000000003", resources={"service.name": "billing"})
    body = traces_to_otlp_json([a, b, c])

    services = [[a["value"]["stringValue"] for a in rs["resource"]["attributes"] if a["key"] == "service.name"] for rs in body["resourceSpans"]]
    assert services == [["cart"], ["billing"]]
    cart = body["resourceSpans"][0]["scopeSpans"]
    assert [s["scope"]["name"] for s in cart] == ["io.opentelemetry.http", "other"]
    assert [[sp["spanId"] for sp in s["spans"]] for s in cart] == [["0000000000000001"], ["0000000000000002"]]
    assert [sp["spanId"] for sp in body["resourceSpans"][1]["scopeSpans"][0]["spans"]] == ["0000000000000003"]


def test_a_root_has_no_parent_and_unset_fields_stay_out() -> None:
    root = span(attributes={})
    sent = traces_to_otlp_json([root])["resourceSpans"][0]["scopeSpans"][0]["spans"][0]
    assert "parentSpanId" not in sent
    assert sent["attributes"] == []
    assert sent["links"] == []
    assert sent["events"] == []
    assert sent["status"] == {"code": 0}
