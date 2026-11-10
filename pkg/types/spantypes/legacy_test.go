package spantypes

import (
	"fmt"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/telemetrystoretypes"
	"github.com/stretchr/testify/assert"
)

func TestEngineEventsReadAsTheStoredJSON(t *testing.T) {
	at := time.Unix(0, 1_747_950_000_000_000_123).UTC()
	native := []any{
		map[string]any{"timestamp": at, "name": "exception", "attributes": map[string]string{"exception.type": "IOError"}},
		map[string]any{"timestamp": at, "name": "retry", "attributes": map[string]string{}},
	}
	legacy := LegacyEvents(native)
	assert.Equal(t, []string{
		`{"name":"exception","timeUnixNano":1747950000000000123,"attributeMap":{"exception.type":"IOError"}}`,
		`{"name":"retry","timeUnixNano":1747950000000000123}`,
	}, legacy)
	assert.Equal(t, []EventV2{
		{Name: "exception", TimeUnixNano: 1_747_950_000_000_000_123, Attributes: map[string]any{"exception.type": "IOError"}},
		{Name: "retry", TimeUnixNano: 1_747_950_000_000_000_123},
	}, ParseEvents(legacy), "the reader of the stored form reads them back")
	assert.Equal(t, []string{}, LegacyEvents(nil))
}

func TestEngineLinksReadAsTheStoredJSON(t *testing.T) {
	native := []any{map[string]any{"trace_id": "5b8efff798038103d269b633813fc60c", "span_id": "00f067aa0ba902b7", "trace_state": "", "attributes": map[string]string{}}}
	legacy := LegacyLinks(native)
	assert.Equal(t, `[{"traceId":"5b8efff798038103d269b633813fc60c","spanId":"00f067aa0ba902b7"}]`, legacy)
	assert.Equal(t, []Link{{TraceID: "5b8efff798038103d269b633813fc60c", SpanID: "00f067aa0ba902b7"}}, ParseLinks(legacy))
	assert.Equal(t, "[]", LegacyLinks(nil))
}

func TestEngineAttributesReadAsTheStoredDocument(t *testing.T) {
	doc := AttributesDocument(
		map[string]string{"gen_ai.prompt.0.role": "user", "gen_ai.prompt.0.content": "hi", "http.route": "/cart", "a": "leaf", "a.b": "deeper"},
		map[string]float64{"gen_ai.usage.input_tokens": 4},
		map[string]bool{"gen_ai.stream": true},
	)
	assert.Equal(t, telemetrystoretypes.JSONValue{
		"gen_ai": map[string]any{
			"prompt": map[string]any{"0": map[string]any{"role": "user", "content": "hi"}},
			"usage":  map[string]any{"input_tokens": float64(4)},
			"stream": true,
		},
		"http": map[string]any{"route": "/cart"},
		"a":    map[string]any{"b": "deeper"},
	}, doc, "a key that is also a prefix of another keeps the deeper value, whatever the map order")
	assert.Nil(t, AttributesDocument(nil, map[string]float64{}, nil))

	conflicts := map[string]string{}
	want := telemetrystoretypes.JSONValue{}
	for i := range 20 {
		key := fmt.Sprintf("k%d", i)
		conflicts[key], conflicts[key+".x"] = "leaf", "deeper"
		want[key] = map[string]any{"x": "deeper"}
	}
	assert.Equal(t, want, AttributesDocument(conflicts, nil, nil), "twenty conflicts leave no room for a lucky map order")
}

func TestEngineReferencesReadAsTheCollectorStoresThem(t *testing.T) {
	links := []any{map[string]any{"trace_id": "5b8efff798038103d269b633813fc60c", "span_id": "00f067aa0ba902b7", "trace_state": "", "attributes": map[string]string{}}}
	child := LegacyReferences("4bf92f3577b34da6a3ce929d0e0e4736", "53995c3f42cd8ad8", links)
	assert.Equal(t, `[{"traceId":"4bf92f3577b34da6a3ce929d0e0e4736","spanId":"53995c3f42cd8ad8","refType":"CHILD_OF"},{"traceId":"5b8efff798038103d269b633813fc60c","spanId":"00f067aa0ba902b7","refType":"FOLLOWS_FROM"}]`, child)
	assert.Equal(t, `[{"traceId":"4bf92f3577b34da6a3ce929d0e0e4736","refType":"CHILD_OF"}]`, LegacyReferences("4bf92f3577b34da6a3ce929d0e0e4736", "", nil), "a root's own reference names no span")
	assert.Equal(t, []OtelSpanRef{{TraceId: "4bf92f3577b34da6a3ce929d0e0e4736", SpanId: "53995c3f42cd8ad8", RefType: "CHILD_OF"}, {TraceId: "5b8efff798038103d269b633813fc60c", SpanId: "00f067aa0ba902b7", RefType: "FOLLOWS_FROM"}}, (&StorableSpan{References: child}).UnmarshalledRefs())
}

func TestAMinimalSpanCarriesItsName(t *testing.T) {
	span := (&MinimalSpan{SpanID: "0000000000000001", Name: "GET /cart"}).ToWaterfallSpan("t")
	assert.Equal(t, "GET /cart", span.Name)
}
