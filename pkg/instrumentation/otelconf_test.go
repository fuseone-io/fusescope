package instrumentation

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/version"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/contrib/otelconf"
)

func TestTracesConfigTracerProvider(t *testing.T) {
	endpoint := "localhost:4317"
	httpEndpoint := "http://localhost:4318/v1/traces"
	insecure := true
	timeout := 5000
	queue := 2048
	ratio := 0.25
	gzip := "gzip"

	testCases := []struct {
		name   string
		config TracesConfig
		want   *otelconf.TracerProvider
		err    bool
	}{
		{
			name: "OTLPWithoutProtocolUsesGRPC",
			config: TracesConfig{Processors: TracesProcessors{Batch: BatchSpanProcessor{
				MaxQueueSize: &queue,
				Exporter:     SpanExporter{OTLP: &OTLPExporter{Endpoint: endpoint, Insecure: &insecure, Headers: map[string]string{"k": "v"}}},
			}}},
			want: &otelconf.TracerProvider{Processors: []otelconf.SpanProcessor{{Batch: &otelconf.BatchSpanProcessor{
				MaxQueueSize: &queue,
				Exporter: otelconf.SpanExporter{OTLPGrpc: &otelconf.OTLPGrpcExporter{
					Endpoint: &endpoint,
					Tls:      &otelconf.GrpcTls{Insecure: &insecure},
					Headers:  []otelconf.NameStringValuePair{{Name: "k", Value: ptr("v")}},
				}},
			}}}},
		},
		{
			name: "OTLPHTTP",
			config: TracesConfig{Processors: TracesProcessors{Batch: BatchSpanProcessor{
				Exporter: SpanExporter{OTLP: &OTLPExporter{Protocol: "http/protobuf", Endpoint: httpEndpoint, Timeout: &timeout, Compression: &gzip}},
			}}},
			want: &otelconf.TracerProvider{Processors: []otelconf.SpanProcessor{{Batch: &otelconf.BatchSpanProcessor{
				Exporter: otelconf.SpanExporter{OTLPHttp: &otelconf.OTLPHttpExporter{
					Endpoint:    &httpEndpoint,
					Timeout:     &timeout,
					Compression: &gzip,
				}},
			}}}},
		},
		{
			name: "ParentBasedRatioSampler",
			config: TracesConfig{Sampler: Sampler{ParentBased: &ParentBasedSampler{
				Root: &Sampler{TraceIDRatioBased: &TraceIDRatioBasedSampler{Ratio: &ratio}},
			}}},
			want: &otelconf.TracerProvider{Sampler: &otelconf.Sampler{ParentBased: &otelconf.ParentBasedSampler{
				Root: &otelconf.Sampler{TraceIDRatioBased: &otelconf.TraceIDRatioBasedSampler{Ratio: &ratio}},
			}}},
		},
		{
			name: "UnknownProtocol",
			config: TracesConfig{Processors: TracesProcessors{Batch: BatchSpanProcessor{
				Exporter: SpanExporter{OTLP: &OTLPExporter{Protocol: "thrift", Endpoint: endpoint}},
			}}},
			err: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := testCase.config.tracerProvider()
			if testCase.err {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}

func TestResourceAttributes(t *testing.T) {
	got := resourceAttributes(map[string]any{"service.name": "fusescope", "deployment.environment.name": "dev"})

	assert.Equal(t, []otelconf.AttributeNameValue{
		{Name: "deployment.environment.name", Value: "dev"},
		{Name: "service.name", Value: "fusescope"},
	}, got)
}

func ptr[T any](v T) *T {
	return &v
}

func TestNewWithExampleTraces(t *testing.T) {
	cfg := NewConfigFactory().New().(Config)
	cfg.Traces.Enabled = true
	cfg.Traces.Processors.Batch.Exporter.OTLP = &OTLPExporter{Endpoint: "localhost:4317"}
	cfg.Metrics.Readers.Pull.Exporter.Prometheus.Port = ptr(0)

	sdk, err := New(context.Background(), cfg, version.Info, "fusescope")
	require.NoError(t, err)
	assert.NotNil(t, sdk.TracerProvider())
	require.NoError(t, sdk.sdk.Shutdown(context.Background()))
	require.NoError(t, sdk.meterProviderShutdownFunc(context.Background()))
}
