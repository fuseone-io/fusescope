"""Spans of fixtures.traces as an OTLP/JSON export request, the body a collector's
OTLP/HTTP receiver takes on /v1/traces."""

import datetime
from typing import Any

from fixtures.traces import Traces


def unix_nano(at: datetime.datetime) -> int:
    """Exact nanoseconds of at; a naive time is local, as datetime.timestamp reads it."""
    return int(at.timestamp()) * 1_000_000_000 + at.microsecond * 1_000


def any_value(value: Any) -> dict[str, Any]:
    if isinstance(value, bool):
        return {"boolValue": value}
    if isinstance(value, int):
        return {"intValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    return {"stringValue": str(value)}


def key_values(attributes: dict[str, Any]) -> list[dict[str, Any]]:
    return [{"key": key, "value": any_value(attributes[key])} for key in sorted(attributes)]


def span_attributes(span: Traces) -> dict[str, Any]:
    """The span's attributes with their types: the JSON copy keeps ints apart from floats, and
    a legacy-only span has only the typed maps."""
    if span.attributes_json:
        return dict(span.attributes_json)
    attributes: dict[str, Any] = dict(span.attribute_string)
    attributes.update({key: float(value) for key, value in span.attributes_number.items()})
    attributes.update(span.attributes_bool)
    return attributes


def otlp_span(span: Traces) -> dict[str, Any]:
    start = unix_nano(span.timestamp)
    # The fixture adds the parent as the first link, a ClickHouse reference the span never sent.
    links = span.links[1:] if span.parent_span_id else span.links
    status: dict[str, Any] = {"code": int(span.status_code)}
    if span.status_message:
        status["message"] = span.status_message
    out: dict[str, Any] = {"traceId": span.trace_id, "spanId": span.span_id}
    if span.parent_span_id:
        out["parentSpanId"] = span.parent_span_id
    if span.trace_state:
        out["traceState"] = span.trace_state
    if span.flags:
        out["flags"] = int(span.flags)
    out.update(
        {
            "name": span.name,
            "kind": int(span.kind),
            "startTimeUnixNano": str(start),
            "endTimeUnixNano": str(start + int(span.duration_nano)),
            "attributes": key_values(span_attributes(span)),
            "events": [{"timeUnixNano": str(int(event["timeUnixNano"])), "name": event["name"], "attributes": key_values(event["attributes"])} for event in span.events],
            "links": [{"traceId": link["traceId"], "spanId": link["spanId"]} for link in links],
            "status": status,
        }
    )
    return out


def otlp_scope(span: Traces) -> dict[str, Any]:
    scope: dict[str, Any] = {}
    if span.scope_json.get("name"):
        scope["name"] = span.scope_json["name"]
    if span.scope_json.get("version"):
        scope["version"] = span.scope_json["version"]
    if span.scope_json.get("attributes"):
        scope["attributes"] = key_values(span.scope_json["attributes"])
    return scope


def traces_to_otlp_json(spans: list[Traces]) -> dict[str, Any]:
    """One ResourceSpans per resource and one ScopeSpans per scope within it, both in the order
    they first appear, each span in its given order."""
    resources: dict[tuple, dict[tuple, list[dict[str, Any]]]] = {}
    scopes: dict[tuple, dict[str, Any]] = {}
    for span in spans:
        resource_key = tuple(sorted(span.resources_string.items()))
        scope = otlp_scope(span)
        scope_key = repr(sorted(scope.items()))
        scopes.setdefault((resource_key, scope_key), scope)
        resources.setdefault(resource_key, {}).setdefault(scope_key, []).append(otlp_span(span))
    return {
        "resourceSpans": [
            {
                "resource": {"attributes": key_values(dict(resource_key))},
                "scopeSpans": [{"scope": scopes[(resource_key, scope_key)], "spans": spans_of_scope} for scope_key, spans_of_scope in by_scope.items()],
            }
            for resource_key, by_scope in resources.items()
        ]
    }
