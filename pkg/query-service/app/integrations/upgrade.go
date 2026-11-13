package integrations

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var (
	ErrCodeIntegrationNotFound     = errors.MustNewCode("integration_not_found")
	ErrCodeIntegrationNotInstalled = errors.MustNewCode("integration_not_installed")
)

// UpgradeIntegration moves an installation's pin to the latest catalog version
// and brings the resources it owns to that version: those kept are updated in
// place, keeping their ids, new ones are created and dropped ones deleted.
// upgraded is false when the pin already is the latest; the resources are
// still reconciled then, so upgrading again finishes an interrupted upgrade.
func (m *Manager) UpgradeIntegration(ctx context.Context, orgID string, integrationID string, updatedBy string, updater valuer.UUID) (*IntegrationsListItem, bool, error) {
	orgUUID, err := valuer.NewUUID(orgID)
	if err != nil {
		return nil, false, errors.Wrapf(err, errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid org id")
	}

	available, apiErr := m.availableIntegrationsRepo.get(ctx, []string{integrationID})
	if apiErr != nil {
		return nil, false, errors.Wrapf(apiErr, errors.TypeInternal, errors.CodeInternal, "could not fetch integration %s", integrationID)
	}
	latest, ok := available[integrationID]
	if !ok {
		return nil, false, errors.Newf(errors.TypeNotFound, ErrCodeIntegrationNotFound, "integration %s not found", integrationID)
	}

	installation, apiErr := m.getInstalledIntegration(ctx, orgID, integrationID)
	if apiErr != nil {
		return nil, false, errors.Wrapf(apiErr, errors.TypeInternal, errors.CodeInternal, "could not fetch installed integration %s", integrationID)
	}
	if installation == nil {
		return nil, false, errors.Newf(errors.TypeNotFound, ErrCodeIntegrationNotInstalled, "integration %s is not installed", integrationID)
	}
	upgraded := installation.Version != latest.version
	if upgraded {
		if err := m.installedIntegrationsRepo.updateVersion(ctx, orgID, integrationID, latest.version); err != nil {
			return nil, false, err
		}
	}
	if err := m.reconcileAssets(ctx, orgUUID, integrationID, &latest, assetActor{name: updatedBy, id: updater}); err != nil {
		if onlyConflicts(err) {
			return nil, upgraded, errors.Wrapf(err, errors.TypeAlreadyExists, ErrCodeIntegrationAssetBusy, "could not upgrade integration %s", integrationID)
		}
		return nil, upgraded, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not upgrade integration %s", integrationID)
	}

	return &IntegrationsListItem{
		IntegrationSummary: latest.IntegrationSummary,
		IsInstalled:        true,
		Version:            latest.version,
		LatestVersion:      latest.version,
	}, upgraded, nil
}
