package integrations

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard/dashboardtest"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/integrations/catalog"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestUpgradeIntegration(t *testing.T) {
	demoV1 := testPackage("builtin-demo", "1.0.0", "Demo v1", "parse v1", testDashboard{id: "overview", title: "Overview v1"}, testDashboard{id: "legacy", title: "Legacy"})
	demoV11 := testPackage("builtin-demo", "1.1.0", "Demo v1.1", "parse v1.1", testDashboard{id: "overview", title: "Overview v1.1"}, testDashboard{id: "queries", title: "Queries"})
	latestDashboards := map[string]string{"demo-overview": "Overview v1.1", "demo-queries": "Queries"}

	testCases := []struct {
		name           string
		installedOn    []catalog.Package
		upgradedOn     []catalog.Package
		integrationID  string
		wantErr        bool
		wantVersion    string
		wantDashboards map[string]string
		wantWrites     int
	}{
		{
			name:           "OlderPin_MovesPinAndReprovisionsDashboards",
			installedOn:    []catalog.Package{demoV1},
			upgradedOn:     []catalog.Package{demoV1, demoV11},
			integrationID:  "builtin-demo",
			wantVersion:    "1.1.0",
			wantDashboards: latestDashboards,
			wantWrites:     3,
		},
		{
			name:           "PinDroppedFromCatalog_MovesPinAndReprovisionsDashboards",
			installedOn:    []catalog.Package{demoV1},
			upgradedOn:     []catalog.Package{demoV11},
			integrationID:  "builtin-demo",
			wantVersion:    "1.1.0",
			wantDashboards: latestDashboards,
			wantWrites:     3,
		},
		{
			name:           "LatestPin_NoOp",
			installedOn:    []catalog.Package{demoV1, demoV11},
			upgradedOn:     []catalog.Package{demoV1, demoV11},
			integrationID:  "builtin-demo",
			wantVersion:    "1.1.0",
			wantDashboards: latestDashboards,
			wantWrites:     0,
		},
		{
			name:          "NotInstalled_NotFound",
			upgradedOn:    []catalog.Package{demoV1, demoV11},
			integrationID: "builtin-demo",
			wantErr:       true,
		},
		{
			name:          "UnknownIntegration_NotFound",
			installedOn:   []catalog.Package{demoV1},
			upgradedOn:    []catalog.Package{demoV1, demoV11},
			integrationID: "builtin-missing",
			wantErr:       true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ctx := context.Background()
			store := newTestSQLStore(t)
			orgID := valuer.GenerateUUID()
			dashboards := map[valuer.UUID]*dashboardtypes.DashboardV2{}
			config := cloudintegrationtypes.InstalledIntegrationConfig{"endpoint": "redis:6379"}

			if testCase.installedOn != nil {
				installer := newCatalogManager(t, store, testCase.installedOn...)
				installer.dashboardModule = newDashboardsInMemory(t, store, dashboards)
				_, apiErr := installer.InstallIntegration(ctx, orgID.StringValue(), "builtin-demo", config, "installer@example.com", valuer.GenerateUUID())
				require.Nil(t, apiErr)
			}
			idsBefore := dashboardIDsBySlug(t, store, orgID)

			upgrader := newCatalogManager(t, store, testCase.upgradedOn...)
			upgraderDashboards := newDashboardsInMemory(t, store, dashboards)
			upgrader.dashboardModule = upgraderDashboards
			item, _, err := upgrader.UpgradeIntegration(ctx, orgID.StringValue(), testCase.integrationID, "upgrader@example.com", valuer.GenerateUUID())

			if testCase.wantErr {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeNotFound), "got %v", err)
				assert.Equal(t, idsBefore, dashboardIDsBySlug(t, store, orgID))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, IntegrationsListItem{IntegrationSummary: item.IntegrationSummary, IsInstalled: true, Version: testCase.wantVersion, LatestVersion: testCase.wantVersion}, *item)

			integration, apiErr := upgrader.GetIntegration(ctx, orgID.StringValue(), "builtin-demo")
			require.Nil(t, apiErr)
			require.NotNil(t, integration.Installation)
			assert.Equal(t, testCase.wantVersion, integration.Installation.Version)
			assert.Equal(t, config, integration.Installation.Config)

			pipelines, err := upgrader.GetPipelinesForInstalledIntegrations(ctx, orgID.StringValue())
			require.NoError(t, err)
			require.Len(t, pipelines, 1)
			assert.Equal(t, "parse v1.1", pipelines[0].Name)

			idsAfter := dashboardIDsBySlug(t, store, orgID)
			titles := map[string]string{}
			for slug, id := range idsAfter {
				require.Contains(t, dashboards, id)
				titles[slug] = dashboards[id].Spec.Display.Name
				assert.True(t, dashboards[id].Locked, "integration dashboards stay locked")
				if before, existed := idsBefore[slug]; existed {
					assert.Equal(t, before, id, "dashboard %s keeps its id", slug)
				}
			}
			assert.Equal(t, testCase.wantDashboards, titles)
			assert.Len(t, dashboards, len(testCase.wantDashboards))

			writes := 0
			for _, call := range upgraderDashboards.Calls {
				if call.Method != "GetV2" {
					writes++
				}
			}
			assert.Equal(t, testCase.wantWrites, writes)
		})
	}
}

// newDashboardsInMemory serves the dashboard module from dashboards, keeping
// the dashboard table the integration_dashboard rows join on in step.
func newDashboardsInMemory(t *testing.T, store sqlstore.SQLStore, dashboards map[valuer.UUID]*dashboardtypes.DashboardV2) *dashboardtest.MockModule {
	t.Helper()
	module := dashboardtest.NewMockModule(t)
	module.EXPECT().
		CreateV2(mock.Anything, mock.Anything, mock.Anything, mock.Anything, dashboardtypes.SourceIntegration, mock.Anything).
		RunAndReturn(func(ctx context.Context, orgID valuer.UUID, createdBy string, _ valuer.UUID, source dashboardtypes.Source, postable dashboardtypes.PostableDashboardV2) (*dashboardtypes.DashboardV2, error) {
			require.NoError(t, postable.Validate())
			created, err := postable.NewDashboardV2(orgID, createdBy, source)
			require.NoError(t, err)
			_, err = store.BunDBCtx(ctx).ExecContext(ctx, "INSERT INTO dashboard (id, org_id) VALUES (?, ?)", created.ID.StringValue(), orgID.StringValue())
			require.NoError(t, err)
			dashboards[created.ID] = created
			return created, nil
		}).
		Maybe()
	module.EXPECT().
		GetV2(mock.Anything, mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, _ valuer.UUID, id valuer.UUID) (*dashboardtypes.DashboardV2, error) {
			existing, ok := dashboards[id]
			if !ok {
				return nil, errors.Newf(errors.TypeNotFound, errors.CodeNotFound, "dashboard %s not found", id)
			}
			found := *existing
			return &found, nil
		}).
		Maybe()
	module.EXPECT().
		UpdateUnsafeV2(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, _ valuer.UUID, id valuer.UUID, updatedBy string, updatable dashboardtypes.UpdatableDashboardV2) (*dashboardtypes.DashboardV2, error) {
			require.NoError(t, updatable.Validate())
			require.Contains(t, dashboards, id)
			if err := dashboards[id].UpdateUnsafe(updatable, updatedBy, nil); err != nil {
				return nil, err
			}
			return dashboards[id], nil
		}).
		Maybe()
	module.EXPECT().
		DeleteUnsafeV2(mock.Anything, mock.Anything, mock.Anything).
		RunAndReturn(func(ctx context.Context, _ valuer.UUID, id valuer.UUID) error {
			_, err := store.BunDBCtx(ctx).ExecContext(ctx, "DELETE FROM dashboard WHERE id = ?", id.StringValue())
			require.NoError(t, err)
			delete(dashboards, id)
			return nil
		}).
		Maybe()
	return module
}

func dashboardIDsBySlug(t *testing.T, store sqlstore.SQLStore, orgID valuer.UUID) map[string]valuer.UUID {
	t.Helper()
	repo, err := NewInstalledIntegrationsSqliteRepo(store)
	require.NoError(t, err)
	rows, err := repo.listIntegrationDashboardsBySlugPrefix(context.Background(), orgID.StringValue(), "")
	require.NoError(t, err)
	ids := map[string]valuer.UUID{}
	for _, row := range rows {
		ids[row.Slug] = valuer.MustNewUUID(row.DashboardID)
	}
	return ids
}
