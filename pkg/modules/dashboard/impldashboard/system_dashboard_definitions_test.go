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

// The ClickHouse writes section reads fusescope_clickhouse's own telemetry
// (fusescope-collector-server#57): percentiles of the insert histogram are
// taken on its buckets with no time aggregation, as the APM latency is.
func TestFuseScopeCollectorDashboardClickHouseWrites(t *testing.T) {
	raw, err := definitionFiles.ReadFile(definitionsRoot + "/fusescope-collector.json")
	require.NoError(t, err)
	var dashboard struct {
		Version    int `json:"version"`
		Definition struct {
			Spec struct {
				Panels map[string]struct {
					Spec struct {
						Display struct {
							Name string `json:"name"`
						} `json:"display"`
						Plugin struct {
							Spec struct {
								Formatting struct {
									Unit string `json:"unit"`
								} `json:"formatting"`
							} `json:"spec"`
						} `json:"plugin"`
						Queries []struct {
							Spec struct {
								Plugin struct {
									Spec struct {
										Queries []struct {
											Spec struct {
												Aggregations []struct {
													MetricName       string `json:"metricName"`
													TimeAggregation  string `json:"timeAggregation"`
													SpaceAggregation string `json:"spaceAggregation"`
												} `json:"aggregations"`
												GroupBy []struct {
													Name string `json:"name"`
												} `json:"groupBy"`
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
	assert.GreaterOrEqual(t, dashboard.Version, 2, "a provisioned dashboard is upgraded only on a higher version")

	byName := map[string][]string{}
	units := map[string]string{}
	for _, panel := range dashboard.Definition.Spec.Panels {
		units[panel.Spec.Display.Name] = panel.Spec.Plugin.Spec.Formatting.Unit
		for _, query := range panel.Spec.Queries[0].Spec.Plugin.Spec.Queries {
			aggregation := query.Spec.Aggregations[0]
			groups := []string{}
			for _, group := range query.Spec.GroupBy {
				groups = append(groups, group.Name)
			}
			byName[panel.Spec.Display.Name] = append(byName[panel.Spec.Display.Name], aggregation.MetricName+" "+aggregation.TimeAggregation+"/"+aggregation.SpaceAggregation+" "+strings.Join(groups, ","))
		}
	}
	const insert = "otelcol_exporter_fusescope_clickhouse_insert_duration.bucket"
	assert.Equal(t, []string{insert + " /p95 table"}, byName["Insert latency by table (p95)"])
	assert.Equal(t, []string{insert + " /p50 ", insert + " /p95 ", insert + " /p99 "}, byName["Insert latency"])
	assert.Equal(t, []string{"otelcol_exporter_fusescope_clickhouse_inserted_rows rate/sum table"}, byName["Rows inserted by table"])
	assert.Equal(t, []string{"otelcol_exporter_fusescope_clickhouse_insert_errors rate/sum table,outcome"}, byName["Insert errors by table"])

	// Review of #327: rows and failed attempts are not requests.
	assert.Equal(t, "s", units["Insert latency by table (p95)"])
	assert.Equal(t, "s", units["Insert latency"])
	assert.Equal(t, "cps", units["Rows inserted by table"], "count/s")
	assert.Equal(t, "ops", units["Insert errors by table"], "ops/s")
}

// Review of #327: each panel's unit, by name. Spans, log records, metric
// points, processor items and rows are counts per second (cps), failed
// insert attempts are operations per second (ops); none of them is a
// request. A panel added or renamed has to be added here.
func TestFuseScopeCollectorDashboardUnits(t *testing.T) {
	raw, err := definitionFiles.ReadFile(definitionsRoot + "/fusescope-collector.json")
	require.NoError(t, err)
	var dashboard struct {
		Definition struct {
			Spec struct {
				Panels map[string]struct {
					Spec struct {
						Display struct {
							Name string `json:"name"`
						} `json:"display"`
						Plugin struct {
							Spec struct {
								Formatting struct {
									Unit string `json:"unit"`
								} `json:"formatting"`
							} `json:"spec"`
						} `json:"plugin"`
					} `json:"spec"`
				} `json:"panels"`
			} `json:"spec"`
		} `json:"definition"`
	}
	require.NoError(t, json.Unmarshal(raw, &dashboard))
	units := map[string]string{}
	for _, panel := range dashboard.Definition.Spec.Panels {
		units[panel.Spec.Display.Name] = panel.Spec.Plugin.Spec.Formatting.Unit
	}
	assert.Equal(t, map[string]string{
		"Spans accepted":                     "cps",
		"Log records accepted":               "cps",
		"Spans refused":                      "cps",
		"Peak export queue":                  "none",
		"Memory (RSS) now":                   "bytes",
		"RUM policy age now":                 "s",
		"Spans accepted by receiver":         "cps",
		"Log records accepted by receiver":   "cps",
		"Metric points accepted by receiver": "cps",
		"Sent by exporter":                   "cps",
		"Refused by receiver":                "cps",
		"Failed by receiver":                 "cps",
		"Failed to send by exporter":         "cps",
		"Memory limiter accepted":            "cps",
		"Queue size by exporter":             "none",
		"Queue capacity by exporter":         "none",
		"Requests in flight by exporter":     "none",
		"Processor throughput":               "cps",
		"Insert latency by table (p95)":      "s",
		"Insert latency":                     "s",
		"Rows inserted by table":             "cps",
		"Insert errors by table":             "ops",
		"CPU":                                "none",
		"Memory (RSS)":                       "bytes",
		"Go heap":                            "bytes",
		"Uptime":                             "s",
	}, units)
}
