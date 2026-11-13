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

// withAlerts adds alert rules to a test package, as a version 2 manifest
// lists them.
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
		entry := map[string]any{"definition": definition}
		if alert.id != "" {
			entry["id"] = alert.id
		}
		list = append(list, entry)
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

func newAssetsFixture(store sqlstore.SQLStore) *assetsFixture {
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

func (f *assetsFixture) upgrade(m *Manager) error {
	_, _, err := m.UpgradeIntegration(context.Background(), f.org.StringValue(), "builtin-demo", "upgrader@example.com", valuer.GenerateUUID())
	return err
}

func (f *assetsFixture) uninstall(m *Manager) *model.ApiError {
	return m.UninstallIntegration(context.Background(), f.org.StringValue(), "builtin-demo")
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

// pauseAtStep makes the manager's nth step from now wait until resumed.
func pauseAtStep(m *Manager, n int) (paused <-chan struct{}, resume func()) {
	reached, release := make(chan struct{}), make(chan struct{})
	var mu sync.Mutex
	count := 0
	m.beforeStep = func() {
		mu.Lock()
		count++
		mine := count == n
		mu.Unlock()
		if mine {
			close(reached)
			<-release
		}
	}
	return reached, func() { close(release) }
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
			f := newAssetsFixture(open(t))
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

			require.Nil(t, f.uninstall(m))
			assert.Empty(t, f.dashboards)
			assert.Empty(t, f.rules.names(f.org))
			assert.Empty(t, f.assets(t, m))
			assert.False(t, f.installed(t, m))
			require.Nil(t, f.uninstall(m), "uninstalling again")
			require.Nil(t, f.install(m), "installing after uninstalling")
			assert.Len(t, f.assets(t, m), 3)
		})
	}
}

// The API serves an integration's alerts as bare rules, as it always has;
// alerts without an id, from a version 1 manifest, are listed and not
// provisioned.
func TestAlertsKeepTheirAPIShape(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"}, testAlert{name: "Listed only"})
	f := newAssetsFixture(newTestSQLStore(t))
	m := f.manager(t, demo)

	integration, apiErr := m.GetIntegration(context.Background(), f.org.StringValue(), "builtin-demo")
	require.Nil(t, apiErr)
	encoded, err := json.Marshal(integration.Assets.Alerts)
	require.NoError(t, err)
	var served []map[string]any
	require.NoError(t, json.Unmarshal(encoded, &served))
	require.Len(t, served, 2)
	for _, rule := range served {
		assert.NotContains(t, rule, "id")
		assert.NotContains(t, rule, "definition")
		assert.Contains(t, rule, "alert")
	}

	require.Nil(t, f.install(m))
	assert.Equal(t, []string{"High memory"}, valuesOf(f.rules.names(f.org)))
}

func TestUpgradeReconcilesAlerts(t *testing.T) {
	v1 := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "a", name: "A v1"}, testAlert{id: "b", name: "B"})
	v11 := withAlerts(t, testPackage("builtin-demo", "1.1.0", "Demo", ""), testAlert{id: "a", name: "A v1.1"}, testAlert{id: "c", name: "C"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			require.Nil(t, f.install(f.manager(t, v1)))
			before := assetIDs(f.assets(t, f.manager(t, v1)))

			m := f.manager(t, v1, v11)
			require.NoError(t, f.upgrade(m))
			after := assetIDs(f.assets(t, m))
			assert.Equal(t, before["a"], after["a"], "a kept alert keeps its rule")
			assert.NotContains(t, after, "b")
			assert.Equal(t, map[valuer.UUID]string{after["a"]: "A v1.1", after["c"]: "C"}, f.rules.names(f.org))
			for _, asset := range f.assets(t, m) {
				assert.Equal(t, "1.1.0", asset.Version)
			}

			writes := f.rules.writes
			require.NoError(t, f.upgrade(m))
			assert.Equal(t, writes, f.rules.writes, "upgrading an up to date installation changes nothing")
		})
	}
}

// A process that stopped after reserving a resource ID, before or after
// making the resource, holds the operation until its lease passes; the next
// installation then finishes with the reserved ID, never making a second
// resource.
func TestInstallRecoversAnInterruptedCreation(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"})
	for _, created := range []bool{true, false} {
		for name, open := range newTestStores() {
			t.Run(fmt.Sprintf("%s/created=%v", name, created), func(t *testing.T) {
				ctx := context.Background()
				f := newAssetsFixture(open(t))
				m := f.manager(t, demo)
				repo := m.installedIntegrationsRepo
				op, err := repo.acquireIntegrationOperation(ctx, f.org.StringValue(), "builtin-demo", activeOperation, f.clock.Now(), operationLease)
				require.NoError(t, err)
				var reserved *cloudintegrationtypes.StorableIntegrationAsset
				require.NoError(t, repo.runInOperation(ctx, op, f.clock.Now(), operationLease, func(ctx context.Context) error {
					if _, apiErr := repo.upsert(ctx, f.org.StringValue(), "builtin-demo", "1.0.0", nil); apiErr != nil {
						return apiErr
					}
					var err error
					reserved, err = repo.reserveIntegrationAsset(ctx, f.org.StringValue(), "builtin-demo", cloudintegrationtypes.IntegrationAssetKindAlert, "high-memory", f.clock.Now())
					return err
				}))
				resourceID := valuer.MustNewUUID(reserved.ResourceID)
				if created {
					rule := demoRule(t, m).Definition
					require.NoError(t, f.rules.CreateRuleInOrg(ctx, f.org, resourceID, "admin@example.com", &rule))
				}

				assertConflict(t, f.install(m))
				f.clock.advance(operationLease)
				require.Nil(t, f.install(m))

				assert.Equal(t, map[valuer.UUID]string{resourceID: "High memory"}, f.rules.names(f.org), "the reserved resource, once")
				assets := f.assets(t, m)
				require.Len(t, assets, 1)
				assert.Equal(t, cloudintegrationtypes.IntegrationAssetStateReady, assets[0].State)
			})
		}
	}
}

func TestInstallFailureIsVisibleAndRetryable(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
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

// An installer that loses the operation while paused changes nothing after
// it resumes; the one that took over finishes.
func TestConcurrentInstallWithAnExpiringLease(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			slow, fast := f.manager(t, demo), f.manager(t, demo)
			// Steps: upsert, reserve, create.
			paused, resume := pauseAtStep(slow, 3)

			slowResult := make(chan *model.ApiError)
			go func() { slowResult <- f.install(slow) }()
			<-paused
			assertConflict(t, f.install(fast))
			f.clock.advance(operationLease)
			require.Nil(t, f.install(fast), "the second installer takes the expired operation over")
			resume()
			assertConflict(t, <-slowResult)

			assets := f.assets(t, fast)
			require.Len(t, assets, 1)
			assert.Equal(t, cloudintegrationtypes.IntegrationAssetStateReady, assets[0].State)
			assert.Equal(t, map[valuer.UUID]string{valuer.MustNewUUID(assets[0].ResourceID): "High memory"}, f.rules.names(f.org))
		})
	}
}

// An uninstallation that took over a paused installation wins: the
// installer, resumed, cannot add an asset, so nothing is left behind.
func TestInstallRacingUninstall(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", ""), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			installer, uninstaller := f.manager(t, demo), f.manager(t, demo)
			paused, resume := pauseAtStep(installer, 3)

			installing := make(chan *model.ApiError)
			go func() { installing <- f.install(installer) }()
			<-paused
			assertConflict(t, f.uninstall(uninstaller))
			f.clock.advance(operationLease)
			require.Nil(t, f.uninstall(uninstaller))
			resume()
			assertConflict(t, <-installing)

			assert.Empty(t, f.rules.names(f.org))
			assert.Empty(t, f.assets(t, uninstaller))
			assert.False(t, f.installed(t, uninstaller))
		})
	}
}

// An uninstallation that owns no asset yet still keeps an installation from
// adding the first one, or recording itself, until it finishes, even after
// its lease passed.
func TestUninstallOfNoAssetsHoldsOffInstall(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", "", testDashboard{id: "overview", title: "Overview"}), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			uninstaller, installer := f.manager(t, demo), f.manager(t, demo)
			// The only step of uninstalling nothing: recording it.
			paused, resume := pauseAtStep(uninstaller, 1)

			uninstalling := make(chan *model.ApiError)
			go func() { uninstalling <- f.uninstall(uninstaller) }()
			<-paused
			assertConflict(t, f.install(installer))
			f.clock.advance(10 * operationLease)
			assertConflict(t, f.install(installer))
			assert.False(t, f.installed(t, installer), "an installation cannot cancel an uninstallation")
			assert.Empty(t, f.assets(t, installer))

			resume()
			require.Nil(t, <-uninstalling, "the uninstallation finishes")
			require.Nil(t, f.install(installer))
			assert.Len(t, f.assets(t, installer), 2)
		})
	}
}

// A reconciliation of the old version that lost the operation to an upgrade
// leaves nothing of the old version behind.
func TestOldVersionReconcileRacingUpgrade(t *testing.T) {
	v1 := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", "", testDashboard{id: "overview", title: "Overview v1"}), testAlert{id: "a", name: "A v1"}, testAlert{id: "b", name: "B v1"})
	v11 := withAlerts(t, testPackage("builtin-demo", "1.1.0", "Demo", "", testDashboard{id: "overview", title: "Overview v1.1"}), testAlert{id: "a", name: "A v1.1"}, testAlert{id: "c", name: "C"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			old := f.manager(t, v1)
			// Steps: upsert, then reserve and create each asset; pause before
			// creating the second.
			paused, resume := pauseAtStep(old, 5)

			stale := make(chan *model.ApiError)
			go func() { stale <- f.install(old) }()
			<-paused
			f.clock.advance(operationLease)
			upgrader := f.manager(t, v1, v11)
			require.NoError(t, f.upgrade(upgrader))
			resume()
			assertConflict(t, <-stale)

			assets := f.assets(t, upgrader)
			for _, asset := range assets {
				assert.Equal(t, "1.1.0", asset.Version, "%s %s", asset.Kind.StringValue(), asset.Slug)
			}
			ids := assetIDs(assets)
			assert.Equal(t, map[valuer.UUID]string{ids["a"]: "A v1.1", ids["c"]: "C"}, f.rules.names(f.org))
			require.Len(t, f.dashboards, 1)
			for _, dashboard := range f.dashboards {
				assert.Equal(t, "Overview v1.1", dashboard.Spec.Display.Name)
			}
		})
	}
}

// A resource deleted after it was made, by a user or by accident, is not
// made again: installing again or upgrading leaves it deleted, and
// uninstalling forgets it.
func TestDeletedResourcesStayDeleted(t *testing.T) {
	v1 := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", "", testDashboard{id: "overview", title: "Overview v1"}), testAlert{id: "a", name: "A v1"})
	v11 := withAlerts(t, testPackage("builtin-demo", "1.1.0", "Demo", "", testDashboard{id: "overview", title: "Overview v1.1"}), testAlert{id: "a", name: "A v1.1"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			f := newAssetsFixture(open(t))
			m := f.manager(t, v1, v11)
			require.Nil(t, f.install(f.manager(t, v1)))
			ids := assetIDs(f.assets(t, m))
			require.NoError(t, m.dashboardModule.DeleteUnsafeV2(ctx, f.org, ids["overview"]))
			require.NoError(t, f.rules.DeleteRuleInOrg(ctx, f.org, ids["a"]))

			require.Nil(t, f.install(m), "installing again")
			assert.Empty(t, f.dashboards)
			assert.Empty(t, f.rules.names(f.org))

			require.NoError(t, f.upgrade(m), "upgrading")
			assert.Empty(t, f.dashboards)
			assert.Empty(t, f.rules.names(f.org))
			for _, asset := range f.assets(t, m) {
				assert.Equal(t, cloudintegrationtypes.IntegrationAssetStateReady, asset.State, "the record stays as a tombstone")
				assert.Equal(t, "1.1.0", asset.Version)
			}

			require.Nil(t, f.uninstall(m))
			assert.Empty(t, f.assets(t, m))
			assert.False(t, f.installed(t, m))
		})
	}
}

// An uninstallation that stopped midway keeps the integration from being
// installed until uninstalling again finishes the work.
func TestUninstallInterruptedIsFinishedByUninstallingAgain(t *testing.T) {
	demo := withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", "", testDashboard{id: "overview", title: "Overview"}), testAlert{id: "high-memory", name: "High memory"})
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			m := f.manager(t, demo)
			require.Nil(t, f.install(m))
			f.rules.beforeDelete = func(valuer.UUID) error { return errors.New("ruler unavailable") }

			require.NotNil(t, f.uninstall(m))
			assert.True(t, f.installed(t, m), "a failed uninstallation leaves the installation")
			assertConflict(t, f.install(m))

			f.rules.beforeDelete = nil
			require.Nil(t, f.uninstall(m))
			assert.Empty(t, f.assets(t, m))
			assert.Empty(t, f.dashboards)
			assert.Empty(t, f.rules.names(f.org))
			require.Nil(t, f.install(m), "installing after the uninstallation finished")
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
