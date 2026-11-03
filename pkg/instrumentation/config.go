package instrumentation

import (
	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/factory"
)

// Config holds the configuration for all instrumentation components.
type Config struct {
	Logs     LogsConfig    `mapstructure:"logs"`
	Traces   TracesConfig  `mapstructure:"traces"`
	Metrics  MetricsConfig `mapstructure:"metrics"`
	Resource Resource      `mapstructure:"resource"`
}

// Resource defines the configuration for OpenTelemetry resource attributes.
type Resource struct {
	Attributes map[string]any `mapstructure:"attributes"`
}

// LogsConfig holds the configuration for the logging component.
type LogsConfig struct {
	Level slog.Level `mapstructure:"level"`
}

// TracesConfig holds the configuration for the tracing component.
type TracesConfig struct {
	Enabled    bool             `mapstructure:"enabled"`
	Processors TracesProcessors `mapstructure:"processors"`
	Sampler    Sampler          `mapstructure:"sampler"`
}

type TracesProcessors struct {
	Batch BatchSpanProcessor `mapstructure:"batch"`
}

// BatchSpanProcessor times are in milliseconds.
type BatchSpanProcessor struct {
	ExportTimeout      *int         `mapstructure:"export_timeout"`
	Exporter           SpanExporter `mapstructure:"exporter"`
	MaxExportBatchSize *int         `mapstructure:"max_export_batch_size"`
	MaxQueueSize       *int         `mapstructure:"max_queue_size"`
	ScheduleDelay      *int         `mapstructure:"schedule_delay"`
}

type SpanExporter struct {
	Console map[string]any `mapstructure:"console"`
	OTLP    *OTLPExporter  `mapstructure:"otlp"`
}

// OTLPExporter's Protocol is "grpc" (the default when empty) or "http/protobuf";
// Timeout is in milliseconds.
type OTLPExporter struct {
	Protocol          string            `mapstructure:"protocol"`
	Endpoint          string            `mapstructure:"endpoint"`
	Headers           map[string]string `mapstructure:"headers"`
	Compression       *string           `mapstructure:"compression"`
	Timeout           *int              `mapstructure:"timeout"`
	Insecure          *bool             `mapstructure:"insecure"`
	Certificate       *string           `mapstructure:"certificate"`
	ClientCertificate *string           `mapstructure:"client_certificate"`
	ClientKey         *string           `mapstructure:"client_key"`
}

type Sampler struct {
	AlwaysOff         map[string]any            `mapstructure:"always_off"`
	AlwaysOn          map[string]any            `mapstructure:"always_on"`
	ParentBased       *ParentBasedSampler       `mapstructure:"parent_based"`
	TraceIDRatioBased *TraceIDRatioBasedSampler `mapstructure:"trace_id_ratio_based"`
}

type ParentBasedSampler struct {
	Root                   *Sampler `mapstructure:"root"`
	RemoteParentSampled    *Sampler `mapstructure:"remote_parent_sampled"`
	RemoteParentNotSampled *Sampler `mapstructure:"remote_parent_not_sampled"`
	LocalParentSampled     *Sampler `mapstructure:"local_parent_sampled"`
	LocalParentNotSampled  *Sampler `mapstructure:"local_parent_not_sampled"`
}

type TraceIDRatioBasedSampler struct {
	Ratio *float64 `mapstructure:"ratio"`
}

// MetricsConfig holds the configuration for the metrics component.
type MetricsConfig struct {
	Enabled bool           `mapstructure:"enabled"`
	Readers MetricsReaders `mapstructure:"readers"`
}

type MetricsReaders struct {
	Pull PullMetricReader `mapstructure:"pull"`
}

type PullMetricReader struct {
	Exporter MetricExporter `mapstructure:"exporter"`
}

type MetricExporter struct {
	Prometheus *PrometheusExporter `mapstructure:"prometheus"`
}

type PrometheusExporter struct {
	Host                       *string         `mapstructure:"host"`
	Port                       *int            `mapstructure:"port"`
	WithResourceConstantLabels *IncludeExclude `mapstructure:"with_resource_constant_labels"`
	WithoutScopeInfo           *bool           `mapstructure:"without_scope_info"`
	WithoutTypeSuffix          *bool           `mapstructure:"without_type_suffix"`
	WithoutUnits               *bool           `mapstructure:"without_units"`
}

type IncludeExclude struct {
	Included []string `mapstructure:"included"`
	Excluded []string `mapstructure:"excluded"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("instrumentation"), newConfig)
}

func newConfig() factory.Config {
	host := "0.0.0.0"
	port := 9090

	return Config{
		Logs: LogsConfig{
			Level: slog.LevelInfo,
		},
		Traces: TracesConfig{
			Enabled: false,
		},
		Metrics: MetricsConfig{
			Enabled: true,
			Readers: MetricsReaders{
				Pull: PullMetricReader{
					Exporter: MetricExporter{
						Prometheus: &PrometheusExporter{
							Host: &host,
							Port: &port,
						},
					},
				},
			},
		},
	}

}

func (c Config) Validate() error {
	return nil
}
