package signoz

import (
	"github.com/fuseone-io/fusescope/pkg/alertmanager"
	"github.com/fuseone-io/fusescope/pkg/analytics"
	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/authz"
	"github.com/fuseone-io/fusescope/pkg/cache"
	"github.com/fuseone-io/fusescope/pkg/emailing"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/modules/apdex"
	"github.com/fuseone-io/fusescope/pkg/modules/apdex/implapdex"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain/implauthdomain"
	"github.com/fuseone-io/fusescope/pkg/modules/cloudintegration"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/inframonitoring"
	"github.com/fuseone-io/fusescope/pkg/modules/inframonitoring/implinframonitoring"
	"github.com/fuseone-io/fusescope/pkg/modules/llmpricingrule"
	"github.com/fuseone-io/fusescope/pkg/modules/llmpricingrule/impllmpricingrule"
	"github.com/fuseone-io/fusescope/pkg/modules/logspipeline"
	"github.com/fuseone-io/fusescope/pkg/modules/logspipeline/impllogspipeline"
	"github.com/fuseone-io/fusescope/pkg/modules/metricreductionrule"
	"github.com/fuseone-io/fusescope/pkg/modules/metricsexplorer"
	"github.com/fuseone-io/fusescope/pkg/modules/metricsexplorer/implmetricsexplorer"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/implorganization"
	"github.com/fuseone-io/fusescope/pkg/modules/preference"
	"github.com/fuseone-io/fusescope/pkg/modules/preference/implpreference"
	"github.com/fuseone-io/fusescope/pkg/modules/promote"
	"github.com/fuseone-io/fusescope/pkg/modules/promote/implpromote"
	"github.com/fuseone-io/fusescope/pkg/modules/quickfilter"
	"github.com/fuseone-io/fusescope/pkg/modules/quickfilter/implquickfilter"
	"github.com/fuseone-io/fusescope/pkg/modules/rawdataexport"
	"github.com/fuseone-io/fusescope/pkg/modules/rawdataexport/implrawdataexport"
	"github.com/fuseone-io/fusescope/pkg/modules/retention"
	"github.com/fuseone-io/fusescope/pkg/modules/rulestatehistory"
	"github.com/fuseone-io/fusescope/pkg/modules/rulestatehistory/implrulestatehistory"
	"github.com/fuseone-io/fusescope/pkg/modules/savedview"
	"github.com/fuseone-io/fusescope/pkg/modules/savedview/implsavedview"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/services"
	"github.com/fuseone-io/fusescope/pkg/modules/services/implservices"
	"github.com/fuseone-io/fusescope/pkg/modules/session"
	"github.com/fuseone-io/fusescope/pkg/modules/session/implsession"
	"github.com/fuseone-io/fusescope/pkg/modules/spanmapper"
	"github.com/fuseone-io/fusescope/pkg/modules/spanpercentile"
	"github.com/fuseone-io/fusescope/pkg/modules/spanpercentile/implspanpercentile"
	"github.com/fuseone-io/fusescope/pkg/modules/tag"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail/impltracedetail"
	"github.com/fuseone-io/fusescope/pkg/modules/tracefunnel"
	"github.com/fuseone-io/fusescope/pkg/modules/tracefunnel/impltracefunnel"
	"github.com/fuseone-io/fusescope/pkg/modules/user"
	"github.com/fuseone-io/fusescope/pkg/modules/user/impluser"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/queryparser"
	"github.com/fuseone-io/fusescope/pkg/ruler/rulestore/sqlrulestore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/tokenizer"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/preferencetypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

type Modules struct {
	OrgGetter            organization.Getter
	OrgSetter            organization.Setter
	Preference           preference.Module
	UserSetter           user.Setter
	UserGetter           user.Getter
	RetentionGetter      retention.Getter
	SavedView            savedview.Module
	Apdex                apdex.Module
	Dashboard            dashboard.Module
	QuickFilter          quickfilter.Module
	TraceFunnel          tracefunnel.Module
	RawDataExport        rawdataexport.Module
	AuthDomain           authdomain.Module
	Session              session.Module
	Services             services.Module
	SpanPercentile       spanpercentile.Module
	MetricsExplorer      metricsexplorer.Module
	MetricReductionRule  metricreductionrule.Module
	InfraMonitoring      inframonitoring.Module
	Promote              promote.Module
	ServiceAccount       serviceaccount.Module
	ServiceAccountGetter serviceaccount.Getter
	CloudIntegration     cloudintegration.Module
	LogsPipeline         logspipeline.Module
	RuleStateHistory     rulestatehistory.Module
	TraceDetail          tracedetail.Module
	SpanMapper           spanmapper.Module
	LLMPricingRule       llmpricingrule.Module
	Tag                  tag.Module
}

func NewModules(
	sqlstore sqlstore.SQLStore,
	tokenizer tokenizer.Tokenizer,
	emailing emailing.Emailing,
	providerSettings factory.ProviderSettings,
	orgGetter organization.Getter,
	alertmanager alertmanager.Alertmanager,
	analytics analytics.Analytics,
	querier querier.Querier,
	telemetryStore telemetrystore.TelemetryStore,
	telemetryMetadataStore telemetrytypes.MetadataStore,
	authNs map[authtypes.AuthNProvider]authn.AuthN,
	authz authz.AuthZ,
	cache cache.Cache,
	queryParser queryparser.QueryParser,
	config Config,
	dashboard dashboard.Module,
	userGetter user.Getter,
	userRoleStore authtypes.UserRoleStore,
	serviceAccount serviceaccount.Module,
	serviceAccountGetter serviceaccount.Getter,
	cloudIntegrationModule cloudintegration.Module,
	retentionGetter retention.Getter,
	fl flagger.Flagger,
	tagModule tag.Module,
	metricReductionRule metricreductionrule.Module,
	spanMapper spanmapper.Module,
) Modules {
	quickfilter := implquickfilter.NewModule(implquickfilter.NewStore(sqlstore))
	orgSetter := implorganization.NewSetter(implorganization.NewStore(sqlstore), alertmanager, quickfilter, dashboard, spanMapper)
	// Cleanup callbacks from other modules, invoked when a user is deleted.
	onDeleteUser := []user.OnDeleteUser{
		dashboard.DeletePreferencesForUser,
	}
	userSetter := impluser.NewSetter(impluser.NewStore(sqlstore, providerSettings), tokenizer, emailing, providerSettings, orgSetter, authz, analytics, config.User, userRoleStore, userGetter, onDeleteUser)
	ruleStore := sqlrulestore.NewRuleStore(sqlstore, queryParser, providerSettings)
	authDomainModule := implauthdomain.NewModule(implauthdomain.NewStore(sqlstore), authNs, authz)

	return Modules{
		OrgGetter:            orgGetter,
		OrgSetter:            orgSetter,
		Preference:           implpreference.NewModule(implpreference.NewStore(sqlstore), preferencetypes.NewAvailablePreference()),
		SavedView:            implsavedview.NewModule(implsavedview.NewStore(sqlstore)),
		Apdex:                implapdex.NewModule(sqlstore),
		Dashboard:            dashboard,
		UserSetter:           userSetter,
		UserGetter:           userGetter,
		RetentionGetter:      retentionGetter,
		QuickFilter:          quickfilter,
		TraceFunnel:          impltracefunnel.NewModule(impltracefunnel.NewStore(sqlstore)),
		RawDataExport:        implrawdataexport.NewModule(querier),
		AuthDomain:           authDomainModule,
		Session:              implsession.NewModule(providerSettings, authNs, userSetter, userGetter, authDomainModule, tokenizer, orgGetter, authz, config.Global),
		SpanPercentile:       implspanpercentile.NewModule(querier, providerSettings),
		Services:             implservices.NewModule(querier, telemetryStore),
		MetricsExplorer:      implmetricsexplorer.NewModule(telemetryStore, telemetryMetadataStore, cache, ruleStore, dashboard, fl, providerSettings, config.MetricsExplorer),
		MetricReductionRule:  metricReductionRule,
		InfraMonitoring:      implinframonitoring.NewModule(telemetryStore, telemetryMetadataStore, querier, fl, providerSettings, config.InfraMonitoring),
		Promote:              implpromote.NewModule(telemetryMetadataStore, telemetryStore, providerSettings),
		ServiceAccount:       serviceAccount,
		ServiceAccountGetter: serviceAccountGetter,
		LogsPipeline:         impllogspipeline.NewModule(sqlstore),
		RuleStateHistory:     implrulestatehistory.NewModule(implrulestatehistory.NewStore(telemetryStore, telemetryMetadataStore, providerSettings.Logger), ruleStore),
		CloudIntegration:     cloudIntegrationModule,
		TraceDetail:          impltracedetail.NewModule(impltracedetail.NewTraceStore(telemetryStore, telemetryMetadataStore, fl), providerSettings, config.TraceDetail),
		SpanMapper:           spanMapper,
		LLMPricingRule:       impllmpricingrule.NewModule(impllmpricingrule.NewStore(sqlstore), querier),
		Tag:                  tagModule,
	}
}
