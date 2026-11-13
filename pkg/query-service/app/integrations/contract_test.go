package integrations

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/modules/dashboard/dashboardtest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	jsoniter "github.com/json-iterator/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// Regenerate with: go test ./pkg/query-service/app/integrations/ -run TestAPIContract -update
var updateGolden = flag.Bool("update", false, "rewrite the API contract golden files")

type provisionedDashboard struct {
	Slug             string `json:"slug"`
	Source           string `json:"source"`
	DefinitionSHA256 string `json:"definition_sha256"`
	dashboardID      string
}

// TestAPIContract pins what the integrations API serves for every built-in
// integration, byte for byte, as the HTTP handlers encode it.
func TestAPIContract(t *testing.T) {
	ctx := context.Background()
	orgID := valuer.GenerateUUID()
	creator := valuer.GenerateUUID()

	store := newTestSQLStore(t)
	var created []provisionedDashboard
	dashboards := dashboardtest.NewMockModule(t)
	dashboards.EXPECT().
		CreateWithIDV2(mock.Anything, orgID, mock.Anything, "admin@example.com", creator, dashboardtypes.SourceIntegration, mock.Anything).
		RunAndReturn(func(ctx context.Context, orgID valuer.UUID, id valuer.UUID, _ string, _ valuer.UUID, source dashboardtypes.Source, postable dashboardtypes.PostableDashboardV2) (*dashboardtypes.DashboardV2, error) {
			_, err := store.BunDBCtx(ctx).ExecContext(ctx, "INSERT INTO dashboard (id, org_id) VALUES (?, ?)", id.StringValue(), orgID.StringValue())
			require.NoError(t, err)
			created = append(created, provisionedDashboard{Source: source.StringValue(), DefinitionSHA256: sha256Hex(t, postable), dashboardID: id.StringValue()})
			return &dashboardtypes.DashboardV2{Identifiable: types.Identifiable{ID: id}, Source: source, Name: postable.Name}, nil
		}).
		Maybe()
	manager := newTestManager(t, store, dashboards)

	list, apiErr := manager.ListIntegrations(ctx, orgID.StringValue(), nil)
	require.Nil(t, apiErr)
	require.Len(t, list, 11)
	assertGolden(t, "list.json", list)

	for _, item := range list {
		t.Run(item.Id, func(t *testing.T) {
			detail, apiErr := manager.GetIntegration(ctx, orgID.StringValue(), item.Id)
			require.Nil(t, apiErr)
			assertGolden(t, filepath.Join(item.Id, "detail.json"), detail)

			connectionTests, apiErr := manager.GetIntegrationConnectionTests(ctx, orgID.StringValue(), item.Id)
			require.Nil(t, apiErr)
			assertGolden(t, filepath.Join(item.Id, "connection_tests.json"), connectionTests)

			created = nil
			_, apiErr = manager.InstallIntegration(ctx, orgID.StringValue(), item.Id, cloudintegrationtypes.InstalledIntegrationConfig{}, "admin@example.com", creator)
			require.Nil(t, apiErr)

			assets, err := manager.installedIntegrationsRepo.listIntegrationAssets(ctx, orgID.StringValue(), item.Id)
			require.NoError(t, err)
			// The goldens keep the slugs integration_dashboard had, so they
			// show the provisioned dashboards did not change with the table.
			slugs := map[string]string{}
			for _, asset := range assets {
				slugs[asset.ResourceID] = strings.TrimPrefix(item.Id, "builtin-") + "-" + asset.Slug
			}
			provisioned := []provisionedDashboard{}
			for _, dashboard := range created {
				dashboard.Slug = slugs[dashboard.dashboardID]
				provisioned = append(provisioned, dashboard)
			}
			assertGolden(t, filepath.Join(item.Id, "dashboards.json"), provisioned)
		})
	}

	pipelines, err := manager.GetPipelinesForInstalledIntegrations(ctx, orgID.StringValue())
	require.NoError(t, err)
	for i := range pipelines {
		pipelines[i].ID = valuer.UUID{}
	}
	assertGolden(t, "pipelines.json", pipelines)

	installedList, apiErr := manager.ListIntegrations(ctx, orgID.StringValue(), nil)
	require.Nil(t, apiErr)
	assertGolden(t, "list_installed.json", installedList)
}

func newTestManager(t *testing.T, store sqlstore.SQLStore, dashboards *dashboardtest.MockModule) *Manager {
	t.Helper()
	repo, err := NewInstalledIntegrationsSqliteRepo(store)
	require.NoError(t, err)
	return &Manager{
		availableIntegrationsRepo: embeddedIntegrations(t),
		installedIntegrationsRepo: repo,
		dashboardModule:           dashboards,
		rules:                     newMemoryRules(),
		logger:                    slog.Default(),
		now:                       time.Now,
	}
}

func newTestSQLStore(t *testing.T) sqlstore.SQLStore {
	t.Helper()
	return newSQLiteTestStore(t, 1)
}

func encodeLikeAPI(t *testing.T, v any) []byte {
	t.Helper()
	raw, err := jsoniter.ConfigCompatibleWithStandardLibrary.Marshal(v)
	require.NoError(t, err)
	var indented bytes.Buffer
	require.NoError(t, json.Indent(&indented, raw, "", "  "))
	indented.WriteByte('\n')
	return indented.Bytes()
}

func sha256Hex(t *testing.T, v any) string {
	t.Helper()
	raw, err := jsoniter.ConfigCompatibleWithStandardLibrary.Marshal(v)
	require.NoError(t, err)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// assertGolden compares v, encoded as the API encodes it, with
// testdata/contract/<name>. Indentation is reversible, so equal files mean
// byte-identical responses.
func assertGolden(t *testing.T, name string, v any) {
	t.Helper()
	path := filepath.Join("testdata", "contract", name)
	got := encodeLikeAPI(t, v)
	if *updateGolden {
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
		require.NoError(t, os.WriteFile(path, got, 0o644))
		return
	}
	want, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Equal(t, string(want), string(got), "%s differs from the golden file", name)
}
