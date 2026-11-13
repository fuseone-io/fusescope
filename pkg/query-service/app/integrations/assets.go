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

// operationLease bounds how long an interrupted operation blocks the next:
// every step renews it, and one step, creating a dashboard or a rule, takes
// well under it.
const operationLease = 2 * time.Minute

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

// startOperation takes the integration's operation over for state.
func (m *Manager) startOperation(ctx context.Context, orgID valuer.UUID, integrationID string, state cloudintegrationtypes.IntegrationOperationState) (*integrationOperation, error) {
	return m.installedIntegrationsRepo.acquireIntegrationOperation(ctx, orgID.StringValue(), integrationID, state, m.now(), operationLease)
}

// endOperation releases op's lease. A failure to release only delays the
// next operation until the lease passes.
func (m *Manager) endOperation(ctx context.Context, op *integrationOperation) {
	if err := m.installedIntegrationsRepo.releaseIntegrationOperation(context.WithoutCancel(ctx), op, m.now()); err != nil {
		m.logger.WarnContext(ctx, "could not release the integration operation", errors.Attr(err))
	}
}

// step runs fn as one change of op: atomically, and only while op still
// holds the integration's operation.
func (m *Manager) step(ctx context.Context, op *integrationOperation, fn func(ctx context.Context) error) error {
	if m.beforeStep != nil {
		m.beforeStep()
	}
	return m.installedIntegrationsRepo.runInOperation(ctx, op, m.now(), operationLease, fn)
}

// reconcileAssets brings the resources an installation owns to what version
// details ships, within op: it creates those missing, updates those an
// earlier version made and removes those the version dropped. Each step
// commits on its own, so after a failure or a crash running it again
// finishes the work without duplicating a resource; it changes nothing when
// the resources are already in step. A resource deleted since it was made
// is not made again. It goes on past an asset it cannot reconcile, and stops
// once op is taken over.
func (m *Manager) reconcileAssets(ctx context.Context, op *integrationOperation, orgID valuer.UUID, integrationID string, details *IntegrationDetails, actor assetActor) error {
	desired := m.desiredAssets(orgID, details, actor)
	wanted := map[assetKey]bool{}
	for _, d := range desired {
		wanted[assetKey{d.kind.StringValue(), d.slug}] = true
	}

	owned, err := m.installedIntegrationsRepo.listIntegrationAssets(ctx, orgID.StringValue(), integrationID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not list the assets of integration %s", integrationID)
	}
	byKey := map[assetKey]*cloudintegrationtypes.StorableIntegrationAsset{}
	var errs []error
	for _, asset := range owned {
		key := assetKey{asset.Kind.StringValue(), asset.Slug}
		if wanted[key] {
			byKey[key] = asset
			continue
		}
		if err := m.removeAsset(ctx, op, orgID, asset); err != nil {
			if lostOperation(err) {
				return err
			}
			errs = append(errs, err)
		}
	}
	for _, d := range desired {
		if err := m.reconcileAsset(ctx, op, orgID, integrationID, details.version, d, byKey[assetKey{d.kind.StringValue(), d.slug}]); err != nil {
			if lostOperation(err) {
				return err
			}
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (m *Manager) reconcileAsset(ctx context.Context, op *integrationOperation, orgID valuer.UUID, integrationID string, version string, d desiredAsset, asset *cloudintegrationtypes.StorableIntegrationAsset) error {
	what := d.kind.StringValue() + " " + d.slug + " of integration " + integrationID
	if asset == nil {
		// The ID is recorded before the resource is made, so a creation
		// interrupted after making it is finished with the same ID.
		if err := m.step(ctx, op, func(ctx context.Context) error {
			var err error
			asset, err = m.installedIntegrationsRepo.reserveIntegrationAsset(ctx, orgID.StringValue(), integrationID, d.kind, d.slug, m.now())
			return err
		}); err != nil {
			return wrapAssetErr(err, "could not reserve %s", what)
		}
	}
	resourceID, err := valuer.NewUUID(asset.ResourceID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "%s has an invalid resource id", what)
	}

	switch {
	case asset.State == cloudintegrationtypes.IntegrationAssetStateCreating:
		return wrapAssetErr(m.step(ctx, op, func(ctx context.Context) error {
			if err := d.create(ctx, resourceID); err != nil {
				return err
			}
			return m.installedIntegrationsRepo.markIntegrationAssetReady(ctx, asset.ID, version, m.now())
		}), "could not create %s", what)
	case asset.Version != version:
		return wrapAssetErr(m.step(ctx, op, func(ctx context.Context) error {
			// A resource deleted since it was made stays deleted.
			if err := d.update(ctx, resourceID); err != nil && !errors.Ast(err, errors.TypeNotFound) {
				return err
			}
			return m.installedIntegrationsRepo.setIntegrationAssetVersion(ctx, asset.ID, version, m.now())
		}), "could not update %s", what)
	}
	return nil
}

// removeAsset deletes an asset's resource, if it still exists, and its
// record, within op.
func (m *Manager) removeAsset(ctx context.Context, op *integrationOperation, orgID valuer.UUID, asset *cloudintegrationtypes.StorableIntegrationAsset) error {
	what := asset.Kind.StringValue() + " " + asset.Slug + " of integration " + asset.Integration
	resourceID, err := valuer.NewUUID(asset.ResourceID)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "%s has an invalid resource id", what)
	}
	return wrapAssetErr(m.step(ctx, op, func(ctx context.Context) error {
		if err := m.deleteAssetResource(ctx, orgID, asset.Kind, resourceID); err != nil {
			return err
		}
		return m.installedIntegrationsRepo.deleteIntegrationAsset(ctx, asset.ID)
	}), "could not remove %s", what)
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

// wrapAssetErr keeps a conflict with another request a conflict, so it is
// reported as one, and stops reconciling once the operation is lost.
func wrapAssetErr(err error, format string, args ...any) error {
	if err == nil {
		return nil
	}
	if errors.Ast(err, errors.TypeAlreadyExists) {
		return err
	}
	return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, format, args...)
}

func lostOperation(err error) bool {
	_, code, _, _, _, _ := errors.Unwrapb(err)
	return errors.Ast(err, errors.TypeAlreadyExists) && (code == ErrCodeIntegrationBusy || code == ErrCodeIntegrationUninstalling)
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
		// Alerts of a v1 manifest have no stable id; they are listed but not
		// provisioned.
		if alert.ID == "" {
			continue
		}
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
