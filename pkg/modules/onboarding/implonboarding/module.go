package implonboarding

import (
	"context"
	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/modules/onboarding"
	"github.com/fuseone-io/fusescope/pkg/modules/preference"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/onboardingtypes"
	"github.com/fuseone-io/fusescope/pkg/types/preferencetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type module struct {
	telemetry    *telemetryReader
	preference   preference.Module
	globalConfig global.Config
	collector    *collectorProbe
	logger       *slog.Logger
}

// NewModule takes the collector endpoint to probe, empty when unknown.
func NewModule(telemetryStore telemetrystore.TelemetryStore, preference preference.Module, globalConfig global.Config, collectorEndpoint string, providerSettings factory.ProviderSettings) onboarding.Module {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/onboarding/implonboarding")
	return &module{
		telemetry:    newTelemetryReader(telemetryStore),
		preference:   preference,
		globalConfig: globalConfig,
		collector:    newCollectorProbe(collectorEndpoint),
		logger:       settings.Logger(),
	}
}

func (module *module) GetStatus(ctx context.Context, query onboardingtypes.StatusQuery) (*onboardingtypes.Status, error) {
	status := onboardingtypes.NewStatus(query)

	for _, signal := range query.Signals {
		var err error
		switch signal {
		case onboardingtypes.SignalTraces:
			status.Traces, err = module.telemetry.Traces(ctx, query)
		case onboardingtypes.SignalMetrics:
			status.Metrics, err = module.telemetry.Metrics(ctx, query)
		case onboardingtypes.SignalLogs:
			status.Logs, err = module.telemetry.Logs(ctx, query)
		}
		if err != nil {
			return nil, err
		}
	}

	return status, nil
}

func (module *module) GetIngestion(ctx context.Context, orgID valuer.UUID, requestHost string) (*onboardingtypes.Ingestion, error) {
	stored, err := module.preference.GetByOrg(ctx, orgID, preferencetypes.NameIngestionURL)
	if err != nil {
		return nil, err
	}
	organizationURL, _ := stored.Value.GoValue().(string)

	ingestion := onboardingtypes.NewIngestion(organizationURL, module.globalConfig.IngestionURL, module.globalConfig.ExternalURL, requestHost)
	if module.collector != nil {
		ingestion.Collector = module.collector.Check(ctx)
	}

	return ingestion, nil
}

func (module *module) UpdateIngestion(ctx context.Context, orgID valuer.UUID, requestHost string, updatable *onboardingtypes.UpdatableIngestion) (*onboardingtypes.Ingestion, error) {
	normalized, err := updatable.Normalize()
	if err != nil {
		return nil, err
	}

	if err := module.preference.UpdateByOrg(ctx, orgID, preferencetypes.NameIngestionURL, normalized); err != nil {
		return nil, err
	}
	module.logger.InfoContext(ctx, "ingestion url updated", slog.String("org_id", orgID.StringValue()), slog.Bool("cleared", normalized == ""))

	return module.GetIngestion(ctx, orgID, requestHost)
}
