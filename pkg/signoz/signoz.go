package signoz

import (
	"context"
	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/alertmanager"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/alertmanagerstore/sqlalertmanagerstore"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/nfmanager"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/nfmanager/nfroutingstore/sqlroutingstore"
	"github.com/fuseone-io/fusescope/pkg/analytics"
	"github.com/fuseone-io/fusescope/pkg/apiserver"
	"github.com/fuseone-io/fusescope/pkg/auditor"
	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/authn/authnstore/sqlauthnstore"
	"github.com/fuseone-io/fusescope/pkg/authz"
	"github.com/fuseone-io/fusescope/pkg/cache"
	"github.com/fuseone-io/fusescope/pkg/emailing"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/gateway"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/identn"
	"github.com/fuseone-io/fusescope/pkg/instrumentation"
	"github.com/fuseone-io/fusescope/pkg/licensing"
	"github.com/fuseone-io/fusescope/pkg/meterreporter"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain/implauthdomain"
	"github.com/fuseone-io/fusescope/pkg/modules/cloudintegration"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard/impldashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/metricreductionrule"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/implorganization"
	"github.com/fuseone-io/fusescope/pkg/modules/retention"
	"github.com/fuseone-io/fusescope/pkg/modules/retention/implretention"
	"github.com/fuseone-io/fusescope/pkg/modules/rulestatehistory"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication/implrumapplication"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount/implserviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/spanmapper/implspanmapper"
	"github.com/fuseone-io/fusescope/pkg/modules/tag"
	"github.com/fuseone-io/fusescope/pkg/modules/tag/impltag"
	"github.com/fuseone-io/fusescope/pkg/modules/user/impluser"
	"github.com/fuseone-io/fusescope/pkg/prometheus"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/queryparser"
	"github.com/fuseone-io/fusescope/pkg/ruler"
	"github.com/fuseone-io/fusescope/pkg/sharder"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration"
	"github.com/fuseone-io/fusescope/pkg/sqlmigrator"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/aistatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/auditstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/logsstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/meterstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/metricsstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statementbuilder/tracesstatementbuilder"
	"github.com/fuseone-io/fusescope/pkg/statsreporter"
	"github.com/fuseone-io/fusescope/pkg/subscription"
	"github.com/fuseone-io/fusescope/pkg/telemetrymetadata"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	pkgtokenizer "github.com/fuseone-io/fusescope/pkg/tokenizer"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/version"
	"github.com/fuseone-io/fusescope/pkg/zeus"

	"github.com/fuseone-io/fusescope/pkg/web"
)

type FuseScope struct {
	*factory.Registry
	Instrumentation        instrumentation.Instrumentation
	Analytics              analytics.Analytics
	Cache                  cache.Cache
	Web                    web.Web
	SQLStore               sqlstore.SQLStore
	TelemetryStore         telemetrystore.TelemetryStore
	TelemetryMetadataStore telemetrytypes.MetadataStore
	Prometheus             prometheus.Prometheus
	Alertmanager           alertmanager.Alertmanager
	Querier                querier.Querier
	APIServer              apiserver.APIServer
	Zeus                   zeus.Zeus
	Licensing              licensing.Licensing
	Emailing               emailing.Emailing
	Sharder                sharder.Sharder
	StatsReporter          statsreporter.StatsReporter
	Tokenizer              pkgtokenizer.Tokenizer
	IdentNResolver         identn.IdentNResolver
	Authz                  authz.AuthZ
	Ruler                  ruler.Ruler
	Modules                Modules
	Handlers               Handlers
	QueryParser            queryparser.QueryParser
	Flagger                flagger.Flagger
	Gateway                gateway.Gateway
	Auditor                auditor.Auditor
	MeterReporter          meterreporter.Reporter
}

// newQueryStack assembles the query stack once and returns, in order: the shared
// telemetry metadata store (reused elsewhere in signoz.New), the per-signal
// statement builders (trace, ai-trace, log, audit, metric, meter, trace-operator),
// and the bucket cache. It is the only place that imports the concrete
// statement-builder sub-packages.
func newQueryStack(
	ctx context.Context,
	settings factory.ProviderSettings,
	config Config,
	telemetryStore telemetrystore.TelemetryStore,
	cache cache.Cache,
	fl flagger.Flagger,
) (
	telemetrytypes.MetadataStore,
	qbtypes.StatementBuilder[qbtypes.TraceAggregation],
	qbtypes.StatementBuilder[qbtypes.TraceAggregation],
	qbtypes.StatementBuilder[qbtypes.LogAggregation],
	qbtypes.StatementBuilder[qbtypes.LogAggregation],
	qbtypes.StatementBuilder[qbtypes.MetricAggregation],
	qbtypes.StatementBuilder[qbtypes.MetricAggregation],
	qbtypes.TraceOperatorStatementBuilder,
	querier.BucketCache,
	error,
) {
	metadataStore := telemetrymetadata.NewTelemetryMetaStore(settings, telemetryStore, fl)

	cfg := config.Querier.Config
	traceStmtBuilder, err := tracesstatementbuilder.NewFactory(telemetryStore, metadataStore, fl).New(ctx, settings, cfg)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, err
	}
	aiTraceStmtBuilder, err := aistatementbuilder.NewFactory(telemetryStore, metadataStore, fl).New(ctx, settings, cfg)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, err
	}
	traceOperatorStmtBuilder, err := tracesstatementbuilder.NewOperatorFactory(telemetryStore, metadataStore, fl).New(ctx, settings, cfg)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, err
	}
	logStmtBuilder, err := logsstatementbuilder.NewFactory(telemetryStore, metadataStore, fl).New(ctx, settings, cfg)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, err
	}
	auditStmtBuilder, err := auditstatementbuilder.NewFactory(metadataStore, fl).New(ctx, settings, cfg)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, err
	}
	metricStmtBuilder, err := metricsstatementbuilder.NewFactory(metadataStore, fl).New(ctx, settings, cfg)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, err
	}
	meterStmtBuilder, err := meterstatementbuilder.NewFactory(metadataStore, fl).New(ctx, settings, cfg)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, err
	}

	bucketCache := querier.NewBucketCache(settings, cache, config.Querier.CacheTTL, config.Querier.FluxInterval)

	return metadataStore, traceStmtBuilder, aiTraceStmtBuilder, logStmtBuilder, auditStmtBuilder, metricStmtBuilder, meterStmtBuilder, traceOperatorStmtBuilder, bucketCache, nil
}

func New(
	ctx context.Context,
	config Config,
	zeusConfig zeus.Config,
	zeusProviderFactory factory.ProviderFactory[zeus.Zeus, zeus.Config],
	licenseConfig licensing.Config,
	licenseProviderFactory func(sqlstore.SQLStore, zeus.Zeus, organization.Getter, analytics.Analytics) factory.ProviderFactory[licensing.Licensing, licensing.Config],
	subscriptionCallback func(zeus.Zeus, licensing.Licensing) subscription.Subscription,
	emailingProviderFactories factory.NamedMap[factory.ProviderFactory[emailing.Emailing, emailing.Config]],
	cacheProviderFactories factory.NamedMap[factory.ProviderFactory[cache.Cache, cache.Config]],
	webProviderFactories factory.NamedMap[factory.ProviderFactory[web.Web, web.Config]],
	sqlSchemaProviderFactories func(sqlstore.SQLStore) factory.NamedMap[factory.ProviderFactory[sqlschema.SQLSchema, sqlschema.Config]],
	sqlstoreProviderFactories factory.NamedMap[factory.ProviderFactory[sqlstore.SQLStore, sqlstore.Config]],
	telemetrystoreProviderFactories factory.NamedMap[factory.ProviderFactory[telemetrystore.TelemetryStore, telemetrystore.Config]],
	authNsCallback func(ctx context.Context, providerSettings factory.ProviderSettings, store authtypes.AuthNStore, licensing licensing.Licensing, cache cache.Cache) (map[authtypes.AuthNProvider]authn.AuthN, error),
	authzCallback func(context.Context, sqlstore.SQLStore, authz.Config, licensing.Licensing, []authz.OnBeforeRoleDelete) (factory.ProviderFactory[authz.AuthZ, authz.Config], error),
	dashboardModuleCallback func(sqlstore.SQLStore, factory.ProviderSettings, analytics.Analytics, organization.Getter, queryparser.QueryParser, querier.Querier, licensing.Licensing, tag.Module, dashboardtypes.SystemDashboardRegistry) dashboard.Module,
	gatewayProviderFactory func(licensing.Licensing) factory.ProviderFactory[gateway.Gateway, gateway.Config],
	auditorProviderFactories func(licensing.Licensing) factory.NamedMap[factory.ProviderFactory[auditor.Auditor, auditor.Config]],
	meterReporterProviderFactories func(context.Context, factory.ProviderSettings, flagger.Flagger, licensing.Licensing, telemetrystore.TelemetryStore, retention.Getter, organization.Getter, zeus.Zeus) (factory.NamedMap[factory.ProviderFactory[meterreporter.Reporter, meterreporter.Config]], string),
	querierHandlerCallback func(factory.ProviderSettings, querier.Querier, analytics.Analytics) querier.Handler,
	cloudIntegrationCallback func(sqlstore.SQLStore, dashboard.Module, global.Global, zeus.Zeus, gateway.Gateway, licensing.Licensing, serviceaccount.Module, cloudintegration.Config) (cloudintegration.Module, error),
	metricReductionRuleModuleCallback func(sqlstore.SQLStore, telemetrystore.TelemetryStore, dashboard.Module, queryparser.QueryParser, licensing.Licensing, flagger.Flagger, telemetrytypes.MetadataStore, factory.ProviderSettings, int) metricreductionrule.Module,
	rulerProviderFactories func(cache.Cache, alertmanager.Alertmanager, sqlstore.SQLStore, telemetrystore.TelemetryStore, telemetrytypes.MetadataStore, prometheus.Prometheus, organization.Getter, rulestatehistory.Module, querier.Querier, queryparser.QueryParser) factory.NamedMap[factory.ProviderFactory[ruler.Ruler, ruler.Config]],
) (*FuseScope, error) {
	// Initialize instrumentation
	instrumentation, err := instrumentation.New(ctx, config.Instrumentation, version.Info, "signoz")
	if err != nil {
		return nil, err
	}

	instrumentation.Logger().InfoContext(ctx, "starting fusescope", slog.String("version", version.Info.Version()), slog.String("variant", version.Info.Variant()), slog.String("commit", version.Info.Hash()), slog.String("branch", version.Info.Branch()), slog.String("go", version.Info.GoVersion()), slog.String("time", version.Info.Time()))
	instrumentation.Logger().DebugContext(ctx, "loaded signoz config", slog.Any("config", config))

	// Get the provider settings from instrumentation
	providerSettings := instrumentation.ToProviderSettings()

	pprofService, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.PProf,
		NewPProfProviderFactories(),
		config.PProf.Provider(),
	)
	if err != nil {
		return nil, err
	}

	// Initialize analytics just after instrumentation, as providers might require it
	analytics, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Analytics,
		NewAnalyticsProviderFactories(),
		config.Analytics.Provider(),
	)
	if err != nil {
		return nil, err
	}

	// Initialize zeus from the available zeus provider factory. This is not config controlled
	// and depends on the variant of the build.
	zeus, err := zeusProviderFactory.New(
		ctx,
		providerSettings,
		zeusConfig,
	)
	if err != nil {
		return nil, err
	}

	// Initialize emailing from the available emailing provider factories
	emailing, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Emailing,
		emailingProviderFactories,
		config.Emailing.Provider(),
	)
	if err != nil {
		return nil, err
	}

	// Initialize cache from the available cache provider factories
	cache, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Cache,
		cacheProviderFactories,
		config.Cache.Provider,
	)
	if err != nil {
		return nil, err
	}

	// Initialize flagger from the available flagger provider factories
	flaggerRegistry := flagger.MustNewRegistry()
	flaggerProviderFactories := NewFlaggerProviderFactories(flaggerRegistry)
	flagger, err := flagger.New(
		ctx,
		providerSettings,
		config.Flagger,
		flaggerRegistry,
		flaggerProviderFactories.GetInOrder()...,
	)
	if err != nil {
		return nil, err
	}

	// Initialize web from the available web provider factories
	web, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Web,
		webProviderFactories,
		config.Web.Provider(),
	)
	if err != nil {
		return nil, err
	}

	// Initialize sqlstore from the available sqlstore provider factories
	sqlstore, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.SQLStore,
		sqlstoreProviderFactories,
		config.SQLStore.Provider,
	)
	if err != nil {
		return nil, err
	}

	// Initialize telemetrystore from the available telemetrystore provider factories
	telemetrystore, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.TelemetryStore,
		telemetrystoreProviderFactories,
		config.TelemetryStore.Provider,
	)
	if err != nil {
		return nil, err
	}

	retentionGetter := implretention.NewGetter(implretention.NewStore(sqlstore))

	// Initialize prometheus from the available prometheus provider factories
	prometheus, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Prometheus,
		NewPrometheusProviderFactories(telemetrystore),
		config.Prometheus.Provider(),
	)
	if err != nil {
		return nil, err
	}

	// Assemble the query stack (metadata store, statement builders, bucket cache) once,
	// and reuse the single metadata store everywhere downstream.
	telemetryMetadataStore, traceStmtBuilder, aiTraceStmtBuilder, logStmtBuilder, auditStmtBuilder, metricStmtBuilder, meterStmtBuilder, traceOperatorStmtBuilder, bucketCache, err := newQueryStack(ctx, providerSettings, config, telemetrystore, cache, flagger)
	if err != nil {
		return nil, err
	}

	// Initialize querier from the available querier provider factories
	querier, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Querier,
		NewQuerierProviderFactories(telemetrystore, prometheus, telemetryMetadataStore, traceStmtBuilder, aiTraceStmtBuilder, logStmtBuilder, auditStmtBuilder, metricStmtBuilder, meterStmtBuilder, traceOperatorStmtBuilder, bucketCache, flagger),
		config.Querier.Provider(),
	)
	if err != nil {
		return nil, err
	}

	sqlschema, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.SQLSchema,
		sqlSchemaProviderFactories(sqlstore),
		config.SQLStore.Provider,
	)
	if err != nil {
		return nil, err
	}

	// Initialize tag module — shared across modules that link entities to tags
	// (currently dashboard; future: alerts, RBAC). Built once here and injected
	// where needed.
	tagModule := impltag.NewModule(impltag.NewStore(sqlstore))

	// Dashboard store, injected into the migrations that reshape stored dashboards.
	dashboardStore := impldashboard.NewStore(sqlstore)

	// Run migrations on the sqlstore
	sqlmigrations, err := sqlmigration.New(
		ctx,
		providerSettings,
		config.SQLMigration,
		NewSQLMigrationProviderFactories(sqlstore, sqlschema, telemetrystore, providerSettings, dashboardStore, tagModule),
	)
	if err != nil {
		return nil, err
	}

	err = sqlmigrator.New(ctx, providerSettings, sqlstore, sqlmigrations, config.SQLMigrator).Migrate(ctx)
	if err != nil {
		return nil, err
	}

	// Initialize sharder from the available sharder provider factories
	sharder, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Sharder,
		NewSharderProviderFactories(),
		config.Sharder.Provider,
	)
	if err != nil {
		return nil, err
	}

	// Initialize organization getter
	orgGetter := implorganization.NewGetter(implorganization.NewStore(sqlstore), sharder)

	// Initialize tokenizer from the available tokenizer provider factories
	tokenizer, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Tokenizer,
		NewTokenizerProviderFactories(cache, sqlstore, orgGetter),
		config.Tokenizer.Provider,
	)
	if err != nil {
		return nil, err
	}

	// Initialize user store
	userStore := impluser.NewStore(sqlstore, providerSettings)

	// Initialize user role store
	userRoleStore := impluser.NewUserRoleStore(sqlstore, providerSettings)

	licensingProviderFactory := licenseProviderFactory(sqlstore, zeus, orgGetter, analytics)
	licensing, err := licensingProviderFactory.New(
		ctx,
		providerSettings,
		licenseConfig,
	)
	if err != nil {
		return nil, err
	}

	// Initialize query parser (needed for dashboard module)
	queryParser := queryparser.New(providerSettings)

	// Initialize dashboard module. The system dashboard registry is parsed here so
	// a malformed embedded definition fails startup instead of a request.
	systemDashboardRegistry, err := impldashboard.NewSystemDashboardRegistry()
	if err != nil {
		return nil, err
	}
	dashboard := dashboardModuleCallback(sqlstore, providerSettings, analytics, orgGetter, queryParser, querier, licensing, tagModule, systemDashboardRegistry)

	// Initialize user getter
	userGetter := impluser.NewGetter(userStore, userRoleStore, flagger)

	// Initialize service account getter
	serviceAccountGetter := implserviceaccount.NewGetter(implserviceaccount.NewStore(sqlstore))

	authDomainGetter := implauthdomain.NewGetter(implauthdomain.NewStore(sqlstore))

	// Build pre-delete callbacks from modules
	onBeforeRoleDelete := []authz.OnBeforeRoleDelete{
		userGetter.OnBeforeRoleDelete,
		serviceAccountGetter.OnBeforeRoleDelete,
		authDomainGetter.OnBeforeRoleDelete,
	}

	// Initialize authz
	authzProviderFactory, err := authzCallback(ctx, sqlstore, config.Authz, licensing, onBeforeRoleDelete)
	if err != nil {
		return nil, err
	}
	authz, err := authzProviderFactory.New(ctx, providerSettings, config.Authz)
	if err != nil {
		return nil, err
	}

	// Initialize notification manager from the available notification manager provider factories
	nfManager, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		nfmanager.Config{},
		NewNotificationManagerProviderFactories(sqlroutingstore.NewStore(sqlstore)),
		"rulebased",
	)
	if err != nil {
		return nil, err
	}

	maintenanceStore := sqlalertmanagerstore.NewMaintenanceStore(sqlstore, providerSettings)

	// Initialize alertmanager from the available alertmanager provider factories
	alertmanager, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Alertmanager,
		NewAlertmanagerProviderFactories(sqlstore, orgGetter, nfManager, maintenanceStore),
		config.Alertmanager.Provider,
	)
	if err != nil {
		return nil, err
	}

	gatewayFactory := gatewayProviderFactory(licensing)
	gateway, err := gatewayFactory.New(ctx, providerSettings, config.Gateway)
	if err != nil {
		return nil, err
	}

	// Initialize auditor from the variant-specific provider factories
	auditor, err := factory.NewProviderFromNamedMap(ctx, providerSettings, config.Auditor, auditorProviderFactories(licensing), config.Auditor.Provider)
	if err != nil {
		return nil, err
	}

	// Initialize meter reporter from the variant-specific provider factories
	meterReporterFactories, meterReporterProvider := meterReporterProviderFactories(ctx, providerSettings, flagger, licensing, telemetrystore, retentionGetter, orgGetter, zeus)
	meterReporter, err := factory.NewProviderFromNamedMap(ctx, providerSettings, config.MeterReporter, meterReporterFactories, meterReporterProvider)
	if err != nil {
		return nil, err
	}

	// Initialize authns
	store := sqlauthnstore.NewStore(sqlstore)
	authNs, err := authNsCallback(ctx, providerSettings, store, licensing, cache)
	if err != nil {
		return nil, err
	}

	global, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.Global,
		NewGlobalProviderFactories(config.IdentN),
		"signoz",
	)
	if err != nil {
		return nil, err
	}

	serviceAccount := implserviceaccount.NewModule(implserviceaccount.NewStore(sqlstore), authz, cache, analytics, providerSettings, config.ServiceAccount)

	cloudIntegrationModule, err := cloudIntegrationCallback(sqlstore, dashboard, global, zeus, gateway, licensing, serviceAccount, config.CloudIntegration)
	if err != nil {
		return nil, err
	}

	metricReductionRuleModule := metricReductionRuleModuleCallback(sqlstore, telemetrystore, dashboard, queryParser, licensing, flagger, telemetryMetadataStore, providerSettings, config.MetricsExplorer.TelemetryStore.Threads)

	// Initialize all modules
	// The default mapping group registry is parsed here so a malformed embedded
	// definition fails startup instead of a request.
	spanMapperRegistry, err := implspanmapper.NewSystemGroupRegistry()
	if err != nil {
		return nil, err
	}
	spanMapperModule := implspanmapper.NewModule(implspanmapper.NewStore(sqlstore), spanMapperRegistry, providerSettings)

	modules := NewModules(sqlstore, tokenizer, emailing, providerSettings, orgGetter, alertmanager, analytics, querier, telemetrystore, telemetryMetadataStore, authNs, authz, cache, queryParser, config, dashboard, userGetter, userRoleStore, serviceAccount, serviceAccountGetter, cloudIntegrationModule, retentionGetter, flagger, tagModule, metricReductionRuleModule, spanMapperModule)

	// Initialize ruler from the variant-specific provider factories
	rulerInstance, err := factory.NewProviderFromNamedMap(ctx, providerSettings, config.Ruler, rulerProviderFactories(cache, alertmanager, sqlstore, telemetrystore, telemetryMetadataStore, prometheus, orgGetter, modules.RuleStateHistory, querier, queryParser), "signoz")
	if err != nil {
		return nil, err
	}

	// Initialize identN resolver
	identNFactories := NewIdentNProviderFactories(tokenizer, serviceAccount, orgGetter, userGetter, config.User)
	identNResolver, err := identn.NewIdentNResolver(ctx, providerSettings, config.IdentN, identNFactories)
	if err != nil {
		return nil, err
	}

	userService := impluser.NewService(providerSettings, impluser.NewStore(sqlstore, providerSettings), modules.UserGetter, modules.UserSetter, orgGetter, authz, config.User.Root)

	// Initialize the querier handler via callback (allows EE to decorate with anomaly detection)
	querierHandler := querierHandlerCallback(providerSettings, querier, analytics)

	// Create a list of all stats collectors
	statsCollectors := []statsreporter.StatsCollector{
		alertmanager,
		rulerInstance,
		modules.Dashboard,
		modules.SavedView,
		modules.UserSetter,
		licensing,
		tokenizer,
		config,
		modules.AuthDomain,
		serviceAccount,
		cloudIntegrationModule,
		modules.LogsPipeline,
		modules.InfraMonitoring,
		querier,
		authz,
	}

	// Initialize the stats aggregator (always-on, independent of whether reporting is enabled)
	statsAggregator := statsreporter.NewAggregator(providerSettings, statsCollectors)

	// Initialize stats reporter from the available stats reporter provider factories
	statsReporter, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.StatsReporter,
		NewStatsReporterProviderFactories(statsAggregator, orgGetter, userGetter, tokenizer, version.Info, config.Analytics),
		config.StatsReporter.Provider(),
	)
	if err != nil {
		return nil, err
	}

	authDomainReconciler, err := implauthdomain.NewReconciler(providerSettings, modules.AuthDomain, orgGetter, config.AuthDomain)
	if err != nil {
		return nil, err
	}

	registry, err := factory.NewRegistry(
		ctx,
		instrumentation.Logger(),
		factory.NewNamedService(factory.MustNewName("instrumentation"), instrumentation),
		factory.NewNamedService(factory.MustNewName("pprof"), pprofService),
		factory.NewNamedService(factory.MustNewName("analytics"), analytics),
		factory.NewNamedService(factory.MustNewName("alertmanager"), alertmanager),
		factory.NewNamedService(factory.MustNewName("licensing"), licensing),
		factory.NewNamedService(factory.MustNewName("statsreporter"), statsReporter),
		factory.NewNamedService(factory.MustNewName("tokenizer"), tokenizer),
		factory.NewNamedService(factory.MustNewName("authz"), authz),
		factory.NewNamedService(factory.MustNewName("user"), userService, factory.MustNewName("authz")),
		factory.NewNamedService(factory.MustNewName("auditor"), auditor),
		factory.NewNamedService(factory.MustNewName("meterreporter"), meterReporter, factory.MustNewName("licensing")),
		factory.NewNamedService(factory.MustNewName("ruler"), rulerInstance),
		factory.NewNamedService(factory.MustNewName("systemdashboard"), impldashboard.NewService(providerSettings, dashboard, orgGetter)),
		factory.NewNamedService(factory.MustNewName("spanmappergroup"), implspanmapper.NewService(providerSettings, spanMapperModule, orgGetter)),
		factory.NewNamedService(factory.MustNewName("authdomain"), implauthdomain.NewService(providerSettings, authDomainReconciler, config.AuthDomain.ReconcileInterval)),
		factory.NewNamedService(factory.MustNewName("rumapplication"), implrumapplication.NewService(providerSettings, modules.RUMApplication, config.RUM)),
	)
	if err != nil {
		return nil, err
	}

	// Initialize all handlers for the modules
	registryHandler := factory.NewHandler(registry)
	subscriptionService := subscriptionCallback(zeus, licensing)

	handlers := NewHandlers(modules, providerSettings, analytics, querierHandler, licensing, global, flagger, gateway, telemetryMetadataStore, authz, zeus, subscriptionService, registryHandler, alertmanager, prometheus, rulerInstance, statsAggregator, config.RUM)

	// Initialize the API server (after registry so it can access service health)
	apiserverInstance, err := factory.NewProviderFromNamedMap(
		ctx,
		providerSettings,
		config.APIServer,
		NewAPIServerProviderFactories(orgGetter, authz, modules, handlers, config.Global, gateway, identNResolver, sharder, auditor, web),
		"signoz",
	)
	if err != nil {
		return nil, err
	}

	// Register the API server with the registry so its lifecycle is managed
	// alongside the other services and it shows up in the health endpoint.
	err = registry.Add(ctx, factory.NewNamedService(factory.MustNewName("apiserver"), apiserverInstance))
	if err != nil {
		return nil, err
	}

	return &FuseScope{
		Registry:               registry,
		Analytics:              analytics,
		Instrumentation:        instrumentation,
		Cache:                  cache,
		Web:                    web,
		SQLStore:               sqlstore,
		TelemetryStore:         telemetrystore,
		TelemetryMetadataStore: telemetryMetadataStore,
		Prometheus:             prometheus,
		Alertmanager:           alertmanager,
		Querier:                querier,
		APIServer:              apiserverInstance,
		Zeus:                   zeus,
		Licensing:              licensing,
		Emailing:               emailing,
		Sharder:                sharder,
		Tokenizer:              tokenizer,
		IdentNResolver:         identNResolver,
		Authz:                  authz,
		Ruler:                  rulerInstance,
		Modules:                modules,
		Handlers:               handlers,
		QueryParser:            queryParser,
		Flagger:                flagger,
		Gateway:                gateway,
		Auditor:                auditor,
		MeterReporter:          meterReporter,
	}, nil
}
