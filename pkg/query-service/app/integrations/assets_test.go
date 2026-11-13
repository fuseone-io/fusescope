package integrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/query-service/app/integrations/catalog"
	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type testClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *testClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *testClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

type testAlert struct {
	id   string
	name string
}

// withAlerts adds alert rules to a test package.
func withAlerts(t *testing.T, pkg catalog.Package, alerts ...testAlert) catalog.Package {
	t.Helper()
	var document map[string]any
	require.NoError(t, json.Unmarshal(pkg.Document, &document))
	list := []any{}
	for _, alert := range alerts {
		var definition map[string]any
		require.NoError(t, json.Unmarshal(fmt.Appendf(nil, `{
			"alert": %q, "version": "v5", "schemaVersion": "v2alpha1", "ruleType": "threshold_rule",
			"condition": {
				"compositeQuery": {"queryType": "builder", "queries": [{"type": "builder_query", "spec": {
					"name": "A", "signal": "metrics", "aggregations": [{"metricName": "otelcol_process_memory_rss", "spaceAggregation": "max"}], "stepInterval": "1m"}}]},
				"thresholds": {"kind": "basic", "spec": [{"name": "critical", "target": 90.0, "matchType": "1", "op": "1"}]}
			},
			"evaluation": {"kind": "rolling", "spec": {"evalWindow": "5m", "frequency": "1m"}},
			"notificationSettings": {"renotify": {"enabled": true, "interval": "4h", "alertStates": ["firing"]}}
		}`, alert.name), &definition))
		list = append(list, map[string]any{"id": alert.id, "definition": definition})
	}
	document["assets"].(map[string]any)["alerts"] = list
	encoded, err := json.Marshal(document)
	require.NoError(t, err)
	pkg.Document = encoded
	return pkg
}

type assetsFixture struct {
	store      sqlstore.SQLStore
	rules      *memoryRules
	dashboards map[valuer.UUID]*dashboardtypes.DashboardV2
	clock      *testClock
	org        valuer.UUID
}

func newAssetsFixture(t *testing.T, store sqlstore.SQLStore) *assetsFixture {
	return &assetsFixture{
		store:      store,
		rules:      newMemoryRules(),
		dashboards: map[valuer.UUID]*dashboardtypes.DashboardV2{},
		clock:      &testClock{now: time.Now()},
		org:        valuer.GenerateUUID(),
	}
}

func (f *assetsFixture) manager(t *testing.T, packages ...catalog.Package) *Manager {
	m := newCatalogManager(t, f.store, packages...)
	m.rules = f.rules
	m.dashboardModule = newDashboardsInMemory(t, f.store, f.dashboards)
	m.now = f.clock.Now
	return m
}

func (f *assetsFixture) install(m *Manager) *model.ApiError {
	_, apiErr := m.InstallIntegration(context.Background(), f.org.StringValue(), "builtin-demo", cloudintegrationtypes.InstalledIntegrationConfig{}, "admin@example.com", valuer.GenerateUUID())
	return apiErr
}

func (f *assetsFixture) assets(t *testing.T, m *Manager) []*cloudintegrationtypes.StorableIntegrationAsset {
	assets, err := m.installedIntegrationsRepo.listIntegrationAssets(context.Background(), f.org.StringValue(), "builtin-demo")
	require.NoError(t, err)
	return assets
}

func (f *assetsFixture) installed(t *testing.T, m *Manager) bool {
	installation, apiErr := m.getInstalledIntegration(context.Background(), f.org.StringValue(), "builtin-demo")
	require.Nil(t, apiErr)
	return installation != nil
}

func assertConflict(t *testing.T, apiErr *model.ApiError) {
	t.Helper()
	require.NotNil(t, apiErr)
	assert.Equal(t, model.ErrorConflict, apiErr.Typ, "got %v", apiErr)
}

func TestInstallProvisionsDashboardsAndAlertsOnce(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", "", testDashboard{id: "overview", title: "Overview"}),
		testAlert{id: "high-memory", name: "High memory"}, testAlert{id: "refused", name: "Refused data"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(t, open(t))
			m := f.manager(t, demo)

			require.Nil(t, f.install(m))
			assets := f.assets(t, m)
			require.Len(t, assets, 3)
			for _, asset := range assets {
				assert.Equal(t, cloudintegrationtypes.IntegrationAssetStateReady, asset.State)
				assert.Equal(t, "1.0.0", asset.Version)
			}
			assert.Len(t, f.dashboards, 1)
			assert.ElementsMatch(t, []string{"High memory", "Refused data"}, valuesOf(f.rules.names(f.org)))
			for _, rule := range f.rules.rules {
				assert.Equal(t, "admin@example.com", rule.actor)
			}

			writes := f.rules.writes
			require.Nil(t, f.install(m), "installing again")
			assert.Equal(t, writes, f.rules.writes, "installing again changes nothing")
			assert.Len(t, f.dashboards, 1)
			assert.Len(t, f.assets(t, m), 3)

			require.Nil(t, m.UninstallIntegration(context.Background(), f.org.StringValue(), "builtin-demo"))
			assert.Empty(t, f.dashboards)
			assert.Empty(t, f.rules.names(f.org))
			assert.Empty(t, f.assets(t, m))
			assert.False(t, f.installed(t, m))
			require.Nil(t, m.UninstallIntegration(context.Background(), f.org.StringValue(), "builtin-demo"), "uninstalling again")
		})
	}
}

func TestUpgradeReconcilesAlerts(t *testing.T) {
	v1 := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "a", name: "A v1"}, testAlert{id: "b", name: "B"})
	v11 := withAlerts(t, testPackage("builtin-demo", "1.1.0", "Demo", ""), testAlert{id: "a", name: "A v1.1"}, testAlert{id: "c", name: "C"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			f := newAssetsFixture(t, open(t))
			require.Nil(t, f.install(f.manager(t, v1)))
			before := assetIDs(f.assets(t, f.manager(t, v1)))

			m := f.manager(t, v1, v11)
			_, upgraded, err := m.UpgradeIntegration(ctx, f.org.StringValue(), "builtin-demo", "upgrader@example.com", valuer.GenerateUUID())
			require.NoError(t, err)
			assert.True(t, upgraded)

			after := assetIDs(f.assets(t, m))
			assert.Equal(t, before["a"], after["a"], "a kept alert keeps its rule")
			assert.NotContains(t, after, "b")
			assert.Equal(t, map[valuer.UUID]string{after["a"]: "A v1.1", after["c"]: "C"}, f.rules.names(f.org))
			for _, asset := range f.assets(t, m) {
				assert.Equal(t, "1.1.0", asset.Version)
			}

			writes := f.rules.writes
			_, upgraded, err = m.UpgradeIntegration(ctx, f.org.StringValue(), "builtin-demo", "upgrader@example.com", valuer.GenerateUUID())
			require.NoError(t, err)
			assert.False(t, upgraded)
			assert.Equal(t, writes, f.rules.writes, "upgrading an up to date installation changes nothing")
		})
	}
}

// A process that stopped after creating a resource and before recording it
// leaves the asset creating with its resource ID; once its lease passes, the
// next installation finds that resource and records it, without a second one.
func TestInstallRecoversAnInterruptedCreation(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"})
	for _, created := range []bool{true, false} {
		for name, open := range newTestStores() {
			t.Run(fmt.Sprintf("%s/created=%v", name, created), func(t *testing.T) {
				ctx := context.Background()
				f := newAssetsFixture(t, open(t))
				m := f.manager(t, demo)
				_, apiErr := m.installedIntegrationsRepo.upsert(ctx, f.org.StringValue(), "builtin-demo", "1.0.0", nil)
				require.Nil(t, apiErr)
				claim, _, err := m.installedIntegrationsRepo.claimIntegrationAsset(ctx, f.org.StringValue(), "builtin-demo", cloudintegrationtypes.IntegrationAssetKindAlert, "high-memory", f.clock.Now(), assetLease)
				require.NoError(t, err)
				resourceID := valuer.MustNewUUID(claim.ResourceID)
				if created {
					rule := demoRule(t, m).Definition
					require.NoError(t, f.rules.CreateRuleInOrg(ctx, f.org, resourceID, "admin@example.com", &rule))
				}

				assertConflict(t, f.install(m))
				f.clock.advance(assetLease)
				require.Nil(t, f.install(m))

				assert.Equal(t, map[valuer.UUID]string{resourceID: "High memory"}, f.rules.names(f.org), "the reserved resource, once")
				assets := f.assets(t, m)
				require.Len(t, assets, 1)
				assert.Equal(t, cloudintegrationtypes.IntegrationAssetStateReady, assets[0].State)
				assert.Equal(t, claim.Generation+1, assets[0].Generation)
			})
		}
	}
}

func TestInstallFailureIsVisibleAndRetryable(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(t, open(t))
			m := f.manager(t, demo)
			fail := true
			f.rules.beforeCreate = func(valuer.UUID) error {
				if fail {
					fail = false
					return errors.New("ruler unavailable")
				}
				return nil
			}

			apiErr := f.install(m)
			require.NotNil(t, apiErr)
			assert.Equal(t, model.ErrorInternal, apiErr.Typ)
			assert.ErrorContains(t, apiErr, "ruler unavailable")
			assert.True(t, f.installed(t, m), "the installation stays, to be completed or uninstalled")

			require.Nil(t, f.install(m), "a retry does not wait for the failed attempt's lease")
			assert.Len(t, f.rules.names(f.org), 1)
		})
	}
}

// An installer that loses its lease while creating does not finalize; the
// one that took over does, and both made the same resource.
func TestConcurrentInstallWithAnExpiringLease(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(t, open(t))
			m := f.manager(t, demo)
			stalled, resume := make(chan struct{}), make(chan struct{})
			var once sync.Once
			f.rules.beforeCreate = func(valuer.UUID) error {
				first := false
				once.Do(func() { first = true })
				if first {
					close(stalled)
					<-resume
				}
				return nil
			}

			slow := make(chan *model.ApiError)
			go func() { slow <- f.install(m) }()
			<-stalled
			f.clock.advance(assetLease)
			require.Nil(t, f.install(m), "the second installer takes the expired lease over")
			close(resume)
			require.Nil(t, <-slow, "the first finds the asset ready")

			assets := f.assets(t, m)
			require.Len(t, assets, 1)
			assert.Equal(t, cloudintegrationtypes.IntegrationAssetStateReady, assets[0].State)
			assert.EqualValues(t, 2, assets[0].Generation)
			assert.Equal(t, map[valuer.UUID]string{valuer.MustNewUUID(assets[0].ResourceID): "High memory"}, f.rules.names(f.org))
		})
	}
}

// An uninstallation that runs while an installation is creating wins: the
// installer cannot finalize and removes what it made.
func TestInstallRacingUninstall(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(t, open(t))
			m := f.manager(t, demo)
			stalled, resume := make(chan struct{}), make(chan struct{})
			f.rules.beforeCreate = func(valuer.UUID) error {
				close(stalled)
				<-resume
				return nil
			}

			installing := make(chan *model.ApiError)
			go func() { installing <- f.install(m) }()
			<-stalled
			require.Nil(t, m.UninstallIntegration(context.Background(), f.org.StringValue(), "builtin-demo"))
			close(resume)
			assertConflict(t, <-installing)

			assert.Empty(t, f.rules.names(f.org), "the installer removed the rule it made")
			assert.Empty(t, f.assets(t, m))
			assert.False(t, f.installed(t, m))
		})
	}
}

// An uninstallation that stopped midway leaves the assets deleting: an
// installation is refused until uninstalling again finishes the work.
func TestUninstallInterruptedIsFinishedByUninstallingAgain(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", "", testDashboard{id: "overview", title: "Overview"}), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			f := newAssetsFixture(t, open(t))
			m := f.manager(t, demo)
			require.Nil(t, f.install(m))
			require.NoError(t, m.installedIntegrationsRepo.markIntegrationAssetsDeleting(ctx, f.org.StringValue(), "builtin-demo", f.clock.Now()))

			assertConflict(t, f.install(m))
			assert.True(t, f.installed(t, m))

			require.Nil(t, m.UninstallIntegration(ctx, f.org.StringValue(), "builtin-demo"))
			assert.Empty(t, f.assets(t, m))
			assert.Empty(t, f.dashboards)
			assert.Empty(t, f.rules.names(f.org))

			require.Nil(t, f.install(m), "installing after the uninstallation finished")
			assert.Len(t, f.assets(t, m), 2)
		})
	}
}

func demoRule(t *testing.T, m *Manager) Alert {
	t.Helper()
	details, apiErr := m.getIntegrationDetails(context.Background(), "builtin-demo")
	require.Nil(t, apiErr)
	require.NotEmpty(t, details.Assets.Alerts)
	return details.Assets.Alerts[0]
}

func assetIDs(assets []*cloudintegrationtypes.StorableIntegrationAsset) map[string]valuer.UUID {
	ids := map[string]valuer.UUID{}
	for _, asset := range assets {
		ids[asset.Slug] = valuer.MustNewUUID(asset.ResourceID)
	}
	return ids
}

func valuesOf(m map[valuer.UUID]string) []string {
	values := []string{}
	for _, v := range m {
		values = append(values, v)
	}
	return values
}
