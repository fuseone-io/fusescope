package implspanmapper

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSystemGroupRegistry_LLMTimeToFirstToken(t *testing.T) {
	registry, err := NewSystemGroupRegistry()
	require.NoError(t, err)

	var llm []spantypes.PostableSpanMapperTestGroup
	for _, definition := range registry.List() {
		if definition.Name() == "gen_ai.llm" {
			llm = append(llm, definition.Definition)
		}
	}
	require.Len(t, llm, 1)
	groups := spantypes.NewSpanMapperGroupsWithMappersFromPostable(valuer.GenerateUUID(), llm)
	for _, mapper := range groups[0].Mappers {
		mapper.Enabled = true
	}

	testCases := []struct {
		name       string
		attributes map[string]any
		expected   float64
	}{
		{name: "OpenLIT_TimeToFirstToken", attributes: map[string]any{"gen_ai.request.model": "gpt-4o", "gen_ai.server.time_to_first_token": 0.42}, expected: 0.42},
		{name: "Semconv_TimeToFirstChunk", attributes: map[string]any{"gen_ai.request.model": "claude-sonnet", "gen_ai.response.time_to_first_chunk": 0.18}, expected: 0.18},
		{name: "Native_TTFTKept", attributes: map[string]any{"gen_ai.request.model": "llama", "gen_ai.server.ttft": 0.3, "gen_ai.response.time_to_first_chunk": 0.9}, expected: 0.3},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			out, _, err := spantypes.SimulateSpanMappersProcessing(context.Background(), groups, []spantypes.SpanMapperTestSpan{{Attributes: testCase.attributes}})
			require.NoError(t, err)
			require.Len(t, out, 1)
			assert.Equal(t, testCase.expected, out[0].Attributes["gen_ai.server.ttft"])
		})
	}
}
