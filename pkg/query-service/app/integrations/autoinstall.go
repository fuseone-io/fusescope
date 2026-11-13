package integrations

import (
	"context"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/integration"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// autoInstallActor is who the backend's own installations are made by: no
// user, no API key.
var autoInstallActor = assetActor{name: "fusescope:auto-install"}

// maxAutoInstallBackoff caps the wait between failed attempts.
const maxAutoInstallBackoff = time.Hour

// AutoInstallOutcome is what one auto-install attempt did.
type AutoInstallOutcome string

const (
	// AutoInstallSkipped: nothing to do, now or yet: done, suppressed, or
	// waiting for the next attempt after a failure. Not counted.
	AutoInstallSkipped AutoInstallOutcome = "skipped"
	// AutoInstallInstalled: the backend installed it.
	AutoInstallInstalled AutoInstallOutcome = "installed"
	// AutoInstallAlreadyInstalled: a user had installed it; recorded done.
	AutoInstallAlreadyInstalled AutoInstallOutcome = "already_installed"
	// AutoInstallFailed: the attempt failed; retried after a backoff.
	AutoInstallFailed AutoInstallOutcome = "failed"
	// AutoInstallBusy: another request holds or took the integration's
	// operation; not a failure, tried again on the next pass.
	AutoInstallBusy AutoInstallOutcome = "busy"
)

// autoInstallBackoff is the wait after the given number of failed attempts:
// the interval, doubled on each further failure, at most an hour.
func autoInstallBackoff(interval time.Duration, attempts int64) time.Duration {
	wait := interval
	for i := int64(1); i < attempts; i++ {
		wait *= 2
		if wait >= maxAutoInstallBackoff {
			return maxAutoInstallBackoff
		}
	}
	return min(wait, maxAutoInstallBackoff)
}

// ValidateAutoInstall requires every configured integration to be one this
// backend serves.
func ValidateAutoInstall(ctx context.Context, available AvailableIntegrationsRepo, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	served, apiErr := available.list(ctx)
	if apiErr != nil {
		return apiErr
	}
	known := make([]string, 0, len(served))
	for _, i := range served {
		known = append(known, i.Id)
	}
	slices.Sort(known)
	var unknown []string
	for _, id := range ids {
		if !slices.Contains(known, id) {
			unknown = append(unknown, id)
		}
	}
	if len(unknown) > 0 {
		return errors.Newf(errors.TypeInvalidInput, integration.ErrCodeInvalidConfig,
			"integrations.autoinstall: %s not served by this release, whose catalog holds %s",
			strings.Join(unknown, ", "), strings.Join(known, ", "))
	}
	return nil
}

// setAutoInstall sets the integrations the backend installs by itself.
func (m *Manager) setAutoInstall(ids []string) {
	m.autoInstall = map[string]bool{}
	for _, id := range ids {
		m.autoInstall[id] = true
	}
}

// suppressAutoInstall, within the integration's operation, records that the
// organization uninstalled an integration the backend installs or would:
// it is never installed by the backend again.
func (m *Manager) suppressAutoInstall(ctx context.Context, orgID string, integrationID string) error {
	row, err := m.installedIntegrationsRepo.getAutoInstall(ctx, orgID, integrationID)
	if err != nil {
		return err
	}
	if row == nil {
		if !m.autoInstall[integrationID] {
			return nil
		}
		row = &cloudintegrationtypes.StorableIntegrationAutoInstall{OrgID: orgID, Integration: integrationID}
	}
	row.State = cloudintegrationtypes.IntegrationAutoInstallStateSuppressed
	row.NextAttemptAt = nil
	row.UpdatedAt = m.now()
	return m.installedIntegrationsRepo.saveAutoInstall(ctx, row)
}

// AutoInstall installs an integration in an organization once, as the
// backend, the way a user would; retryBase is the wait after the first
// failure. It holds the integration's operation throughout, so it never
// races a user's install or uninstall.
func (m *Manager) AutoInstall(ctx context.Context, orgID valuer.UUID, integrationID string, retryBase time.Duration) (AutoInstallOutcome, error) {
	// Most passes find nothing to do; they need no operation.
	if row, err := m.installedIntegrationsRepo.getAutoInstall(ctx, orgID.StringValue(), integrationID); err != nil {
		return AutoInstallFailed, err
	} else if !m.dueForAutoInstall(row) {
		return AutoInstallSkipped, nil
	}

	op, err := m.startOperation(ctx, orgID, integrationID, cloudintegrationtypes.IntegrationOperationStateActive)
	if err != nil {
		if lostOperation(err) {
			return AutoInstallBusy, nil
		}
		return AutoInstallFailed, err
	}
	defer m.endOperation(ctx, op)

	var row *cloudintegrationtypes.StorableIntegrationAutoInstall
	outcome := AutoInstallSkipped
	if err := m.step(ctx, op, func(ctx context.Context) error {
		var err error
		if row, err = m.installedIntegrationsRepo.getAutoInstall(ctx, orgID.StringValue(), integrationID); err != nil {
			return err
		}
		if !m.dueForAutoInstall(row) {
			return nil
		}
		installed, apiErr := m.installedIntegrationsRepo.get(ctx, orgID.StringValue(), []string{integrationID})
		if apiErr != nil {
			return apiErr
		}
		// Installed with no record: a user did it first. With a pending or
		// failed record, the installation is the backend's own, to complete.
		if installation, ok := installed[integrationID]; ok && row == nil {
			outcome = AutoInstallAlreadyInstalled
			return m.installedIntegrationsRepo.saveAutoInstall(ctx, m.doneAutoInstall(row, orgID, integrationID, installation.Version))
		}
		// Recorded before installing: whoever takes the operation over
		// finds the installation its own, to complete, not a user's.
		outcome = AutoInstallInstalled
		if row == nil {
			row = &cloudintegrationtypes.StorableIntegrationAutoInstall{
				OrgID: orgID.StringValue(), Integration: integrationID,
				State: cloudintegrationtypes.IntegrationAutoInstallStatePending, UpdatedAt: m.now(),
			}
			return m.installedIntegrationsRepo.saveAutoInstall(ctx, row)
		}
		return nil
	}); err != nil {
		if lostOperation(err) {
			return AutoInstallBusy, nil
		}
		return AutoInstallFailed, err
	}
	if outcome != AutoInstallInstalled {
		return outcome, nil
	}

	installErr := func() error {
		latest, apiErr := m.getIntegrationDetails(ctx, integrationID)
		if apiErr != nil {
			return apiErr
		}
		served, err := m.install(ctx, op, orgID, latest, cloudintegrationtypes.InstalledIntegrationConfig{}, autoInstallActor)
		if err != nil {
			return err
		}
		return m.step(ctx, op, func(ctx context.Context) error {
			return m.installedIntegrationsRepo.saveAutoInstall(ctx, m.doneAutoInstall(row, orgID, integrationID, served.version))
		})
	}()
	if installErr == nil {
		return AutoInstallInstalled, nil
	}
	if lostOperation(installErr) {
		return AutoInstallBusy, nil
	}

	failed := m.failedAutoInstall(row, orgID, integrationID, installErr, retryBase)
	if err := m.step(ctx, op, func(ctx context.Context) error {
		return m.installedIntegrationsRepo.saveAutoInstall(ctx, failed)
	}); err != nil && lostOperation(err) {
		return AutoInstallBusy, nil
	}
	return AutoInstallFailed, installErr
}

// dueForAutoInstall reports whether the record leaves an attempt to make now.
func (m *Manager) dueForAutoInstall(row *cloudintegrationtypes.StorableIntegrationAutoInstall) bool {
	if row == nil {
		return true
	}
	switch row.State {
	case cloudintegrationtypes.IntegrationAutoInstallStateDone, cloudintegrationtypes.IntegrationAutoInstallStateSuppressed:
		return false
	case cloudintegrationtypes.IntegrationAutoInstallStateFailed:
		return row.NextAttemptAt == nil || !m.now().Before(*row.NextAttemptAt)
	}
	return true
}

func (m *Manager) doneAutoInstall(row *cloudintegrationtypes.StorableIntegrationAutoInstall, orgID valuer.UUID, integrationID string, version string) *cloudintegrationtypes.StorableIntegrationAutoInstall {
	now := m.now()
	done := &cloudintegrationtypes.StorableIntegrationAutoInstall{OrgID: orgID.StringValue(), Integration: integrationID}
	if row != nil {
		*done = *row
	}
	done.State = cloudintegrationtypes.IntegrationAutoInstallStateDone
	done.LastError = ""
	done.NextAttemptAt = nil
	done.DoneAt = &now
	done.Version = version
	done.UpdatedAt = now
	return done
}

func (m *Manager) failedAutoInstall(row *cloudintegrationtypes.StorableIntegrationAutoInstall, orgID valuer.UUID, integrationID string, cause error, retryBase time.Duration) *cloudintegrationtypes.StorableIntegrationAutoInstall {
	now := m.now()
	failed := &cloudintegrationtypes.StorableIntegrationAutoInstall{OrgID: orgID.StringValue(), Integration: integrationID}
	if row != nil {
		*failed = *row
	}
	failed.State = cloudintegrationtypes.IntegrationAutoInstallStateFailed
	failed.Attempts++
	failed.LastError = cause.Error()
	failed.LastAttemptAt = &now
	next := now.Add(autoInstallBackoff(retryBase, failed.Attempts))
	failed.NextAttemptAt = &next
	failed.UpdatedAt = now
	return failed
}

// autoInstallService installs the configured integrations in every owned
// organization, at startup and every reconcile interval, which also picks up
// the organizations created since. It reports healthy at once: a failure is
// logged, counted, recorded and retried, and never holds up startup.
type autoInstallService struct {
	settings  factory.ScopedProviderSettings
	manager   *Manager
	orgGetter organization.Getter
	config    integration.Config
	attempts  metric.Int64Counter
	stopC     chan struct{}
	healthyC  chan struct{}
}

func newAutoInstallService(providerSettings factory.ProviderSettings, manager *Manager, orgGetter organization.Getter, config integration.Config) (*autoInstallService, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/query-service/app/integrations")
	attempts, err := settings.Meter().Int64Counter("fusescope.integrations.autoinstall.attempts",
		metric.WithDescription("Auto-install attempts that changed something or were tried, by integration and outcome."))
	if err != nil {
		return nil, err
	}
	return &autoInstallService{
		settings:  settings,
		manager:   manager,
		orgGetter: orgGetter,
		config:    config,
		attempts:  attempts,
		stopC:     make(chan struct{}),
		healthyC:  make(chan struct{}),
	}, nil
}

func (service *autoInstallService) Start(ctx context.Context) error {
	close(service.healthyC)

	if len(service.config.AutoInstall) == 0 {
		select {
		case <-service.stopC:
		case <-ctx.Done():
		}
		return nil
	}

	ticker := time.NewTicker(service.config.ReconcileInterval)
	defer ticker.Stop()
	for {
		service.reconcile(ctx)
		select {
		case <-service.stopC:
			return nil
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (service *autoInstallService) Healthy() <-chan struct{} {
	return service.healthyC
}

func (service *autoInstallService) Stop(_ context.Context) error {
	close(service.stopC)
	return nil
}

// reconcile makes one pass; a failure in one organization does not stop the
// others.
func (service *autoInstallService) reconcile(ctx context.Context) {
	if len(service.config.AutoInstall) == 0 {
		return
	}
	orgs, err := service.orgGetter.ListByOwnedKeyRange(ctx)
	if err != nil {
		service.settings.Logger().WarnContext(ctx, "auto-install could not list organizations, retrying", errors.Attr(err))
		return
	}
	for _, org := range orgs {
		for _, id := range service.config.AutoInstall {
			outcome, err := service.manager.AutoInstall(ctx, org.ID, id, service.config.ReconcileInterval)
			if outcome != AutoInstallSkipped {
				service.attempts.Add(ctx, 1, metric.WithAttributes(attribute.String("integration", id), attribute.String("outcome", string(outcome))))
			}
			switch outcome {
			case AutoInstallInstalled, AutoInstallAlreadyInstalled:
				service.settings.Logger().InfoContext(ctx, "integration auto-installed", slog.String("org_id", org.ID.StringValue()), slog.String("integration", id), slog.String("outcome", string(outcome)))
			case AutoInstallFailed:
				service.settings.Logger().WarnContext(ctx, "integration auto-install failed, retrying later", slog.String("org_id", org.ID.StringValue()), slog.String("integration", id), errors.Attr(err))
			}
		}
	}
}
