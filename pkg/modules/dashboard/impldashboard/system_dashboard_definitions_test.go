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

// The FuseScope collector dashboard reads only the collector's own
// telemetry, so another collector's otelcol_* metrics in the same database,
// such as the earlier collector's, never mix in.
func TestFuseScopeCollectorDashboardIsScopedToTheCollector(t *testing.T) {
	registry, err := NewSystemDashboardRegistry()
	require.NoError(t, err)
	_, ok := registry.Get("signoz---fusescope-collector")
	require.True(t, ok, "the definition parses and is registered")

	raw, err := definitionFiles.ReadFile(definitionsRoot + "/fusescope-collector.json")
	require.NoError(t, err)
	var expressions []string
	collectFilterExpressions(t, raw, &expressions)
	require.NotEmpty(t, expressions)
	for _, expression := range expressions {
		assert.True(t, strings.HasPrefix(expression, "service.name = 'fusescope-collector' AND host.name IN $host"), expression)
	}

	var metricNames []string
	collectMetricNames(t, raw, &metricNames)
	require.NotEmpty(t, metricNames)
	for _, name := range metricNames {
		assert.True(t, strings.HasPrefix(name, "otelcol_"), name)
	}
}

func collectMetricNames(t *testing.T, raw []byte, out *[]string) {
	t.Helper()
	var node any
	require.NoError(t, json.Unmarshal(raw, &node))
	var walk func(any)
	walk = func(n any) {
		switch v := n.(type) {
		case map[string]any:
			if name, ok := v["metricName"].(string); ok {
				*out = append(*out, name)
			}
			for _, child := range v {
				walk(child)
			}
		case []any:
			for _, child := range v {
				walk(child)
			}
		}
	}
	walk(node)
}

// Review of #320: the state KPIs show the latest point, or the peak where
// that is the point, never an average that hides a stale policy now; and
// the collector selector lists only the collectors' hosts.
func TestFuseScopeCollectorDashboardKPIsAndSelector(t *testing.T) {
	raw, err := definitionFiles.ReadFile(definitionsRoot + "/fusescope-collector.json")
	require.NoError(t, err)
	var dashboard struct {
		Definition struct {
			Spec struct {
				Variables []struct {
					Spec struct {
						Name   string `json:"name"`
						Plugin struct {
							Kind string `json:"kind"`
							Spec struct {
								QueryValue string `json:"queryValue"`
							} `json:"spec"`
						} `json:"plugin"`
					} `json:"spec"`
				} `json:"variables"`
				Panels map[string]struct {
					Spec struct {
						Display struct {
							Name string `json:"name"`
						} `json:"display"`
						Queries []struct {
							Spec struct {
								Plugin struct {
									Spec struct {
										Queries []struct {
											Spec struct {
												Aggregations []struct {
													ReduceTo string `json:"reduceTo"`
												} `json:"aggregations"`
											} `json:"spec"`
										} `json:"queries"`
									} `json:"spec"`
								} `json:"plugin"`
							} `json:"spec"`
						} `json:"queries"`
					} `json:"spec"`
				} `json:"panels"`
			} `json:"spec"`
		} `json:"definition"`
	}
	require.NoError(t, json.Unmarshal(raw, &dashboard))

	reduceTo := map[string]string{}
	for _, panel := range dashboard.Definition.Spec.Panels {
		reduceTo[panel.Spec.Display.Name] = panel.Spec.Queries[0].Spec.Plugin.Spec.Queries[0].Spec.Aggregations[0].ReduceTo
	}
	assert.Equal(t, "last", reduceTo["Memory (RSS) now"])
	assert.Equal(t, "last", reduceTo["RUM policy age now"])
	assert.Equal(t, "max", reduceTo["Peak export queue"])

	require.Len(t, dashboard.Definition.Spec.Variables, 1)
	host := dashboard.Definition.Spec.Variables[0].Spec
	assert.Equal(t, "host", host.Name)
	assert.Equal(t, "signoz/QueryVariable", host.Plugin.Kind)
	assert.Contains(t, host.Plugin.Spec.QueryValue, "JSONExtractString(labels, 'service.name') = 'fusescope-collector'")
}
