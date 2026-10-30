package signoz

import (
	"github.com/fuseone-io/fusescope/pkg/alertmanager"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/signozalertmanager"
	"github.com/fuseone-io/fusescope/pkg/analytics"
	"github.com/fuseone-io/fusescope/pkg/authz"
	"github.com/fuseone-io/fusescope/pkg/authz/signozauthzapi"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/gateway"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/global/signozglobal"
	"github.com/fuseone-io/fusescope/pkg/licensing"
	"github.com/fuseone-io/fusescope/pkg/modules/aiobservability"
	"github.com/fuseone-io/fusescope/pkg/modules/aiobservability/implaiobservability"
	"github.com/fuseone-io/fusescope/pkg/modules/apdex"
	"github.com/fuseone-io/fusescope/pkg/modules/apdex/implapdex"
	"github.com/fuseone-io/fusescope/pkg/modules/cloudintegration"
	"github.com/fuseone-io/fusescope/pkg/modules/cloudintegration/implcloudintegration"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard/impldashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/fields"
	"github.com/fuseone-io/fusescope/pkg/modules/fields/implfields"
	"github.com/fuseone-io/fusescope/pkg/modules/inframonitoring"
	"github.com/fuseone-io/fusescope/pkg/modules/inframonitoring/implinframonitoring"
	"github.com/fuseone-io/fusescope/pkg/modules/llmpricingrule"
	"github.com/fuseone-io/fusescope/pkg/modules/llmpricingrule/impllmpricingrule"
	"github.com/fuseone-io/fusescope/pkg/modules/metricreductionrule"
	"github.com/fuseone-io/fusescope/pkg/modules/metricreductionrule/implmetricreductionrule"
	"github.com/fuseone-io/fusescope/pkg/modules/metricsexplorer"
	"github.com/fuseone-io/fusescope/pkg/modules/metricsexplorer/implmetricsexplorer"
	"github.com/fuseone-io/fusescope/pkg/modules/onboarding"
	"github.com/fuseone-io/fusescope/pkg/modules/onboarding/implonboarding"
	"github.com/fuseone-io/fusescope/pkg/modules/quickfilter"
	"github.com/fuseone-io/fusescope/pkg/modules/quickfilter/implquickfilter"
	"github.com/fuseone-io/fusescope/pkg/modules/rawdataexport"
	"github.com/fuseone-io/fusescope/pkg/modules/rawdataexport/implrawdataexport"
	"github.com/fuseone-io/fusescope/pkg/modules/rulestatehistory"
	"github.com/fuseone-io/fusescope/pkg/modules/rulestatehistory/implrulestatehistory"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication/implrumapplication"
	"github.com/fuseone-io/fusescope/pkg/modules/savedview"
	"github.com/fuseone-io/fusescope/pkg/modules/savedview/implsavedview"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount/implserviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/services"
	"github.com/fuseone-io/fusescope/pkg/modules/services/implservices"
	"github.com/fuseone-io/fusescope/pkg/modules/spanmapper"
	"github.com/fuseone-io/fusescope/pkg/modules/spanmapper/implspanmapper"
	"github.com/fuseone-io/fusescope/pkg/modules/spanpercentile"
	"github.com/fuseone-io/fusescope/pkg/modules/spanpercentile/implspanpercentile"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail/impltracedetail"
	"github.com/fuseone-io/fusescope/pkg/modules/tracefunnel"
	"github.com/fuseone-io/fusescope/pkg/modules/tracefunnel/impltracefunnel"
	"github.com/fuseone-io/fusescope/pkg/prometheus"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/ruler"
	"github.com/fuseone-io/fusescope/pkg/ruler/signozruler"
	"github.com/fuseone-io/fusescope/pkg/statsreporter"
	"github.com/fuseone-io/fusescope/pkg/subscription"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/zeus"
)

type Handlers struct {
	SavedView               savedview.Handler
	Apdex                   apdex.Handler
	Dashboard               dashboard.Handler
	QuickFilter             quickfilter.Handler
	TraceFunnel             tracefunnel.Handler
	RawDataExport           rawdataexport.Handler
	SpanPercentile          spanpercentile.Handler
	Services                services.Handler
	MetricsExplorer         metricsexplorer.Handler
	MetricReductionRule     metricreductionrule.Handler
	InfraMonitoring         inframonitoring.Handler
	Global                  global.Handler
	FlaggerHandler          flagger.Handler
	GatewayHandler          gateway.Handler
	Fields                  fields.Handler
	AIObservability         aiobservability.Handler
	AuthzHandler            authz.Handler
	ZeusHandler             zeus.Handler
	LicensingHandler        licensing.Handler
	SubscriptionHandler     subscription.Handler
	QuerierHandler          querier.Handler
	ServiceAccountHandler   serviceaccount.Handler
	RegistryHandler         factory.Handler
	CloudIntegrationHandler cloudintegration.Handler
	RuleStateHistory        rulestatehistory.Handler
	SpanMapperHandler       spanmapper.Handler
	AlertmanagerHandler     alertmanager.Handler
	PrometheusHandler       prometheus.Handler
	TraceDetail             tracedetail.Handler
	RulerHandler            ruler.Handler
	LLMPricingRuleHandler   llmpricingrule.Handler
	StatsHandler            statsreporter.Handler
	RUMApplicationHandler   rumapplication.Handler
	RUMGateway              rumapplication.Gateway
	Onboarding              onboarding.Handler
}

func NewHandlers(
	modules Modules,
	providerSettings factory.ProviderSettings,
	analytics analytics.Analytics,
	querierHandler querier.Handler,
	licensingService licensing.Licensing,
	global global.Global,
	flaggerService flagger.Flagger,
	gatewayService gateway.Gateway,
	telemetryMetadataStore telemetrytypes.MetadataStore,
	authz authz.AuthZ,
	zeusService zeus.Zeus,
	subscriptionService subscription.Subscription,
	registryHandler factory.Handler,
	alertmanagerService alertmanager.Alertmanager,
	prometheusService prometheus.Prometheus,
	rulerService ruler.Ruler,
	statsAggregator statsreporter.Aggregator,
	rumConfig rumapplication.Config,
	dashboardConfig dashboard.Config,
) Handlers {
	return Handlers{
		SavedView:               implsavedview.NewHandler(modules.SavedView),
		Apdex:                   implapdex.NewHandler(modules.Apdex),
		Dashboard:               impldashboard.NewHandler(modules.Dashboard, providerSettings, authz, dashboardConfig.Public.RateLimit, rumConfig.RateLimit.TrustForwardedFor),
		QuickFilter:             implquickfilter.NewHandler(modules.QuickFilter),
		TraceFunnel:             impltracefunnel.NewHandler(modules.TraceFunnel),
		RawDataExport:           implrawdataexport.NewHandler(modules.RawDataExport),
		Services:                implservices.NewHandler(modules.Services),
		MetricsExplorer:         implmetricsexplorer.NewHandler(modules.MetricsExplorer),
		MetricReductionRule:     implmetricreductionrule.NewHandler(modules.MetricReductionRule),
		InfraMonitoring:         implinframonitoring.NewHandler(modules.InfraMonitoring),
		SpanPercentile:          implspanpercentile.NewHandler(modules.SpanPercentile),
		Global:                  signozglobal.NewHandler(global),
		FlaggerHandler:          flagger.NewHandler(flaggerService),
		GatewayHandler:          gateway.NewHandler(gatewayService),
		Fields:                  implfields.NewHandler(providerSettings, telemetryMetadataStore),
		AIObservability:         implaiobservability.NewHandler(providerSettings, telemetryMetadataStore),
		AuthzHandler:            signozauthzapi.NewHandler(authz),
		ZeusHandler:             zeus.NewHandler(zeusService, licensingService),
		LicensingHandler:        licensing.NewHandler(licensingService),
		SubscriptionHandler:     subscription.NewHandler(subscriptionService),
		QuerierHandler:          querierHandler,
		ServiceAccountHandler:   implserviceaccount.NewHandler(modules.ServiceAccount, modules.ServiceAccountGetter),
		RegistryHandler:         registryHandler,
		RuleStateHistory:        implrulestatehistory.NewHandler(modules.RuleStateHistory),
		CloudIntegrationHandler: implcloudintegration.NewHandler(modules.CloudIntegration),
		SpanMapperHandler:       implspanmapper.NewHandler(modules.SpanMapper),
		AlertmanagerHandler:     signozalertmanager.NewHandler(alertmanagerService),
		PrometheusHandler:       prometheus.NewHandler(providerSettings.Logger, prometheusService),
		TraceDetail:             impltracedetail.NewHandler(modules.TraceDetail),
		RulerHandler:            signozruler.NewHandler(rulerService),
		LLMPricingRuleHandler:   impllmpricingrule.NewHandler(modules.LLMPricingRule),
		StatsHandler:            statsreporter.NewHandler(statsAggregator),
		RUMApplicationHandler:   implrumapplication.NewHandler(modules.RUMApplication),
		RUMGateway:              implrumapplication.NewGateway(modules.RUMApplication, rumConfig, providerSettings),
		Onboarding:              implonboarding.NewHandler(modules.Onboarding),
	}
}
