package integrations

import (
	"context"
	"fmt"
	"log/slog"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/modules/dashboard/dashboardtest"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/integrations/catalog"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testPackage(id string, version string, title string, pipelineName string) catalog.Package {
	pipelines := `[]`
	if pipelineName != "" {
		pipelines = fmt.Sprintf(`[{"name": %q, "alias": "parse", "enabled": true, "filter": {"op": "AND", "items": []}, "config": []}]`, pipelineName)
	}
	return catalog.Package{ID: id, Version: version, Document: fmt.Appendf(nil, `{
		"id": %q, "title": %q, "description": "", "author": {"name": "", "email": "", "homepage": ""},
		"icon": "", "categories": [], "overview": "", "configuration": [],
		"assets": {"logs": {"pipelines": %s}, "dashboards": null, "alerts": null},
		"connection_tests": {"logs": {"attribute_key": "source", "attribute_value": "demo"}},
		"data_collected": {"logs": [], "metrics": []}
	}`, id, title, pipelines)}
}

func newCatalogManager(t *testing.T, store sqlstore.SQLStore, packages ...catalog.Package) *Manager {
	t.Helper()
	available, err := NewCatalogIntegrations(&catalog.Catalog{Packages: packages})
	require.NoError(t, err)
	manager, err := NewManager(store, dashboardtest.NewMockModule(t), available, slog.Default())
	require.NoError(t, err)
	return manager
}

func TestInstallPinsTheCatalogVersion(t *testing.T) {
	ctx := context.Background()
	store := newTestSQLStore(t)
	orgID := valuer.GenerateUUID().StringValue()

	installedOnV1 := newCatalogManager(t, store, testPackage("builtin-demo", "1.0.0", "Demo v1", "parse v1"), testPackage("builtin-other", "1.0.0", "Other", ""))
	item, apiErr := installedOnV1.InstallIntegration(ctx, orgID, "builtin-demo", cloudintegrationtypes.InstalledIntegrationConfig{}, "admin@example.com", valuer.GenerateUUID())
	require.Nil(t, apiErr)
	assert.Equal(t, "1.0.0", item.Version)
	assert.Equal(t, "1.0.0", item.LatestVersion)

	upgraded := newCatalogManager(t, store, testPackage("builtin-demo", "1.0.0", "Demo v1", "parse v1"), testPackage("builtin-demo", "1.1.0", "Demo v1.1", "parse v1.1"), testPackage("builtin-other", "1.0.0", "Other", ""), testPackage("builtin-other", "1.2.0", "Other", ""))

	t.Run("DetailServesThePin", func(t *testing.T) {
		integration, apiErr := upgraded.GetIntegration(ctx, orgID, "builtin-demo")
		require.Nil(t, apiErr)
		assert.Equal(t, "Demo v1", integration.Title)
		assert.Equal(t, "1.0.0", integration.Version)
		assert.Equal(t, "1.1.0", integration.LatestVersion)
		require.NotNil(t, integration.Installation)
		assert.Equal(t, "1.0.0", integration.Installation.Version)
	})

	t.Run("DetailOfNotInstalledServesTheLatest", func(t *testing.T) {
		integration, apiErr := upgraded.GetIntegration(ctx, orgID, "builtin-other")
		require.Nil(t, apiErr)
		assert.Equal(t, "1.2.0", integration.Version)
		assert.Equal(t, "1.2.0", integration.LatestVersion)
		assert.Nil(t, integration.Installation)
	})

	t.Run("ListShowsPinAndLatest", func(t *testing.T) {
		list, apiErr := upgraded.ListIntegrations(ctx, orgID, nil)
		require.Nil(t, apiErr)
		require.Len(t, list, 2)
		assert.Equal(t, IntegrationsListItem{IntegrationSummary: list[0].IntegrationSummary, IsInstalled: true, Version: "1.0.0", LatestVersion: "1.1.0"}, list[0])
		assert.Equal(t, "Demo v1", list[0].Title)
		assert.Equal(t, IntegrationsListItem{IntegrationSummary: list[1].IntegrationSummary, IsInstalled: false, Version: "1.2.0", LatestVersion: "1.2.0"}, list[1])
	})

	t.Run("PipelinesComeFromThePin", func(t *testing.T) {
		pipelines, err := upgraded.GetPipelinesForInstalledIntegrations(ctx, orgID)
		require.NoError(t, err)
		require.Len(t, pipelines, 1)
		assert.Equal(t, "parse v1", pipelines[0].Name)
	})

	t.Run("ReinstallKeepsThePin", func(t *testing.T) {
		item, apiErr := upgraded.InstallIntegration(ctx, orgID, "builtin-demo", cloudintegrationtypes.InstalledIntegrationConfig{"k": "v"}, "admin@example.com", valuer.GenerateUUID())
		require.Nil(t, apiErr)
		assert.Equal(t, "1.0.0", item.Version)
		assert.Equal(t, "1.1.0", item.LatestVersion)
	})

	t.Run("NewInstallGetsTheLatest", func(t *testing.T) {
		item, apiErr := upgraded.InstallIntegration(ctx, orgID, "builtin-other", cloudintegrationtypes.InstalledIntegrationConfig{}, "admin@example.com", valuer.GenerateUUID())
		require.Nil(t, apiErr)
		assert.Equal(t, "1.2.0", item.Version)
	})

	t.Run("UnknownPinFallsBackToTheLatest", func(t *testing.T) {
		dropped := newCatalogManager(t, store, testPackage("builtin-demo", "2.0.0", "Demo v2", "parse v2"), testPackage("builtin-other", "1.2.0", "Other", ""))
		integration, apiErr := dropped.GetIntegration(ctx, orgID, "builtin-demo")
		require.Nil(t, apiErr)
		assert.Equal(t, "Demo v2", integration.Title)
		assert.Equal(t, "2.0.0", integration.Version)
		assert.Equal(t, "1.0.0", integration.Installation.Version)
	})
}
