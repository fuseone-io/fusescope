package spantypes

import (
	"testing"
	"time"

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

func TestAMinimalSpanCarriesItsName(t *testing.T) {
	span := (&MinimalSpan{SpanID: "0000000000000001", Name: "GET /cart"}).ToWaterfallSpan("t")
	assert.Equal(t, "GET /cart", span.Name)
}
