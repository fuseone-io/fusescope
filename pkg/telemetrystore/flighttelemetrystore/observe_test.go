package flighttelemetrystore

import (
	"bytes"
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/attribute"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestPartialReasonsAreBoundedCategories(t *testing.T) {
	assert.Equal(t, []string{telemetrystore.PartialIngesterUnavailable, telemetrystore.PartialUnknown}, partialCategories([]string{
		"ingester a did not answer; recent rows may be missing",
		"ingester b did not answer; recent services may be missing",
		"a reason the engine adds later",
	}))
	assert.Empty(t, partialCategories(nil))
}

type observed struct {
	spans   *tracetest.SpanRecorder
	metrics *sdkmetric.ManualReader
	logs    *bytes.Buffer
}

func openObserved(t *testing.T, bed *testbed) (*provider, observed) {
	o := observed{spans: tracetest.NewSpanRecorder(), metrics: sdkmetric.NewManualReader(), logs: &bytes.Buffer{}}
	settings := factory.ProviderSettings{
		Logger:               slog.New(slog.NewJSONHandler(o.logs, &slog.HandlerOptions{Level: slog.LevelDebug})),
		MeterProvider:        sdkmetric.NewMeterProvider(sdkmetric.WithReader(o.metrics)),
		TracerProvider:       sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(o.spans)),
		PrometheusRegisterer: prometheus.NewRegistry(),
	}
	fallback := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherEqual)
	p, err := newProvider(settings, bed.config, 5*time.Second, fallback, nil, memory.DefaultAllocator)
	require.NoError(t, err)
	t.Cleanup(func() { _ = p.client.Close() })
	return p, o
}

func TestACallIsObservedWithoutItsStatement(t *testing.T) {
	bed := newTestbed(t)
	bed.engine.partial = []string{
		"ingester a did not answer; recent rows may be missing",
		"ingester b did not answer; recent rows may be missing",
	}
	p, o := openObserved(t, bed)
	const statement = "select trace_id, name from spans where service_name = 'secret-tenant-value'"

	rows, err := p.Query(telemetrystore.WithRoute(userContext(), telemetrystore.RouteTracesRaw), statement)
	require.NoError(t, err)
	readAll(t, rows)
	require.NoError(t, rows.Close())

	spans := o.spans.Ended()
	require.Len(t, spans, 1)
	attrs := map[attribute.Key]attribute.Value{}
	for _, kv := range spans[0].Attributes() {
		attrs[kv.Key] = kv.Value
		assert.NotContains(t, kv.Value.String(), "secret-tenant-value", kv.Key)
	}
	assert.Equal(t, "fusescope-engine", attrs["db.system.name"].AsString())
	assert.Equal(t, "query", attrs["db.operation.name"].AsString())
	assert.Equal(t, "traces_raw", attrs["fusescope.engine.route"].AsString())
	assert.Equal(t, int64(len(statement)), attrs["fusescope.engine.statement.bytes"].AsInt64())
	assert.Len(t, attrs["fusescope.engine.statement.sha256"].AsString(), 16)

	assert.NotContains(t, o.logs.String(), "secret-tenant-value")
	assert.Contains(t, o.logs.String(), `"route":"traces_raw"`)
	assert.Contains(t, o.logs.String(), `"outcome":"partial"`)

	var collected metricdata.ResourceMetrics
	require.NoError(t, o.metrics.Collect(context.Background(), &collected))
	sums := map[string][]metricdata.DataPoint[int64]{}
	for _, scope := range collected.ScopeMetrics {
		for _, m := range scope.Metrics {
			if sum, ok := m.Data.(metricdata.Sum[int64]); ok {
				sums[m.Name] = sum.DataPoints
			}
			if m.Name == "fusescope_engine_request_duration_seconds" {
				_, ok := m.Data.(metricdata.Histogram[float64])
				assert.True(t, ok)
			}
		}
	}
	requireLabels(t, sums["fusescope_engine_requests_total"], map[string]string{"route": "traces_raw", "operation": "query", "outcome": "partial"})
	requireLabels(t, sums["fusescope_engine_partial_total"], map[string]string{"route": "traces_raw", "reason": telemetrystore.PartialIngesterUnavailable})
}

// requireLabels wants one point of value 1 with exactly these labels: nothing unbounded rides along.
func requireLabels(t *testing.T, points []metricdata.DataPoint[int64], want map[string]string) {
	t.Helper()
	require.Len(t, points, 1)
	assert.Equal(t, int64(1), points[0].Value)
	got := map[string]string{}
	for _, kv := range points[0].Attributes.ToSlice() {
		got[string(kv.Key)] = kv.Value.String()
	}
	assert.Equal(t, want, got)
}

func TestARefusalIsObservedByItsKind(t *testing.T) {
	bed := newTestbed(t)
	bed.engine.refuse = statusFromDetails(t, engineTooManyRows)
	p, o := openObserved(t, bed)
	_, err := p.Query(userContext(), "select 1")
	require.Error(t, err)
	var collected metricdata.ResourceMetrics
	require.NoError(t, o.metrics.Collect(context.Background(), &collected))
	for _, scope := range collected.ScopeMetrics {
		for _, m := range scope.Metrics {
			if m.Name == "fusescope_engine_requests_total" {
				points := m.Data.(metricdata.Sum[int64]).DataPoints
				requireLabels(t, points, map[string]string{"route": "unrouted", "operation": "query", "outcome": "payload-too-large"})
			}
		}
	}
}
