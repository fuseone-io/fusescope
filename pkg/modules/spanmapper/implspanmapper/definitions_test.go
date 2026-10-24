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
	groups := newEnabledSystemGroup(t, "gen_ai.llm")

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

func TestSystemGroupRegistry_DeploymentEnvironmentName(t *testing.T) {
	testCases := []struct {
		name       string
		group      string
		attributes map[string]any
		resource   map[string]any
		expected   string
	}{
		{name: "LLM_LegacyOnly_Copied", group: "gen_ai.llm", attributes: map[string]any{"gen_ai.request.model": "gpt-4o"}, resource: map[string]any{"deployment.environment": "prod"}, expected: "prod"},
		{name: "LLM_BothPresent_CurrentKept", group: "gen_ai.llm", attributes: map[string]any{"gen_ai.request.model": "gpt-4o"}, resource: map[string]any{"deployment.environment": "old", "deployment.environment.name": "staging"}, expected: "staging"},
		{name: "Tool_LegacyOnly_Copied", group: "gen_ai.tool", attributes: map[string]any{"tool.name": "search"}, resource: map[string]any{"deployment.environment": "qa"}, expected: "qa"},
		{name: "Agent_LegacyOnly_Copied", group: "gen_ai.agent", attributes: map[string]any{"agent.name": "planner"}, resource: map[string]any{"deployment.environment": "dev"}, expected: "dev"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			out, _, err := spantypes.SimulateSpanMappersProcessing(context.Background(), newEnabledSystemGroup(t, testCase.group), []spantypes.SpanMapperTestSpan{{Attributes: testCase.attributes, Resource: testCase.resource}})
			require.NoError(t, err)
			require.Len(t, out, 1)
			assert.Equal(t, testCase.expected, out[0].Resource["deployment.environment.name"])
		})
	}
}

// newEnabledSystemGroup returns the shipped group with every mapper on, as
// the reconciler provisions it.
func newEnabledSystemGroup(t *testing.T, name string) []*spantypes.SpanMapperGroupWithMappers {
	t.Helper()

	registry, err := NewSystemGroupRegistry()
	require.NoError(t, err)

	var definitions []spantypes.PostableSpanMapperTestGroup
	for _, definition := range registry.List() {
		if definition.Name() == name {
			definitions = append(definitions, definition.Definition)
		}
	}
	require.Len(t, definitions, 1)

	groups := spantypes.NewSpanMapperGroupsWithMappersFromPostable(valuer.GenerateUUID(), definitions)
	for _, mapper := range groups[0].Mappers {
		mapper.Enabled = true
	}
	return groups
}
