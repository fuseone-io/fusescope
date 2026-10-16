package rules

import (
	"context"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/aistatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/logsstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/metricsstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/tracesstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes/telemetrytypestest"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
)

func prepareQuerierForMetrics(t *testing.T, telemetryStore telemetrystore.TelemetryStore) (querier.Querier, *telemetrytypestest.MockMetadataStore) {
	providerSettings := instrumentationtest.New().ToProviderSettings()
	metadataStore := telemetrytypestest.NewMockMetadataStore()

	fl, err := flagger.New(
		context.Background(),
		instrumentationtest.New().ToProviderSettings(),
		flagger.Config{},
		flagger.MustNewRegistry(),
	)
	require.NoError(t, err)

	metricStmtBuilder, err := metricsstatementbuilder.NewFactory(metadataStore, fl).New(context.Background(), providerSettings, statementbuilder.Config{})
	require.NoError(t, err)

	return querier.New(
		providerSettings,
		telemetryStore,
		metadataStore,
		nil, // prometheus
		nil, // traceStmtBuilder
		nil, // aiTraceStmtBuilder
		nil, // logStmtBuilder
		nil, // auditStmtBuilder
		metricStmtBuilder,
		nil, // meterStmtBuilder
		nil, // traceOperatorStmtBuilder
		nil, // bucketCache
		fl,
		0,
		0, // maxConcurrentQueries (0 means default)
	), metadataStore
}

func prepareQuerierForLogs(t *testing.T, telemetryStore telemetrystore.TelemetryStore, keysMap map[string][]*telemetrytypes.TelemetryFieldKey) querier.Querier {
	t.Helper()
	providerSettings := instrumentationtest.New().ToProviderSettings()
	metadataStore := telemetrytypestest.NewMockMetadataStore()

	for _, keys := range keysMap {
		for _, key := range keys {
			key.Signal = telemetrytypes.SignalLogs
		}
	}
	metadataStore.KeysMap = keysMap

	fl := flaggertest.New(t)
	logStmtBuilder, err := logsstatementbuilder.NewFactory(nil, metadataStore, fl).New(context.Background(), providerSettings, statementbuilder.Config{})
	require.NoError(t, err)

	return querier.New(
		providerSettings,
		telemetryStore,
		metadataStore,
		nil, // prometheus
		nil, // traceStmtBuilder
		nil, // aiTraceStmtBuilder
		logStmtBuilder,
		nil, // auditStmtBuilder
		nil, // metricStmtBuilder
		nil, // meterStmtBuilder
		nil, // traceOperatorStmtBuilder
		nil, // bucketCache
		fl,
		5*time.Minute, // logTraceIDWindowPadding
		0,             // maxConcurrentQueries (0 means default)
	)
}

func prepareQuerierForTraces(t *testing.T, telemetryStore telemetrystore.TelemetryStore, keysMap map[string][]*telemetrytypes.TelemetryFieldKey) querier.Querier {
	t.Helper()

	providerSettings := instrumentationtest.New().ToProviderSettings()
	metadataStore := telemetrytypestest.NewMockMetadataStore()

	for _, keys := range keysMap {
		for _, key := range keys {
			key.Signal = telemetrytypes.SignalTraces
		}
	}
	metadataStore.KeysMap = keysMap

	fl := flaggertest.New(t)
	traceStmtBuilder, err := tracesstatementbuilder.NewFactory(telemetryStore, metadataStore, fl).New(context.Background(), providerSettings, statementbuilder.Config{})
	require.NoError(t, err)

	return querier.New(
		providerSettings,
		telemetryStore,
		metadataStore,
		nil, // prometheus
		traceStmtBuilder,
		nil, // aiTraceStmtBuilder
		nil, // logStmtBuilder
		nil, // auditStmtBuilder
		nil, // metricStmtBuilder
		nil, // meterStmtBuilder
		nil, // traceOperatorStmtBuilder
		nil, // bucketCache
		fl,
		0,
		0, // maxConcurrentQueries (0 means default)
	)
}

func prepareQuerierForAITraces(t *testing.T, telemetryStore telemetrystore.TelemetryStore, keysMap map[string][]*telemetrytypes.TelemetryFieldKey) querier.Querier {
	t.Helper()

	providerSettings := instrumentationtest.New().ToProviderSettings()
	metadataStore := telemetrytypestest.NewMockMetadataStore()

	for _, keys := range keysMap {
		for _, key := range keys {
			key.Signal = telemetrytypes.SignalTraces
		}
	}
	metadataStore.KeysMap = keysMap

	fl := flaggertest.New(t)
	aiTraceStmtBuilder, err := aistatementbuilder.NewFactory(telemetryStore, metadataStore, fl).New(context.Background(), providerSettings, statementbuilder.Config{})
	require.NoError(t, err)

	return querier.New(
		providerSettings,
		telemetryStore,
		metadataStore,
		nil, // prometheus
		nil, // traceStmtBuilder
		aiTraceStmtBuilder,
		nil, // logStmtBuilder
		nil, // auditStmtBuilder
		nil, // metricStmtBuilder
		nil, // meterStmtBuilder
		nil, // traceOperatorStmtBuilder
		nil, // bucketCache
		fl,
		0,
		0, // maxConcurrentQueries (0 means default)
	)
}
