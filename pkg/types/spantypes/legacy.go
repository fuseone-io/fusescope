package spantypes

import (
	"encoding/json"
	"time"
)

// LegacyEvents writes events read natively from fusescope-engine, a list of structs of timestamp,
// name and attributes, in the stored form the readers take: one JSON Event per element.
func LegacyEvents(native []map[string]any) []string {
	out := make([]string, 0, len(native))
	for _, event := range native {
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

// LegacyLinks writes links read natively from fusescope-engine, a list of structs with hex ids, in
// the stored form the readers take: one JSON array of Link.
func LegacyLinks(native []map[string]any) string {
	links := make([]Link, 0, len(native))
	for _, link := range native {
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
