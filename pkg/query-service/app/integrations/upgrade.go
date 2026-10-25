package integrations

import (
	"context"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var (
	ErrCodeIntegrationNotFound     = errors.MustNewCode("integration_not_found")
	ErrCodeIntegrationNotInstalled = errors.MustNewCode("integration_not_installed")
)

// UpgradeIntegration moves an installation's pin to the latest catalog version
// and re-provisions the dashboards it ships: dashboards kept by the new version
// are updated in place, keeping their ids, new ones are created and dropped ones
// deleted. upgraded is false when the pin already is the latest.
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

	upgraded := false
	err = m.installedIntegrationsRepo.runInTx(ctx, func(ctx context.Context) error {
		installation, apiErr := m.getInstalledIntegration(ctx, orgID, integrationID)
		if apiErr != nil {
			return errors.Wrapf(apiErr, errors.TypeInternal, errors.CodeInternal, "could not fetch installed integration %s", integrationID)
		}
		if installation == nil {
			return errors.Newf(errors.TypeNotFound, ErrCodeIntegrationNotInstalled, "integration %s is not installed", integrationID)
		}
		if installation.Version == latest.version {
			return nil
		}

		if err := m.installedIntegrationsRepo.updateVersion(ctx, orgID, integrationID, latest.version); err != nil {
			return err
		}
		upgraded = true
		return m.reprovisionDashboards(ctx, orgUUID, updatedBy, updater, integrationID, &latest)
	})
	if err != nil {
		return nil, false, err
	}

	return &IntegrationsListItem{
		IntegrationSummary: latest.IntegrationSummary,
		IsInstalled:        true,
		Version:            latest.version,
		LatestVersion:      latest.version,
	}, upgraded, nil
}

func (m *Manager) reprovisionDashboards(ctx context.Context, orgID valuer.UUID, updatedBy string, updater valuer.UUID, integrationID string, integration *IntegrationDetails) error {
	bareIntegrationID := strings.TrimPrefix(integrationID, "builtin-")
	rows, err := m.installedIntegrationsRepo.listIntegrationDashboardsBySlugPrefix(ctx, orgID.StringValue(), cloudintegrationtypes.InstalledIntegrationDashboardSlugPrefix(bareIntegrationID))
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not list dashboards of integration %s", integrationID)
	}
	dropped := map[string]*cloudintegrationtypes.StorableIntegrationDashboard{}
	for _, row := range rows {
		dropped[row.Slug] = row
	}

	for _, dd := range integration.Assets.Dashboards {
		slug := cloudintegrationtypes.InstalledIntegrationDashboardSlug(bareIntegrationID, dd.ID)
		row, provisioned := dropped[slug]
		if !provisioned {
			continue
		}
		delete(dropped, slug)

		dashboardID, err := valuer.NewUUID(row.DashboardID)
		if err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "invalid dashboard id for slug %s", slug)
		}
		existing, err := m.dashboardModule.GetV2(ctx, orgID, dashboardID)
		if err != nil {
			return err
		}
		if _, err := m.dashboardModule.UpdateUnsafeV2(ctx, orgID, dashboardID, updatedBy, dd.Definition.ToUpdatable(existing.Name)); err != nil {
			return err
		}
	}

	for _, row := range dropped {
		if err := m.deleteProvisionedDashboard(ctx, orgID, row); err != nil {
			return err
		}
	}

	return m.provisionDashboards(ctx, orgID, updatedBy, updater, integrationID, integration)
}

func (m *Manager) deleteProvisionedDashboard(ctx context.Context, orgID valuer.UUID, row *cloudintegrationtypes.StorableIntegrationDashboard) error {
	if err := m.installedIntegrationsRepo.deleteIntegrationDashboardBySlug(ctx, orgID.StringValue(), row.Slug); err != nil {
		return err
	}

	dashboardID, err := valuer.NewUUID(row.DashboardID)
	if err != nil {
		return err
	}
	return m.dashboardModule.DeleteUnsafeV2(ctx, orgID, dashboardID)
}
