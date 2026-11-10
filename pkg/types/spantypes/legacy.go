package spantypes

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/telemetrystoretypes"
)

// LegacyEvents writes events read natively from fusescope-engine, a list of structs of timestamp,
// name and attributes as the Flight reader gives it, in the stored form the readers take: one
// JSON Event per element.
func LegacyEvents(native []any) []string {
	out := make([]string, 0, len(native))
	for _, element := range native {
		event, ok := element.(map[string]any)
		if !ok {
			continue
		}
		legacy := Event{}
		legacy.Name, _ = event["name"].(string)
		if at, ok := event["timestamp"].(time.Time); ok {
			legacy.TimeUnixNano = uint64(at.UnixNano())
		}
		if attributes, ok := event["attributes"].(map[string]string); ok && len(attributes) > 0 {
			legacy.AttributeMap = make(map[string]any, len(attributes))
			for key, value := range attributes {
				legacy.AttributeMap[key] = value
			}
		}
		encoded, err := json.Marshal(legacy)
		if err != nil {
			continue
		}
		out = append(out, string(encoded))
	}
	return out
}

// LegacyLinks writes links read natively from fusescope-engine, a list of structs with hex ids as
// the Flight reader gives it, in the stored form the readers take: one JSON array of Link.
func LegacyLinks(native []any) string {
	links := make([]Link, 0, len(native))
	for _, element := range native {
		link, ok := element.(map[string]any)
		if !ok {
			continue
		}
		traceID, _ := link["trace_id"].(string)
		spanID, _ := link["span_id"].(string)
		links = append(links, Link{TraceID: traceID, SpanID: spanID})
	}
	encoded, err := json.Marshal(links)
	if err != nil {
		return "[]"
	}
	return string(encoded)
}

// AttributesDocument nests the attributes read from fusescope-engine by their dotted keys, as the
// ClickHouse JSON attributes column stores them. A key that is also the prefix of another gives
// way to the deeper value, whatever the order the maps are read in. No attributes is nil.
func AttributesDocument(texts map[string]string, numbers map[string]float64, bools map[string]bool) telemetrystoretypes.JSONValue {
	if len(texts)+len(numbers)+len(bools) == 0 {
		return nil
	}
	doc := telemetrystoretypes.JSONValue{}
	for key, value := range texts {
		nest(doc, key, value)
	}
	for key, value := range numbers {
		nest(doc, key, value)
	}
	for key, value := range bools {
		nest(doc, key, value)
	}
	return doc
}

func nest(doc map[string]any, key string, value any) {
	segments := strings.Split(key, ".")
	current := doc
	for _, segment := range segments[:len(segments)-1] {
		child, ok := current[segment].(map[string]any)
		if !ok {
			child = map[string]any{}
			current[segment] = child
		}
		current = child
	}
	last := segments[len(segments)-1]
	if _, deeper := current[last].(map[string]any); !deeper {
		current[last] = value
	}
}

// LegacyReferences writes a span's references as the collector stores them for ClickHouse: the span's
// own CHILD_OF reference to its parent, naming no span for a root, then each link read natively from
// fusescope-engine as FOLLOWS_FROM.
func LegacyReferences(traceID, parentSpanID string, native []any) string {
	refs := []OtelSpanRef{{TraceId: traceID, SpanId: parentSpanID, RefType: "CHILD_OF"}}
	for _, element := range native {
		link, ok := element.(map[string]any)
		if !ok {
			continue
		}
		linkTrace, _ := link["trace_id"].(string)
		linkSpan, _ := link["span_id"].(string)
		refs = append(refs, OtelSpanRef{TraceId: linkTrace, SpanId: linkSpan, RefType: "FOLLOWS_FROM"})
	}
	encoded, err := json.Marshal(refs)
	if err != nil {
		return "[]"
	}
	return string(encoded)
}
