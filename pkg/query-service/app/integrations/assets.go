package integrations

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/fuseone-io/fusescope/pkg/types/ruletypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var (
	// ErrCodeIntegrationAssetBusy: another request is creating one of the
	// integration's resources; retrying after it finishes, or after its lease
	// passes, completes the installation.
	ErrCodeIntegrationAssetBusy = errors.MustNewCode("integration_asset_busy")
	// ErrCodeIntegrationUninstalling: the integration is being uninstalled;
	// installing it again succeeds once the uninstallation finishes.
	ErrCodeIntegrationUninstalling = errors.MustNewCode("integration_uninstalling")
)

// assetLease bounds how long an interrupted creation blocks the next
// attempt: creating a dashboard or a rule takes well under it.
const assetLease = 2 * time.Minute

// Rules manages the alert rules of an organization for a caller that
// authorized the operation itself.
type Rules interface {
	CreateRuleInOrg(ctx context.Context, orgID valuer.UUID, id valuer.UUID, actor string, rule *ruletypes.PostableRule) error
	EditRuleInOrg(ctx context.Context, orgID valuer.UUID, id valuer.UUID, actor string, rule *ruletypes.PostableRule) error
	DeleteRuleInOrg(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error
}

// assetActor names who changes an integration's resources: the user who
// installs or upgrades it, or the system for an installation it makes.
type assetActor struct {
	name string
	// id is the user's, for analytics; zero for the system.
	id valuer.UUID
}

// desiredAsset is one resource an integration version ships.
type desiredAsset struct {
	kind cloudintegrationtypes.IntegrationAssetKind
	slug string
	// create makes the resource with the given ID, or finds it already made.
	create func(ctx context.Context, id valuer.UUID) error
	// update brings an existing resource to this version.
	update func(ctx context.Context, id valuer.UUID) error
}

type assetKey struct {
	kind string
	slug string
}

// reconcileAssets brings the resources an installation owns to what version
// details ships: it creates those missing, updates those an earlier version
// made and removes those the version dropped. Every step is recorded as it
// is done, so after a failure or a crash calling it again finishes the work
// without duplicating a resource; it changes nothing when the resources are
// already in step. It goes on past an asset it cannot reconcile and returns
// every failure.
func (m *Manager) reconcileAssets(ctx context.Context, orgID valuer.UUID, integrationID string, details *IntegrationDetails, actor assetActor) error {
	desired := m.desiredAssets(orgID, details, actor)
	wanted := map[assetKey]bool{}
	for _, d := range desired {
		wanted[assetKey{d.kind.StringValue(), d.slug}] = true
	}

	owned, err := m.installedIntegrationsRepo.listIntegrationAssets(ctx, orgID.StringValue(), integrationID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not list the assets of integration %s", integrationID)
	}
	var errs []error
	for _, asset := range owned {
		if wanted[assetKey{asset.Kind.StringValue(), asset.Slug}] {
			continue
		}
		// A dropped asset, or one whose removal was interrupted.
		if err := m.removeAsset(ctx, orgID, asset, asset.State != cloudintegrationtypes.IntegrationAssetStateDeleting); err != nil {
			errs = append(errs, err)
		}
	}
	for _, d := range desired {
		if err := m.reconcileAsset(ctx, orgID, integrationID, details.version, d); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m *Manager) reconcileAsset(ctx context.Context, orgID valuer.UUID, integrationID string, version string, d desiredAsset) error {
	asset, claim, err := m.installedIntegrationsRepo.claimIntegrationAsset(ctx, orgID.StringValue(), integrationID, d.kind, d.slug, m.now(), assetLease)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not claim %s %s of integration %s", d.kind.StringValue(), d.slug, integrationID)
	}
	resourceID, err := valuer.NewUUID(asset.ResourceID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "%s %s of integration %s has an invalid resource id", d.kind.StringValue(), d.slug, integrationID)
	}

	switch claim {
	case assetBusy:
		return errors.Newf(errors.TypeAlreadyExists, ErrCodeIntegrationAssetBusy, "%s %s of integration %s is being created by another request; retry once it finishes", d.kind.StringValue(), d.slug, integrationID)
	case assetDeleting:
		return errors.Newf(errors.TypeAlreadyExists, ErrCodeIntegrationUninstalling, "integration %s is being uninstalled; install it again once that finishes", integrationID)
	case assetReady:
		if asset.Version == version {
			return nil
		}
		if err := d.update(ctx, resourceID); err != nil && !errors.Ast(err, errors.TypeNotFound) {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not update %s %s of integration %s", d.kind.StringValue(), d.slug, integrationID)
		}
		// A resource someone deleted stays deleted. A version not recorded
		// because the asset changed meanwhile is for its new holder to settle.
		if _, err := m.installedIntegrationsRepo.setIntegrationAssetVersion(ctx, asset.ID, asset.Generation, version, m.now()); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not record %s %s of integration %s", d.kind.StringValue(), d.slug, integrationID)
		}
		return nil
	}

	if err := d.create(ctx, resourceID); err != nil {
		if releaseErr := m.installedIntegrationsRepo.releaseIntegrationAssetLease(ctx, asset.ID, asset.Generation, m.now()); releaseErr != nil {
			err = errors.Join(err, releaseErr)
		}
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not create %s %s of integration %s", d.kind.StringValue(), d.slug, integrationID)
	}
	finalized, err := m.installedIntegrationsRepo.finalizeIntegrationAsset(ctx, asset.ID, asset.Generation, version, m.now())
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not record %s %s of integration %s", d.kind.StringValue(), d.slug, integrationID)
	}
	if finalized {
		return nil
	}

	// The claim was lost while creating: taken over by another request, which
	// creates the same resource, or ended by an uninstallation, which leaves
	// the resource just made to its maker.
	current, err := m.installedIntegrationsRepo.getIntegrationAsset(ctx, asset.ID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not read %s %s of integration %s", d.kind.StringValue(), d.slug, integrationID)
	}
	switch {
	case current != nil && current.State == cloudintegrationtypes.IntegrationAssetStateReady:
		return nil
	case current != nil && current.State == cloudintegrationtypes.IntegrationAssetStateCreating:
		return errors.Newf(errors.TypeAlreadyExists, ErrCodeIntegrationAssetBusy, "%s %s of integration %s is being created by another request; retry once it finishes", d.kind.StringValue(), d.slug, integrationID)
	}
	if err := m.deleteAssetResource(ctx, orgID, asset.Kind, resourceID); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not remove %s %s of integration %s", d.kind.StringValue(), d.slug, integrationID)
	}
	return errors.Newf(errors.TypeAlreadyExists, ErrCodeIntegrationUninstalling, "integration %s was uninstalled during the installation", integrationID)
}

// removeAsset deletes an asset's resource and then its record. mark is false
// when the asset is already deleting.
func (m *Manager) removeAsset(ctx context.Context, orgID valuer.UUID, asset *cloudintegrationtypes.StorableIntegrationAsset, mark bool) error {
	if mark {
		if err := m.installedIntegrationsRepo.markIntegrationAssetDeleting(ctx, asset.ID, m.now()); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not mark %s %s of integration %s for removal", asset.Kind.StringValue(), asset.Slug, asset.Integration)
		}
	}
	resourceID, err := valuer.NewUUID(asset.ResourceID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "%s %s of integration %s has an invalid resource id", asset.Kind.StringValue(), asset.Slug, asset.Integration)
	}
	if err := m.deleteAssetResource(ctx, orgID, asset.Kind, resourceID); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not remove %s %s of integration %s", asset.Kind.StringValue(), asset.Slug, asset.Integration)
	}
	if err := m.installedIntegrationsRepo.deleteIntegrationAsset(ctx, asset.ID); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not forget %s %s of integration %s", asset.Kind.StringValue(), asset.Slug, asset.Integration)
	}
	return nil
}

// removeAllAssets removes every resource an installation owns. Marking them
// all deleting first stops a concurrent installation from finishing any.
func (m *Manager) removeAllAssets(ctx context.Context, orgID valuer.UUID, integrationID string) error {
	if err := m.installedIntegrationsRepo.markIntegrationAssetsDeleting(ctx, orgID.StringValue(), integrationID, m.now()); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not mark the assets of integration %s for removal", integrationID)
	}
	owned, err := m.installedIntegrationsRepo.listIntegrationAssets(ctx, orgID.StringValue(), integrationID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not list the assets of integration %s", integrationID)
	}
	var errs []error
	for _, asset := range owned {
		if err := m.removeAsset(ctx, orgID, asset, false); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// deleteAssetResource deletes a resource, succeeding when there is none.
func (m *Manager) deleteAssetResource(ctx context.Context, orgID valuer.UUID, kind cloudintegrationtypes.IntegrationAssetKind, id valuer.UUID) error {
	var err error
	switch kind {
	case cloudintegrationtypes.IntegrationAssetKindDashboard:
		err = m.dashboardModule.DeleteUnsafeV2(ctx, orgID, id)
	case cloudintegrationtypes.IntegrationAssetKindAlert:
		if m.rules == nil {
			return errors.Newf(errors.TypeInternal, errors.CodeInternal, "alert rules are not available to integrations")
		}
		err = m.rules.DeleteRuleInOrg(ctx, orgID, id)
	default:
		return errors.Newf(errors.TypeInternal, errors.CodeInternal, "unknown integration asset kind %q", kind.StringValue())
	}
	if err != nil && errors.Ast(err, errors.TypeNotFound) {
		return nil
	}
	return err
}

func (m *Manager) desiredAssets(orgID valuer.UUID, details *IntegrationDetails, actor assetActor) []desiredAsset {
	desired := make([]desiredAsset, 0, len(details.Assets.Dashboards)+len(details.Assets.Alerts))
	for _, dd := range details.Assets.Dashboards {
		definition := dd.Definition
		desired = append(desired, desiredAsset{
			kind: cloudintegrationtypes.IntegrationAssetKindDashboard,
			slug: dd.ID,
			create: func(ctx context.Context, id valuer.UUID) error {
				_, err := m.dashboardModule.CreateWithIDV2(ctx, orgID, id, actor.name, actor.id, dashboardtypes.SourceIntegration, definition)
				return err
			},
			update: func(ctx context.Context, id valuer.UUID) error {
				existing, err := m.dashboardModule.GetV2(ctx, orgID, id)
				if err != nil {
					return err
				}
				_, err = m.dashboardModule.UpdateUnsafeV2(ctx, orgID, id, actor.name, definition.ToUpdatable(existing.Name))
				return err
			},
		})
	}
	for _, alert := range details.Assets.Alerts {
		definition := alert.Definition
		desired = append(desired, desiredAsset{
			kind: cloudintegrationtypes.IntegrationAssetKindAlert,
			slug: alert.ID,
			create: func(ctx context.Context, id valuer.UUID) error {
				if m.rules == nil {
					return errors.Newf(errors.TypeInternal, errors.CodeInternal, "alert rules are not available to integrations")
				}
				rule := definition
				return m.rules.CreateRuleInOrg(ctx, orgID, id, actor.name, &rule)
			},
			update: func(ctx context.Context, id valuer.UUID) error {
				if m.rules == nil {
					return errors.Newf(errors.TypeInternal, errors.CodeInternal, "alert rules are not available to integrations")
				}
				rule := definition
				return m.rules.EditRuleInOrg(ctx, orgID, id, actor.name, &rule)
			},
		})
	}
	return desired
}
