package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/modules/integration"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/organizationtest"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/integrations/catalog"
	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

const autoInstallInterval = time.Minute

func autoInstallDemo(t *testing.T) []catalog.Package {
	return []catalog.Package{withAlerts(t, testPackage("builtin-demo", "1.0.0", "Demo", "", testDashboard{id: "overview", title: "Overview"}), testAlert{id: "high-memory", name: "High memory"})}
}

func (f *assetsFixture) autoInstaller(t *testing.T, packages []catalog.Package) *Manager {
	m := f.manager(t, packages...)
	m.setAutoInstall([]string{"builtin-demo"})
	return m
}

func (f *assetsFixture) autoInstall(t *testing.T, m *Manager, org valuer.UUID) (AutoInstallOutcome, error) {
	t.Helper()
	result, err := m.AutoInstall(context.Background(), org, "builtin-demo", autoInstallInterval)
	return result.Outcome, err
}

// failingFailedRecord fails to record a failed auto-install.
type failingFailedRecord struct {
	InstalledIntegrationsRepo
}

func (r failingFailedRecord) saveAutoInstall(ctx context.Context, row *cloudintegrationtypes.StorableIntegrationAutoInstall) error {
	if row.State == cloudintegrationtypes.IntegrationAutoInstallStateFailed {
		return errors.New("disk full")
	}
	return r.InstalledIntegrationsRepo.saveAutoInstall(ctx, row)
}

// A failure that cannot be recorded is not lost: both errors come back, and
// the record shows no failure it did not keep.
func TestAutoInstallFailureThatCannotBeRecorded(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			m := f.autoInstaller(t, autoInstallDemo(t))
			m.installedIntegrationsRepo = failingFailedRecord{m.installedIntegrationsRepo}
			f.rules.failOrg = f.org

			result, err := m.AutoInstall(context.Background(), f.org, "builtin-demo", autoInstallInterval)
			assert.Equal(t, AutoInstallFailed, result.Outcome)
			assert.ErrorContains(t, err, "ruler unavailable")
			assert.ErrorContains(t, err, "disk full")
			assert.ErrorContains(t, err, "could not record the failed auto-install of builtin-demo")
			assert.Nil(t, result.NextAttemptAt, "no backoff was recorded")
			row := f.record(t, m, f.org)
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStatePending, row.State)
			assert.Zero(t, row.Attempts)
		})
	}
}

func TestAutoInstallLogs(t *testing.T) {
	var buf bytes.Buffer
	settings := factorytest.NewSettings()
	settings.Logger = slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
	service, err := newAutoInstallService(settings, nil, nil, integration.Config{AutoInstall: []string{"builtin-demo"}, ReconcileInterval: autoInstallInterval})
	require.NoError(t, err)
	org := valuer.GenerateUUID()
	next := time.Date(2026, 11, 13, 19, 0, 0, 0, time.UTC)
	lines := func() []map[string]any {
		var out []map[string]any
		for _, line := range bytes.Split(bytes.TrimSpace(buf.Bytes()), []byte("\n")) {
			var entry map[string]any
			require.NoError(t, json.Unmarshal(line, &entry))
			out = append(out, entry)
		}
		buf.Reset()
		return out
	}

	service.log(context.Background(), org, "builtin-demo", AutoInstallResult{Outcome: AutoInstallFailed, Attempts: 3, NextAttemptAt: &next}, errors.New("ruler unavailable"))
	logged := lines()
	require.Len(t, logged, 1)
	assert.Equal(t, "WARN", logged[0]["level"])
	assert.Equal(t, org.StringValue(), logged[0]["org_id"])
	assert.Equal(t, "builtin-demo", logged[0]["integration"])
	assert.EqualValues(t, 3, logged[0]["attempt"])
	assert.Equal(t, "2026-11-13T19:00:00Z", logged[0]["next_attempt_at"])

	service.log(context.Background(), org, "builtin-demo", AutoInstallResult{Outcome: AutoInstallBusy}, nil)
	logged = lines()
	require.Len(t, logged, 1)
	assert.Equal(t, "DEBUG", logged[0]["level"])
	assert.Equal(t, org.StringValue(), logged[0]["org_id"])
	assert.Equal(t, "builtin-demo", logged[0]["integration"])
	assert.NotContains(t, logged[0], "attempt")

	service.log(context.Background(), org, "builtin-demo", AutoInstallResult{Outcome: AutoInstallSkipped}, nil)
	assert.Empty(t, buf.String(), "a pass with nothing to do logs nothing")
}

func (f *assetsFixture) record(t *testing.T, m *Manager, org valuer.UUID) *cloudintegrationtypes.StorableIntegrationAutoInstall {
	t.Helper()
	row, err := m.installedIntegrationsRepo.getAutoInstall(context.Background(), org.StringValue(), "builtin-demo")
	require.NoError(t, err)
	return row
}

func TestAutoInstallInstallsOnce(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			m := f.autoInstaller(t, autoInstallDemo(t))

			outcome, err := f.autoInstall(t, m, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallInstalled, outcome)
			assert.True(t, f.installed(t, m))
			assert.Len(t, f.assets(t, m), 2)
			for _, rule := range f.rules.rules {
				assert.Equal(t, "fusescope:auto-install", rule.actor, "the backend is the actor, with no user")
			}
			row := f.record(t, m, f.org)
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateDone, row.State)
			assert.Equal(t, "1.0.0", row.Version)
			require.NotNil(t, row.DoneAt)

			writes := f.rules.writes
			outcome, err = f.autoInstall(t, m, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallSkipped, outcome, "a restart or another pass does nothing")
			assert.Equal(t, writes, f.rules.writes)
		})
	}
}

func TestAutoInstallLeavesAUsersInstallation(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			m := f.autoInstaller(t, autoInstallDemo(t))
			require.Nil(t, f.install(m))
			writes := f.rules.writes

			outcome, err := f.autoInstall(t, m, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallAlreadyInstalled, outcome)
			assert.Equal(t, writes, f.rules.writes, "a user's installation is left as it is")
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateDone, f.record(t, m, f.org).State)

			outcome, err = f.autoInstall(t, m, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallSkipped, outcome, "already_installed is reported once, when recorded")
		})
	}
}

// An organization that uninstalls an integration the backend installed is
// never given it again; installing it from the UI stays possible and does
// not turn the backend's installation back on.
func TestUninstallSuppressesAutoInstall(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			m := f.autoInstaller(t, autoInstallDemo(t))
			_, err := f.autoInstall(t, m, f.org)
			require.NoError(t, err)

			require.Nil(t, f.uninstall(m))
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateSuppressed, f.record(t, m, f.org).State)
			outcome, err := f.autoInstall(t, m, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallSkipped, outcome)
			assert.False(t, f.installed(t, m))

			require.Nil(t, f.install(m), "installing from the UI")
			require.Nil(t, f.uninstall(m))
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateSuppressed, f.record(t, m, f.org).State)
		})
	}
}

// A user who installs and uninstalls a configured integration before the
// backend's first pass has made a choice the backend respects.
func TestUninstallBeforeTheFirstAutoInstall(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			m := f.autoInstaller(t, autoInstallDemo(t))
			require.Nil(t, f.install(m))
			require.Nil(t, f.uninstall(m))
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateSuppressed, f.record(t, m, f.org).State)

			outcome, err := f.autoInstall(t, m, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallSkipped, outcome)
			assert.False(t, f.installed(t, m))

			other := f.manager(t, autoInstallDemo(t)...)
			org := f.org
			f.org = valuer.GenerateUUID()
			require.Nil(t, f.install(other))
			require.Nil(t, f.uninstall(other))
			assert.Nil(t, f.record(t, other, f.org), "an integration the backend does not install records nothing")
			f.org = org
		})
	}
}

func TestAutoInstallBacksOffAndRecovers(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			m := f.autoInstaller(t, autoInstallDemo(t))
			f.rules.failOrg = f.org

			outcome, err := f.autoInstall(t, m, f.org)
			assert.Equal(t, AutoInstallFailed, outcome)
			assert.ErrorContains(t, err, "ruler unavailable")
			row := f.record(t, m, f.org)
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateFailed, row.State)
			assert.EqualValues(t, 1, row.Attempts)
			assert.Contains(t, row.LastError, "ruler unavailable")
			assert.Equal(t, autoInstallInterval, row.NextAttemptAt.Sub(*row.LastAttemptAt))
			assert.True(t, f.installed(t, m), "the installation stays, to be completed")

			outcome, err = f.autoInstall(t, m, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallSkipped, outcome, "not before the next attempt")

			f.clock.advance(autoInstallInterval)
			outcome, _ = f.autoInstall(t, m, f.org)
			assert.Equal(t, AutoInstallFailed, outcome)
			row = f.record(t, m, f.org)
			assert.EqualValues(t, 2, row.Attempts)
			assert.Equal(t, 2*autoInstallInterval, row.NextAttemptAt.Sub(*row.LastAttemptAt))

			f.rules.failOrg = valuer.UUID{}
			f.clock.advance(2 * autoInstallInterval)
			outcome, err = f.autoInstall(t, m, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallInstalled, outcome, "the backend's own installation is completed, not taken for a user's")
			row = f.record(t, m, f.org)
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateDone, row.State)
			assert.Empty(t, row.LastError)
			assert.Len(t, f.rules.names(f.org), 1)
		})
	}
}

func TestAutoInstallBackoff(t *testing.T) {
	for _, tc := range []struct {
		interval time.Duration
		attempts int64
		want     time.Duration
	}{
		{time.Minute, 1, time.Minute},
		{time.Minute, 2, 2 * time.Minute},
		{time.Minute, 3, 4 * time.Minute},
		{time.Minute, 6, 32 * time.Minute},
		{time.Minute, 7, time.Hour},
		{time.Minute, 1000, time.Hour},
		{2 * time.Hour, 1, time.Hour},
	} {
		assert.Equal(t, tc.want, autoInstallBackoff(tc.interval, tc.attempts), "%s after %d", tc.interval, tc.attempts)
	}
}

// Replicas run the same pass: one installs, the other finds the operation
// held, which is not a failure.
func TestConcurrentAutoInstall(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			a, b := f.autoInstaller(t, autoInstallDemo(t)), f.autoInstaller(t, autoInstallDemo(t))
			// Steps: decide, upsert, then the assets.
			paused, resume := pauseAtStep(a, 2)

			first := make(chan AutoInstallOutcome)
			go func() {
				outcome, _ := f.autoInstall(t, a, f.org)
				first <- outcome
			}()
			<-paused
			outcome, err := f.autoInstall(t, b, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallBusy, outcome)
			resume()
			assert.Equal(t, AutoInstallInstalled, <-first)

			row := f.record(t, a, f.org)
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateDone, row.State)
			assert.Zero(t, row.Attempts)
			assert.Len(t, f.rules.names(f.org), 1)
		})
	}
}

// A replica that loses the lease midway records no failure; the one that
// takes over completes the installation as the backend's own.
func TestAutoInstallLosingTheLease(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			f := newAssetsFixture(open(t))
			a, b := f.autoInstaller(t, autoInstallDemo(t)), f.autoInstaller(t, autoInstallDemo(t))
			// Steps: decide, upsert, reserve the dashboard; pause before it.
			paused, resume := pauseAtStep(a, 3)

			first := make(chan AutoInstallOutcome)
			go func() {
				outcome, _ := f.autoInstall(t, a, f.org)
				first <- outcome
			}()
			<-paused
			f.clock.advance(operationLease)
			outcome, err := f.autoInstall(t, b, f.org)
			require.NoError(t, err)
			assert.Equal(t, AutoInstallInstalled, outcome)
			resume()
			assert.Equal(t, AutoInstallBusy, <-first)

			row := f.record(t, a, f.org)
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateDone, row.State)
			assert.Zero(t, row.Attempts, "losing the lease is no failure")
			assert.Len(t, f.assets(t, b), 2)
			assert.Len(t, f.rules.names(f.org), 1)
		})
	}
}

type countedAttempts map[[2]string]int64

func readAttempts(t *testing.T, reader *sdkmetric.ManualReader) countedAttempts {
	t.Helper()
	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))
	out := countedAttempts{}
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name != "fusescope.integrations.autoinstall.attempts" {
				continue
			}
			for _, dp := range m.Data.(metricdata.Sum[int64]).DataPoints {
				integration, _ := dp.Attributes.Value("integration")
				outcome, _ := dp.Attributes.Value("outcome")
				_, hasOrg := dp.Attributes.Value("org_id")
				assert.False(t, hasOrg, "the metric carries no organization")
				out[[2]string{integration.AsString(), outcome.AsString()}] = dp.Value
			}
		}
	}
	return out
}

// Every owned organization, existing or created since the last pass; a
// failure in one does not stop the others; removing the configuration
// installs and uninstalls nothing.
func TestAutoInstallServicePasses(t *testing.T) {
	for name, open := range newTestStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			f := newAssetsFixture(open(t))
			m := f.autoInstaller(t, autoInstallDemo(t))
			orgA, orgB, orgC := valuer.GenerateUUID(), valuer.GenerateUUID(), valuer.GenerateUUID()
			f.rules.failOrg = orgB
			org := func(id valuer.UUID) *types.Organization {
				return &types.Organization{Identifiable: types.Identifiable{ID: id}}
			}

			getter := organizationtest.NewMockGetter(t)
			getter.EXPECT().ListByOwnedKeyRange(ctx).Return([]*types.Organization{org(orgA), org(orgB)}, nil).Once()
			getter.EXPECT().ListByOwnedKeyRange(ctx).Return([]*types.Organization{org(orgA), org(orgB), org(orgC)}, nil).Once()
			reader := sdkmetric.NewManualReader()
			settings := factorytest.NewSettings()
			settings.MeterProvider = sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
			config := integration.Config{AutoInstall: []string{"builtin-demo"}, ReconcileInterval: autoInstallInterval}
			service, err := newAutoInstallService(settings, m, getter, config)
			require.NoError(t, err)

			service.reconcile(ctx)
			assert.True(t, installedIn(t, m, orgA))
			assert.Equal(t, cloudintegrationtypes.IntegrationAutoInstallStateFailed, recordIn(t, m, orgB).State)

			service.reconcile(ctx)
			assert.True(t, installedIn(t, m, orgC), "an organization created since is picked up")
			assert.Equal(t, countedAttempts{{"builtin-demo", "installed"}: 2, {"builtin-demo", "failed"}: 1}, readAttempts(t, reader),
				"orgB waits for its next attempt; orgA is not counted again")

			idle, err := newAutoInstallService(settings, m, getter, integration.Config{ReconcileInterval: autoInstallInterval})
			require.NoError(t, err)
			idle.reconcile(ctx)
			assert.True(t, installedIn(t, m, orgA), "removing the configuration uninstalls nothing")
		})
	}
}

func installedIn(t *testing.T, m *Manager, org valuer.UUID) bool {
	t.Helper()
	installation, apiErr := m.getInstalledIntegration(context.Background(), org.StringValue(), "builtin-demo")
	require.Nil(t, apiErr)
	return installation != nil
}

func recordIn(t *testing.T, m *Manager, org valuer.UUID) *cloudintegrationtypes.StorableIntegrationAutoInstall {
	t.Helper()
	row, err := m.installedIntegrationsRepo.getAutoInstall(context.Background(), org.StringValue(), "builtin-demo")
	require.NoError(t, err)
	require.NotNil(t, row)
	return row
}

func TestValidateAutoInstall(t *testing.T) {
	m := newCatalogManager(t, newTestSQLStore(t), autoInstallDemo(t)...)
	require.NoError(t, ValidateAutoInstall(context.Background(), m.availableIntegrationsRepo, nil))
	require.NoError(t, ValidateAutoInstall(context.Background(), m.availableIntegrationsRepo, []string{"builtin-demo"}))
	err := ValidateAutoInstall(context.Background(), m.availableIntegrationsRepo, []string{"builtin-demo", "builtin-gone"})
	assert.ErrorContains(t, err, "builtin-gone not served by this release, whose catalog holds builtin-demo")
	var apiErr *model.ApiError
	assert.False(t, errors.As(err, &apiErr))
}
