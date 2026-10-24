package signoz

import (
	"github.com/fuseone-io/fusescope/pkg/alertmanager"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/nfmanager"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/nfmanager/rulebasednotification"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/signozalertmanager"
	"github.com/fuseone-io/fusescope/pkg/analytics"
	"github.com/fuseone-io/fusescope/pkg/analytics/noopanalytics"
	"github.com/fuseone-io/fusescope/pkg/analytics/segmentanalytics"
	"github.com/fuseone-io/fusescope/pkg/apiserver"
	"github.com/fuseone-io/fusescope/pkg/apiserver/signozapiserver"
	"github.com/fuseone-io/fusescope/pkg/auditor"
	"github.com/fuseone-io/fusescope/pkg/auditor/noopauditor"
	"github.com/fuseone-io/fusescope/pkg/authz"
	"github.com/fuseone-io/fusescope/pkg/cache"
	"github.com/fuseone-io/fusescope/pkg/cache/memorycache"
	"github.com/fuseone-io/fusescope/pkg/cache/rediscache"
	"github.com/fuseone-io/fusescope/pkg/emailing"
	"github.com/fuseone-io/fusescope/pkg/emailing/noopemailing"
	"github.com/fuseone-io/fusescope/pkg/emailing/smtpemailing"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/flagger/configflagger"
	"github.com/fuseone-io/fusescope/pkg/gateway"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/global/signozglobal"
	"github.com/fuseone-io/fusescope/pkg/identn"
	"github.com/fuseone-io/fusescope/pkg/identn/apikeyidentn"
	"github.com/fuseone-io/fusescope/pkg/identn/impersonationidentn"
	"github.com/fuseone-io/fusescope/pkg/identn/tokenizeridentn"
	"github.com/fuseone-io/fusescope/pkg/meterreporter"
	"github.com/fuseone-io/fusescope/pkg/meterreporter/noopmeterreporter"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain/implauthdomain"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/implorganization"
	"github.com/fuseone-io/fusescope/pkg/modules/preference/implpreference"
	"github.com/fuseone-io/fusescope/pkg/modules/promote/implpromote"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/session/implsession"
	"github.com/fuseone-io/fusescope/pkg/modules/tag"
	"github.com/fuseone-io/fusescope/pkg/modules/user"
	"github.com/fuseone-io/fusescope/pkg/modules/user/impluser"
	"github.com/fuseone-io/fusescope/pkg/pprof"
	"github.com/fuseone-io/fusescope/pkg/pprof/httppprof"
	"github.com/fuseone-io/fusescope/pkg/pprof/nooppprof"
	"github.com/fuseone-io/fusescope/pkg/prometheus"
	"github.com/fuseone-io/fusescope/pkg/prometheus/clickhouseprometheusv2"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/querier/signozquerier"
	"github.com/fuseone-io/fusescope/pkg/sharder"
	"github.com/fuseone-io/fusescope/pkg/sharder/noopsharder"
	"github.com/fuseone-io/fusescope/pkg/sharder/singlesharder"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/postgressqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/sqlitesqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlstorehook"
	"github.com/fuseone-io/fusescope/pkg/statsreporter"
	"github.com/fuseone-io/fusescope/pkg/statsreporter/analyticsstatsreporter"
	"github.com/fuseone-io/fusescope/pkg/statsreporter/noopstatsreporter"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/clickhousetelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystorehook"
	"github.com/fuseone-io/fusescope/pkg/tokenizer"
	"github.com/fuseone-io/fusescope/pkg/tokenizer/jwttokenizer"
	"github.com/fuseone-io/fusescope/pkg/tokenizer/opaquetokenizer"
	"github.com/fuseone-io/fusescope/pkg/tokenizer/tokenizerstore/sqltokenizerstore"
	"github.com/fuseone-io/fusescope/pkg/types/alertmanagertypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/fuseone-io/fusescope/pkg/types/featuretypes"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/version"
	"github.com/fuseone-io/fusescope/pkg/web"
	"github.com/fuseone-io/fusescope/pkg/web/noopweb"
	"github.com/fuseone-io/fusescope/pkg/web/routerweb"
)

func NewAnalyticsProviderFactories() factory.NamedMap[factory.ProviderFactory[analytics.Analytics, analytics.Config]] {
	return factory.MustNewNamedMap(
		noopanalytics.NewFactory(),
		segmentanalytics.NewFactory(),
	)
}

func NewCacheProviderFactories() factory.NamedMap[factory.ProviderFactory[cache.Cache, cache.Config]] {
	return factory.MustNewNamedMap(
		memorycache.NewFactory(),
		rediscache.NewFactory(),
	)
}

func NewWebProviderFactories(globalConfig global.Config) factory.NamedMap[factory.ProviderFactory[web.Web, web.Config]] {
	return factory.MustNewNamedMap(
		routerweb.NewFactory(globalConfig),
		noopweb.NewFactory(),
	)
}

func NewPProfProviderFactories() factory.NamedMap[factory.ProviderFactory[pprof.PProf, pprof.Config]] {
	return factory.MustNewNamedMap(
		httppprof.NewFactory(),
		nooppprof.NewFactory(),
	)
}

func NewSQLStoreProviderFactories() factory.NamedMap[factory.ProviderFactory[sqlstore.SQLStore, sqlstore.Config]] {
	return factory.MustNewNamedMap(
		sqlitesqlstore.NewFactory(sqlstorehook.NewLoggingFactory(), sqlstorehook.NewInstrumentationFactory()),
		postgressqlstore.NewFactory(sqlstorehook.NewLoggingFactory(), sqlstorehook.NewInstrumentationFactory()),
	)
}

func NewSQLSchemaProviderFactories(sqlstore sqlstore.SQLStore) factory.NamedMap[factory.ProviderFactory[sqlschema.SQLSchema, sqlschema.Config]] {
	return factory.MustNewNamedMap(
		sqlitesqlschema.NewFactory(sqlstore),
		postgressqlschema.NewFactory(sqlstore),
	)
}

func NewSQLMigrationProviderFactories(
	sqlstore sqlstore.SQLStore,
	sqlschema sqlschema.SQLSchema,
	telemetryStore telemetrystore.TelemetryStore,
	providerSettings factory.ProviderSettings,
	dashboardStore dashboardtypes.Store,
	tagModule tag.Module,
) factory.NamedMap[factory.ProviderFactory[sqlmigration.SQLMigration, sqlmigration.Config]] {
	return factory.MustNewNamedMap(
		sqlmigration.NewAddDataMigrationsFactory(),
		sqlmigration.NewAddOrganizationFactory(),
		sqlmigration.NewAddPreferencesFactory(),
		sqlmigration.NewAddDashboardsFactory(),
		sqlmigration.NewAddSavedViewsFactory(),
		sqlmigration.NewAddAgentsFactory(),
		sqlmigration.NewAddPipelinesFactory(),
		sqlmigration.NewAddIntegrationsFactory(),
		sqlmigration.NewAddLicensesFactory(),
		sqlmigration.NewAddPatsFactory(),
		sqlmigration.NewModifyDatetimeFactory(),
		sqlmigration.NewModifyOrgDomainFactory(),
		sqlmigration.NewUpdateOrganizationFactory(sqlstore),
		sqlmigration.NewAddAlertmanagerFactory(sqlstore),
		sqlmigration.NewUpdateDashboardAndSavedViewsFactory(sqlstore),
		sqlmigration.NewUpdatePatAndOrgDomainsFactory(sqlstore),
		sqlmigration.NewUpdatePipelines(sqlstore),
		sqlmigration.NewDropLicensesSitesFactory(sqlstore),
		sqlmigration.NewUpdateInvitesFactory(sqlstore),
		sqlmigration.NewUpdatePatFactory(sqlstore),
		sqlmigration.NewUpdateAlertmanagerFactory(sqlstore),
		sqlmigration.NewUpdatePreferencesFactory(sqlstore),
		sqlmigration.NewUpdateApdexTtlFactory(sqlstore),
		sqlmigration.NewUpdateResetPasswordFactory(sqlstore),
		sqlmigration.NewUpdateRulesFactory(sqlstore),
		sqlmigration.NewAddVirtualFieldsFactory(),
		sqlmigration.NewUpdateIntegrationsFactory(sqlstore),
		sqlmigration.NewUpdateOrganizationsFactory(sqlstore),
		sqlmigration.NewDropGroupsFactory(sqlstore),
		sqlmigration.NewCreateQuickFiltersFactory(sqlstore),
		sqlmigration.NewUpdateQuickFiltersFactory(sqlstore),
		sqlmigration.NewAuthRefactorFactory(sqlstore),
		sqlmigration.NewUpdateLicenseFactory(sqlstore),
		sqlmigration.NewMigratePATToFactorAPIKey(sqlstore),
		sqlmigration.NewUpdateApiMonitoringFiltersFactory(sqlstore),
		sqlmigration.NewAddKeyOrganizationFactory(sqlstore),
		sqlmigration.NewAddTraceFunnelsFactory(sqlstore),
		sqlmigration.NewUpdateDashboardFactory(sqlstore),
		sqlmigration.NewDropFeatureSetFactory(),
		sqlmigration.NewDropDeprecatedTablesFactory(),
		sqlmigration.NewUpdateAgentsFactory(sqlstore),
		sqlmigration.NewUpdateUsersFactory(sqlstore, sqlschema),
		sqlmigration.NewUpdateUserInviteFactory(sqlstore, sqlschema),
		sqlmigration.NewUpdateOrgDomainFactory(sqlstore, sqlschema),
		sqlmigration.NewAddFactorIndexesFactory(sqlstore, sqlschema),
		sqlmigration.NewQueryBuilderV5MigrationFactory(sqlstore, telemetryStore),
		sqlmigration.NewAddMeterQuickFiltersFactory(sqlstore, sqlschema),
		sqlmigration.NewUpdateTTLSettingForCustomRetentionFactory(sqlstore, sqlschema),
		sqlmigration.NewAddRoutePolicyFactory(sqlstore, sqlschema),
		sqlmigration.NewAddAuthTokenFactory(sqlstore, sqlschema),
		sqlmigration.NewAddAuthzFactory(sqlstore, sqlschema),
		sqlmigration.NewAddPublicDashboardsFactory(sqlstore, sqlschema),
		sqlmigration.NewAddRoleFactory(sqlstore, sqlschema),
		sqlmigration.NewUpdateAuthzFactory(sqlstore, sqlschema),
		sqlmigration.NewUpdateUserPreferenceFactory(sqlstore, sqlschema),
		sqlmigration.NewUpdateOrgPreferenceFactory(sqlstore, sqlschema),
		sqlmigration.NewRenameOrgDomainsFactory(sqlstore, sqlschema),
		sqlmigration.NewAddResetPasswordTokenExpiryFactory(sqlstore, sqlschema),
		sqlmigration.NewAddManagedRolesFactory(sqlstore, sqlschema),
		sqlmigration.NewAddAuthzIndexFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateRbacToAuthzFactory(sqlstore),
		sqlmigration.NewMigratePublicDashboardsFactory(sqlstore),
		sqlmigration.NewAddAnonymousPublicDashboardTransactionFactory(sqlstore),
		sqlmigration.NewAddRootUserFactory(sqlstore, sqlschema),
		sqlmigration.NewAddUserEmailOrgIDIndexFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateRulesV4ToV5Factory(sqlstore, telemetryStore),
		sqlmigration.NewAddStatusUserFactory(sqlstore, sqlschema),
		sqlmigration.NewDeprecateUserInviteFactory(sqlstore, sqlschema),
		sqlmigration.NewUpdateCloudIntegrationUniqueIndexFactory(sqlstore, sqlschema),
		sqlmigration.NewUpdatePlannedMaintenanceRuleFactory(sqlstore, sqlschema),
		sqlmigration.NewAddUserRoleFactory(sqlstore, sqlschema),
		sqlmigration.NewDropUserRoleColumnFactory(sqlstore, sqlschema),
		sqlmigration.NewAddServiceAccountFactory(sqlstore, sqlschema),
		sqlmigration.NewDeprecateAPIKeyFactory(sqlstore, sqlschema),
		sqlmigration.NewServiceAccountAuthzactory(sqlstore),
		sqlmigration.NewDropUserDeletedAtFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateAWSAllRegionsFactory(sqlstore),
		sqlmigration.NewAddServiceAccountManagedRoleTransactionsFactory(sqlstore),
		sqlmigration.NewAddSpanMapperFactory(sqlstore, sqlschema),
		sqlmigration.NewAddLLMPricingRulesFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateMetaresourcesTuplesFactory(sqlstore),
		sqlmigration.NewAddTagsFactory(sqlstore, sqlschema),
		sqlmigration.NewAddRoleCRUDTuplesFactory(sqlstore),
		sqlmigration.NewAddIntegrationDashboardFactory(sqlstore, sqlschema),
		sqlmigration.NewAddSourceToDashboardFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateCloudIntegrationDashboardsFactory(sqlstore),
		sqlmigration.NewAddScopeToPlannedMaintenanceFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateInstalledIntegrationDashboardsFactory(sqlstore),
		sqlmigration.NewAddDashboardNameFactory(sqlstore, sqlschema),
		sqlmigration.NewFixChangelogOperationTypeFactory(sqlstore, sqlschema),
		sqlmigration.NewCloudIntegrationRemoveCascadeDeleteFactory(sqlschema),
		sqlmigration.NewAddUserDashboardPreferenceFactory(sqlstore, sqlschema),
		sqlmigration.NewRecreateUserDashboardPreferenceFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateRecurrenceBoundsFactory(sqlstore),
		sqlmigration.NewAddDashboardViewFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateSSORoleMappingNamesFactory(sqlstore),
		sqlmigration.NewAddMetricReductionRulesFactory(sqlstore, sqlschema),
		sqlmigration.NewRemoveOrganizationTuplesFactory(sqlstore),
		sqlmigration.NewAddRoleTransactionGroupsFactory(sqlstore, sqlschema),
		sqlmigration.NewAddTagUniqueIndexFactory(sqlstore, sqlschema),
		sqlmigration.NewAddTelemetryTuplesFactory(sqlstore),
		sqlmigration.NewAddTagRelationRankFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateDashboardsV1ToV2Factory(sqlstore, sqlschema, dashboardStore, tagModule),
		sqlmigration.NewFillDashboardMeterSourceFactory(sqlstore, dashboardStore),
		sqlmigration.NewUpdateRoleTransactionGroupsFactory(),
		sqlmigration.NewFillDashboardSpecCollectionsFactory(sqlstore, dashboardStore),
		sqlmigration.NewScrubEmailChannelTransportFactory(sqlstore),
		sqlmigration.NewAddDashboardTuplesFactory(sqlstore),
		sqlmigration.NewRestructureSavedViewSpecFactory(sqlstore, sqlschema),
		sqlmigration.NewAddSavedViewTuplesFactory(sqlstore),
		sqlmigration.NewFixSavedViewSelectedFieldsFactory(sqlstore),
		sqlmigration.NewBackfillSavedViewRequestTypeFactory(sqlstore),
		sqlmigration.NewRestructureAuthDomainConfigFactory(sqlstore),
		sqlmigration.NewFixSavedViewSelectFieldsFactory(sqlstore),
		sqlmigration.NewDeleteOrphanUserRolesFactory(),
		sqlmigration.NewMigrateLambdaDashboardsFactory(),
		sqlmigration.NewAddAuthDomainTuplesFactory(sqlstore),
		sqlmigration.NewAddDeploymentHostTuplesFactory(sqlstore),
		sqlmigration.NewAddSystemDashboardFactory(sqlstore, sqlschema),
		sqlmigration.NewAddLicenseTuplesFactory(sqlstore),
		sqlmigration.NewAddChannelDisplayNameFactory(sqlstore, sqlschema),
		sqlmigration.NewMigrateQuickFiltersFactory(sqlstore),
		sqlmigration.NewAddQuickFilterTuplesFactory(sqlstore),
		sqlmigration.NewAddIngestionTuplesFactory(sqlstore),
		sqlmigration.NewAddSubscriptionTuplesFactory(sqlstore),
		sqlmigration.NewNormalizeQuickFilterFieldsFactory(sqlstore),
		sqlmigration.NewAddSpanMapperOriginFactory(sqlstore, sqlschema),
		sqlmigration.NewAddCloudIntegrationTuplesFactory(sqlstore),
		sqlmigration.NewAddNotificationChannelTuplesFactory(sqlstore),
		sqlmigration.NewAddAIObservabilityQuickFiltersFactory(sqlstore),
		sqlmigration.NewAddChannelSpecFactory(sqlschema),
		sqlmigration.NewAddUserTuplesFactory(sqlstore),
		sqlmigration.NewAddRuleViewFactory(sqlstore, sqlschema),
		sqlmigration.NewAddFieldTuplesFactory(sqlstore),
		sqlmigration.NewKeepRelevantLLMPricingRulesFactory(),
		sqlmigration.NewAddRUMApplicationsFactory(sqlstore, sqlschema),
		sqlmigration.NewAddRUMApplicationTuplesFactory(sqlstore),
		sqlmigration.NewAddRUMApplicationViewerTuplesFactory(sqlstore),
		sqlmigration.NewAddRUMSourceMapsFactory(sqlstore, sqlschema),
		sqlmigration.NewAddAIObservabilityEnvironmentNameQuickFilterFactory(sqlstore),
	)
}

func NewTelemetryStoreProviderFactories() factory.NamedMap[factory.ProviderFactory[telemetrystore.TelemetryStore, telemetrystore.Config]] {
	return factory.MustNewNamedMap(
		clickhousetelemetrystore.NewFactory(
			telemetrystorehook.NewLoggingFactory(),
			// adding instrumentation factory before settings as we are starting the query span here
			telemetrystorehook.NewInstrumentationFactory(),
			telemetrystorehook.NewSettingsFactory(),
		),
	)
}

func NewPrometheusProviderFactories(telemetryStore telemetrystore.TelemetryStore) factory.NamedMap[factory.ProviderFactory[prometheus.Prometheus, prometheus.Config]] {
	return factory.MustNewNamedMap(
		clickhouseprometheusv2.NewFactory(telemetryStore),
	)
}

func NewNotificationManagerProviderFactories(routeStore alertmanagertypes.RouteStore) factory.NamedMap[factory.ProviderFactory[nfmanager.NotificationManager, nfmanager.Config]] {
	return factory.MustNewNamedMap(
		rulebasednotification.NewFactory(routeStore),
	)
}

func NewAlertmanagerProviderFactories(
	sqlstore sqlstore.SQLStore,
	orgGetter organization.Getter,
	nfManager nfmanager.NotificationManager,
	maintenanceStore alertmanagertypes.MaintenanceStore,
) factory.NamedMap[factory.ProviderFactory[alertmanager.Alertmanager, alertmanager.Config]] {
	return factory.MustNewNamedMap(
		signozalertmanager.NewFactory(sqlstore, orgGetter, nfManager, maintenanceStore),
	)
}

func NewEmailingProviderFactories() factory.NamedMap[factory.ProviderFactory[emailing.Emailing, emailing.Config]] {
	return factory.MustNewNamedMap(
		noopemailing.NewFactory(),
		smtpemailing.NewFactory(),
	)
}

func NewSharderProviderFactories() factory.NamedMap[factory.ProviderFactory[sharder.Sharder, sharder.Config]] {
	return factory.MustNewNamedMap(
		singlesharder.NewFactory(),
		noopsharder.NewFactory(),
	)
}

func NewStatsReporterProviderFactories(aggregator statsreporter.Aggregator, orgGetter organization.Getter, userGetter user.Getter, tokenizer tokenizer.Tokenizer, build version.Build, analyticsConfig analytics.Config) factory.NamedMap[factory.ProviderFactory[statsreporter.StatsReporter, statsreporter.Config]] {
	return factory.MustNewNamedMap(
		analyticsstatsreporter.NewFactory(aggregator, orgGetter, userGetter, tokenizer, build, analyticsConfig),
		noopstatsreporter.NewFactory(),
	)
}

func NewQuerierProviderFactories(telemetryStore telemetrystore.TelemetryStore, prometheus prometheus.Prometheus, metadataStore telemetrytypes.MetadataStore, traceStmtBuilder qbtypes.StatementBuilder[qbtypes.TraceAggregation], aiTraceStmtBuilder qbtypes.StatementBuilder[qbtypes.TraceAggregation], logStmtBuilder qbtypes.StatementBuilder[qbtypes.LogAggregation], auditStmtBuilder qbtypes.StatementBuilder[qbtypes.LogAggregation], metricStmtBuilder qbtypes.StatementBuilder[qbtypes.MetricAggregation], meterStmtBuilder qbtypes.StatementBuilder[qbtypes.MetricAggregation], traceOperatorStmtBuilder qbtypes.TraceOperatorStatementBuilder, bucketCache querier.BucketCache, flagger flagger.Flagger) factory.NamedMap[factory.ProviderFactory[querier.Querier, querier.Config]] {
	return factory.MustNewNamedMap(
		signozquerier.NewFactory(telemetryStore, prometheus, metadataStore, traceStmtBuilder, aiTraceStmtBuilder, logStmtBuilder, auditStmtBuilder, metricStmtBuilder, meterStmtBuilder, traceOperatorStmtBuilder, bucketCache, flagger),
	)
}

func NewAPIServerProviderFactories(orgGetter organization.Getter, authz authz.AuthZ, modules Modules, handlers Handlers, globalConfig global.Config, gatewayService gateway.Gateway, identNResolver identn.IdentNResolver, sharder sharder.Sharder, auditor auditor.Auditor, web web.Web) factory.NamedMap[factory.ProviderFactory[apiserver.APIServer, apiserver.Config]] {
	return factory.MustNewNamedMap(
		signozapiserver.NewFactory(
			orgGetter,
			authz,
			implorganization.NewHandler(modules.OrgGetter, modules.OrgSetter),
			impluser.NewHandler(modules.UserSetter, modules.UserGetter),
			implsession.NewHandler(modules.Session, globalConfig),
			implauthdomain.NewHandler(modules.AuthDomain),
			modules.AuthDomain,
			implpreference.NewHandler(modules.Preference),
			handlers.Global,
			implpromote.NewHandler(modules.Promote),
			handlers.FlaggerHandler,
			modules.Dashboard,
			handlers.Dashboard,
			handlers.MetricsExplorer,
			handlers.MetricReductionRule,
			handlers.InfraMonitoring,
			handlers.GatewayHandler,
			gatewayService,
			handlers.Fields,
			handlers.AIObservability,
			handlers.AuthzHandler,
			handlers.RawDataExport,
			handlers.ZeusHandler,
			handlers.LicensingHandler,
			handlers.SubscriptionHandler,
			handlers.QuerierHandler,
			handlers.ServiceAccountHandler,
			modules.ServiceAccountGetter,
			modules.UserGetter,
			handlers.RegistryHandler,
			handlers.CloudIntegrationHandler,
			handlers.RuleStateHistory,
			handlers.SpanMapperHandler,
			handlers.AlertmanagerHandler,
			handlers.PrometheusHandler,
			handlers.LLMPricingRuleHandler,
			handlers.TraceDetail,
			handlers.RulerHandler,
			handlers.StatsHandler,
			handlers.SavedView,
			globalConfig,
			identNResolver,
			sharder,
			auditor,
			web,
			modules.QuickFilter,
			handlers.QuickFilter,
			handlers.RUMApplicationHandler,
			handlers.RUMGateway,
			handlers.Onboarding,
		),
	)
}

func NewTokenizerProviderFactories(cache cache.Cache, sqlstore sqlstore.SQLStore, orgGetter organization.Getter) factory.NamedMap[factory.ProviderFactory[tokenizer.Tokenizer, tokenizer.Config]] {
	tokenStore := sqltokenizerstore.NewStore(sqlstore)
	return factory.MustNewNamedMap(
		opaquetokenizer.NewFactory(cache, tokenStore, orgGetter),
		jwttokenizer.NewFactory(cache, tokenStore),
	)
}

func NewIdentNProviderFactories(tokenizer tokenizer.Tokenizer, serviceAccount serviceaccount.Module, orgGetter organization.Getter, userGetter user.Getter, userConfig user.Config) factory.NamedMap[factory.ProviderFactory[identn.IdentN, identn.Config]] {
	return factory.MustNewNamedMap(
		impersonationidentn.NewFactory(orgGetter, userGetter, userConfig),
		tokenizeridentn.NewFactory(tokenizer),
		apikeyidentn.NewFactory(serviceAccount),
	)
}

func NewGlobalProviderFactories(identNConfig identn.Config) factory.NamedMap[factory.ProviderFactory[global.Global, global.Config]] {
	return factory.MustNewNamedMap(
		signozglobal.NewFactory(identNConfig),
	)
}

func NewAuditorProviderFactories() factory.NamedMap[factory.ProviderFactory[auditor.Auditor, auditor.Config]] {
	return factory.MustNewNamedMap(
		noopauditor.NewFactory(),
	)
}

func NewMeterReporterProviderFactories() factory.NamedMap[factory.ProviderFactory[meterreporter.Reporter, meterreporter.Config]] {
	return factory.MustNewNamedMap(
		noopmeterreporter.NewFactory(),
	)
}

func NewFlaggerProviderFactories(registry featuretypes.Registry) factory.NamedMap[factory.ProviderFactory[flagger.FlaggerProvider, flagger.Config]] {
	return factory.MustNewNamedMap(
		configflagger.NewFactory(registry),
	)
}
