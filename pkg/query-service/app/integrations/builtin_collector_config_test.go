package integrations

import (
	"context"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

var yamlBlockPattern = regexp.MustCompile("(?s)```yaml\n(.*?)```")

type cloudWatchExporterSnippet struct {
	Metrics []struct {
		Namespace  string `yaml:"aws_namespace"`
		MetricName string `yaml:"aws_metric_name"`
	} `yaml:"metrics"`
}

type collectorConfigSnippet struct {
	Receivers  map[string]any `yaml:"receivers"`
	Processors map[string]any `yaml:"processors"`
	Exporters  map[string]struct {
		Endpoint string         `yaml:"endpoint"`
		Headers  map[string]any `yaml:"headers"`
	} `yaml:"exporters"`
	Service struct {
		Pipelines map[string]struct {
			Receivers  []string `yaml:"receivers"`
			Processors []string `yaml:"processors"`
			Exporters  []string `yaml:"exporters"`
		} `yaml:"pipelines"`
	} `yaml:"service"`
}

func TestBuiltinIntegrationsCollectorConfigs(t *testing.T) {
	repo := BuiltInIntegrations{}
	builtins, apiErr := repo.list(context.Background())
	require.Nil(t, apiErr)

	snippets := 0
	for _, integration := range builtins {
		for _, step := range integration.Configuration {
			t.Run(integration.Id+"_"+step.Title, func(t *testing.T) {
				for _, forbidden := range []string{"signoz-access-token", "SIGNOZ_INGESTION_KEY", "pgtestdb"} {
					assert.Falsef(t, strings.Contains(step.Instructions, forbidden), "mentions %q", forbidden)
				}

				for _, match := range yamlBlockPattern.FindAllStringSubmatch(step.Instructions, -1) {
					var cloudWatch cloudWatchExporterSnippet
					if yaml.Unmarshal([]byte(match[1]), &cloudWatch) == nil {
						seen := map[string]bool{}
						for _, metric := range cloudWatch.Metrics {
							key := metric.Namespace + "/" + metric.MetricName
							assert.Falsef(t, seen[key], "CloudWatch metric %s listed twice", key)
							seen[key] = true
						}
					}

					var config collectorConfigSnippet
					require.NoError(t, yaml.Unmarshal([]byte(match[1]), &config))
					if len(config.Service.Pipelines) == 0 {
						continue
					}
					snippets++

					require.Len(t, config.Exporters, 1)
					exporter, ok := config.Exporters["otlp/fusescope"]
					require.True(t, ok, "the only exporter must be otlp/fusescope")
					assert.Equal(t, "${env:OTLP_DESTINATION_ENDPOINT}", exporter.Endpoint)
					assert.Empty(t, exporter.Headers)

					for name, pipeline := range config.Service.Pipelines {
						assert.Equal(t, []string{"otlp/fusescope"}, pipeline.Exporters, name)
						for _, receiver := range pipeline.Receivers {
							assert.Contains(t, config.Receivers, receiver, name)
						}
						for _, processor := range pipeline.Processors {
							assert.Contains(t, config.Processors, processor, name)
						}
					}
				}
			})
		}
	}
	assert.Positive(t, snippets)
}
