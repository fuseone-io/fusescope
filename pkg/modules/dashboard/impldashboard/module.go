package impldashboard

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/analytics"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/modules/tag"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/queryparser"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type module struct {
	querier                 querier.Querier
	store                   dashboardtypes.Store
	settings                factory.ScopedProviderSettings
	analytics               analytics.Analytics
	orgGetter               organization.Getter
	queryParser             queryparser.QueryParser
	tagModule               tag.Module
	systemDashboardRegistry dashboardtypes.SystemDashboardRegistry
}

func NewModule(store dashboardtypes.Store, settings factory.ProviderSettings, analytics analytics.Analytics, orgGetter organization.Getter, queryParser queryparser.QueryParser, tagModule tag.Module, systemDashboardRegistry dashboardtypes.SystemDashboardRegistry, querier querier.Querier) dashboard.Module {
	scopedProviderSettings := factory.NewScopedProviderSettings(settings, "github.com/fuseone-io/fusescope/pkg/modules/dashboard/impldashboard")
	return &module{
		querier:                 querier,
		store:                   store,
		settings:                scopedProviderSettings,
		analytics:               analytics,
		orgGetter:               orgGetter,
		queryParser:             queryParser,
		tagModule:               tagModule,
		systemDashboardRegistry: systemDashboardRegistry,
	}
}
func (module *module) Collect(ctx context.Context, orgID valuer.UUID) (map[string]any, error) {
	dashboards, err := module.store.List(ctx, orgID)
	if err != nil {
		return nil, err
	}

	return dashboardtypes.NewStatsFromStorableDashboards(dashboards), nil
}
