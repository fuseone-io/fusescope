package spantypes

import (
	"strings"

	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/ptrace"
)

var resourceSourcePrefix = FieldContextResource.StringValue() + "."

// applySpanMapperProcessor applies a signozspanmapper config to td in place,
// as the collector does: per span, groups run in order and each sees the
// changes of the ones before it. A group runs when a span attribute key or
// resource key contains one of its condition substrings. A rule takes the
// first present source and never overwrites an existing target.
func applySpanMapperProcessor(config *spanMapperProcessorConfig, td ptrace.Traces) {
	resourceSpans := td.ResourceSpans()
	for i := 0; i < resourceSpans.Len(); i++ {
		rs := resourceSpans.At(i)
		resource := rs.Resource().Attributes()
		scopeSpans := rs.ScopeSpans()
		for j := 0; j < scopeSpans.Len(); j++ {
			spans := scopeSpans.At(j).Spans()
			for k := 0; k < spans.Len(); k++ {
				applySpanMapperGroups(config.Groups, spans.At(k).Attributes(), resource)
			}
		}
	}
}

func applySpanMapperGroups(groups []spanMapperProcessorGroup, attributes, resource pcommon.Map) {
	for _, group := range groups {
		if !anyKeyContains(attributes, group.ExistsAny.Attributes) && !anyKeyContains(resource, group.ExistsAny.Resource) {
			continue
		}
		for _, rule := range group.Attributes {
			applySpanMapperRule(rule, attributes, resource)
		}
	}
}

func anyKeyContains(m pcommon.Map, substrings []string) bool {
	found := false
	m.Range(func(key string, _ pcommon.Value) bool {
		for _, s := range substrings {
			if strings.Contains(key, s) {
				found = true
				return false
			}
		}
		return true
	})
	return found
}

func applySpanMapperRule(rule spanMapperProcessorAttribute, attributes, resource pcommon.Map) {
	target := attributes
	if rule.Context == FieldContextResource.StringValue() {
		target = resource
	}
	if _, exists := target.Get(rule.Target); exists {
		return
	}

	for _, source := range rule.Sources {
		from, key := attributes, source.Key
		if resourceKey, ok := strings.CutPrefix(source.Key, resourceSourcePrefix); ok {
			from, key = resource, resourceKey
		}
		value, ok := from.Get(key)
		if !ok {
			continue
		}
		// Copied out first: inserting into the same map may move value's storage.
		copied := pcommon.NewValueEmpty()
		value.CopyTo(copied)
		copied.CopyTo(target.PutEmpty(rule.Target))
		if source.Action == SpanMapperOperationMove.StringValue() {
			from.Remove(key)
		}
		return
	}
}
