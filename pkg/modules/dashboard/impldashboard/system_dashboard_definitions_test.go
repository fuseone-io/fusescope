package impldashboard

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAIObservabilityOverview_EnvironmentPrefersCurrentSemconvName(t *testing.T) {
	raw, err := definitionFiles.ReadFile(definitionsRoot + "/ai-o11y-overview.json")
	require.NoError(t, err)

	var dashboard struct {
		Definition struct {
			Spec struct {
				Variables []struct {
					Spec struct {
						Name   string `json:"name"`
						Plugin struct {
							Spec struct {
								Name string `json:"name"`
							} `json:"spec"`
						} `json:"plugin"`
					} `json:"spec"`
				} `json:"variables"`
			} `json:"spec"`
		} `json:"definition"`
	}
	require.NoError(t, json.Unmarshal(raw, &dashboard))

	var environmentKey string
	for _, variable := range dashboard.Definition.Spec.Variables {
		if variable.Spec.Name == "environment" {
			environmentKey = variable.Spec.Plugin.Spec.Name
		}
	}
	assert.Equal(t, "deployment.environment.name", environmentKey)

	var expressions []string
	collectFilterExpressions(t, raw, &expressions)
	withEnvironment := 0
	for _, expression := range expressions {
		if !strings.Contains(expression, "$environment") {
			continue
		}
		withEnvironment++
		assert.Contains(t, expression, "(deployment.environment.name IN $environment OR (deployment.environment.name NOT EXISTS AND deployment.environment IN $environment))")
	}
	assert.Positive(t, withEnvironment)
}

func collectFilterExpressions(t *testing.T, raw []byte, out *[]string) {
	t.Helper()

	var node any
	require.NoError(t, json.Unmarshal(raw, &node))

	var walk func(any)
	walk = func(value any) {
		switch typed := value.(type) {
		case map[string]any:
			if filter, ok := typed["filter"].(map[string]any); ok {
				if expression, ok := filter["expression"].(string); ok {
					*out = append(*out, expression)
				}
			}
			for _, child := range typed {
				walk(child)
			}
		case []any:
			for _, child := range typed {
				walk(child)
			}
		}
	}
	walk(node)
}
