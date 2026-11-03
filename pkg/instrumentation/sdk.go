package instrumentation

import (
	"context"
	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/tracehandler"
	"github.com/fuseone-io/fusescope/pkg/version"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"go.opentelemetry.io/contrib/otelconf"
	"go.opentelemetry.io/otel"
	sdkmetric "go.opentelemetry.io/otel/metric"
	sdkmetricnoop "go.opentelemetry.io/otel/metric/noop"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
	sdktrace "go.opentelemetry.io/otel/trace"
)

var _ factory.Service = (*SDK)(nil)
var _ Instrumentation = (*SDK)(nil)

// SDK holds the core components for application instrumentation.
type SDK struct {
	logger                    *slog.Logger
	sdk                       otelconf.SDK
	meterProvider             sdkmetric.MeterProvider
	prometheusRegistry        *prometheus.Registry
	meterProviderShutdownFunc func(context.Context) error
	startCh                   chan struct{}
}

// New creates a new Instrumentation instance with configured providers.
// It sets up logging, tracing, and metrics based on the provided configuration.
func New(ctx context.Context, cfg Config, build version.Build, serviceName string) (*SDK, error) {
	// Set default resource attributes if not provided
	if cfg.Resource.Attributes == nil {
		cfg.Resource.Attributes = map[string]any{
			string(semconv.ServiceNameKey):    serviceName,
			string(semconv.ServiceVersionKey): build.Version(),
		}
	}

	// Create a new resource with default detectors.
	// The upstream contrib repository is not taking detectors into account.
	// We are, therefore, using some sensible defaults here.
	resource, err := sdkresource.New(
		ctx,
		sdkresource.WithContainer(),
		sdkresource.WithFromEnv(),
		sdkresource.WithHost(),
	)
	if err != nil {
		return nil, err
	}

	// Prepare the resource configuration by merging
	// resource and attributes.
	// contribsdkconfig merges this resource with sdkresource.Default().
	// The merge fails if the schema URLs are different.
	sch := sdkresource.Default().SchemaURL()
	configResource := otelconf.Resource{
		Attributes: resourceAttributes(mergeAttributes(cfg.Resource.Attributes, resource)),
		SchemaUrl:  &sch,
	}

	prometheusRegistry := prometheus.NewRegistry()
	prometheusRegistry.MustRegister(collectors.NewBuildInfoCollector())

	var tracerProvider *otelconf.TracerProvider
	if cfg.Traces.Enabled {
		tracerProvider, err = cfg.Traces.tracerProvider()
		if err != nil {
			return nil, err
		}
	}

	// Use contrib config approach but with custom Prometheus registry
	var meterProvider sdkmetric.MeterProvider
	var meterProviderShutdownFunc func(context.Context) error
	if cfg.Metrics.Enabled {
		meterProvider, meterProviderShutdownFunc, err = meterProviderWithCustomRegistry(ctx, cfg.Metrics.Readers, resource, prometheusRegistry)
		if err != nil {
			return nil, err
		}
	} else {
		meterProvider = sdkmetricnoop.NewMeterProvider()
		meterProviderShutdownFunc = func(context.Context) error { return nil }
	}

	sdk, err := otelconf.NewSDK(
		otelconf.WithContext(ctx),
		otelconf.WithOpenTelemetryConfiguration(otelconf.OpenTelemetryConfiguration{
			TracerProvider: tracerProvider,
			Resource:       &configResource,
		}),
	)
	if err != nil {
		return nil, err
	}

	// Set the global tracer provider to the sdk tracer provider so that external packages can use this
	otel.SetTracerProvider(tracehandler.New(sdk.TracerProvider(), tracehandler.NewPromQL()))

	return &SDK{
		sdk:                       sdk,
		meterProvider:             meterProvider,
		meterProviderShutdownFunc: meterProviderShutdownFunc,
		prometheusRegistry:        prometheusRegistry,
		logger:                    NewLogger(cfg),
		startCh:                   make(chan struct{}),
	}, nil
}

func (i *SDK) Start(ctx context.Context) error {
	<-i.startCh
	return nil
}

func (i *SDK) Stop(ctx context.Context) error {
	close(i.startCh)
	return errors.Join(
		i.sdk.Shutdown(ctx),
		i.meterProviderShutdownFunc(ctx),
	)
}

func (i *SDK) Logger() *slog.Logger {
	return i.logger
}

func (i *SDK) MeterProvider() sdkmetric.MeterProvider {
	return i.meterProvider
}

func (i *SDK) TracerProvider() sdktrace.TracerProvider {
	return i.sdk.TracerProvider()
}

func (i *SDK) PrometheusRegisterer() prometheus.Registerer {
	return i.prometheusRegistry
}

func (i *SDK) ToProviderSettings() factory.ProviderSettings {
	return factory.ProviderSettings{
		Logger:               i.Logger(),
		MeterProvider:        i.MeterProvider(),
		TracerProvider:       i.TracerProvider(),
		PrometheusRegisterer: i.PrometheusRegisterer(),
	}
}
