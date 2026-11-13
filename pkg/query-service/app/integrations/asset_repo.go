package integrations

import (
	"context"
	"database/sql"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var (
	// ErrCodeIntegrationBusy: another request is installing, upgrading or
	// uninstalling the integration; retrying once it finishes, or once its
	// lease passes, goes through.
	ErrCodeIntegrationBusy = errors.MustNewCode("integration_busy")
	// ErrCodeIntegrationUninstalling: the integration is being uninstalled;
	// installing or upgrading it succeeds only once that finishes.
	ErrCodeIntegrationUninstalling = errors.MustNewCode("integration_uninstalling")
)

// acquireAttempts bounds the retries when the operation row changes under
// an acquisition; each follows another request's progress.
const acquireAttempts = 4

type assetStorable = cloudintegrationtypes.StorableIntegrationAsset

type operationStorable = cloudintegrationtypes.StorableIntegrationOperation

// integrationOperation is an operation this request holds.
type integrationOperation struct {
	orgID       string
	integration string
	state       cloudintegrationtypes.IntegrationOperationState
	generation  int64
}

// acquireIntegrationOperation takes the integration's operation over for
// state: active to install or upgrade, uninstalling to uninstall. It
// succeeds when no operation holds a live lease, except that nothing but an
// uninstallation takes over an unfinished uninstallation.
func (r *InstalledIntegrationsSqliteRepo) acquireIntegrationOperation(
	ctx context.Context, orgID string, integration string, state cloudintegrationtypes.IntegrationOperationState, now time.Time, lease time.Duration,
) (*integrationOperation, error) {
	db := r.store.BunDBCtx(ctx)
	leaseUntil := now.Add(lease).UnixMilli()
	for range acquireAttempts {
		row := &operationStorable{OrgID: orgID, Integration: integration, State: state, Generation: 1, LeaseUntil: leaseUntil, UpdatedAt: now}
		res, err := db.NewInsert().Model(row).On("CONFLICT (org_id, integration) DO NOTHING").Exec(ctx)
		if err != nil {
			return nil, err
		}
		if inserted, err := res.RowsAffected(); err != nil {
			return nil, err
		} else if inserted == 1 {
			return &integrationOperation{orgID: orgID, integration: integration, state: state, generation: 1}, nil
		}

		current := new(operationStorable)
		if err := db.NewSelect().Model(current).Where("org_id = ?", orgID).Where("integration = ?", integration).Scan(ctx); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return nil, err
		}
		if current.State == cloudintegrationtypes.IntegrationOperationStateUninstalling && state != cloudintegrationtypes.IntegrationOperationStateUninstalling {
			return nil, errors.Newf(errors.TypeAlreadyExists, ErrCodeIntegrationUninstalling, "integration %s is being uninstalled; install it again once that finishes", integration)
		}
		if current.LeaseUntil > now.UnixMilli() {
			return nil, errors.Newf(errors.TypeAlreadyExists, ErrCodeIntegrationBusy, "integration %s is being changed by another request; retry once it finishes", integration)
		}
		if r.beforeTakeOver != nil {
			r.beforeTakeOver()
		}
		// The holder may renew its lease between the read and this update,
		// without moving the generation: the update takes over only what was
		// read, a lease still passed, and otherwise the row is read again.
		res, err = db.NewUpdate().Model((*operationStorable)(nil)).
			Set("state = ?", state).
			Set("generation = ?", current.Generation+1).
			Set("lease_until = ?", leaseUntil).
			Set("updated_at = ?", now).
			Where("org_id = ?", orgID).
			Where("integration = ?", integration).
			Where("generation = ?", current.Generation).
			Where("state = ?", current.State).
			Where("lease_until <= ?", now.UnixMilli()).
			Exec(ctx)
		if err != nil {
			return nil, err
		}
		if taken, err := res.RowsAffected(); err != nil {
			return nil, err
		} else if taken == 1 {
			return &integrationOperation{orgID: orgID, integration: integration, state: state, generation: current.Generation + 1}, nil
		}
	}
	return nil, errors.Newf(errors.TypeAlreadyExists, ErrCodeIntegrationBusy, "integration %s is being changed by other requests; retry", integration)
}

// runInOperation runs fn in a transaction that first confirms op still
// holds the integration's operation, and renews its lease. The confirming
// update locks the operation row until the transaction ends, so no other
// operation takes over while fn writes, and an operation that was taken
// over writes nothing.
func (r *InstalledIntegrationsSqliteRepo) runInOperation(ctx context.Context, op *integrationOperation, now time.Time, lease time.Duration, fn func(ctx context.Context) error) error {
	return r.store.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		res, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*operationStorable)(nil)).
			Set("lease_until = ?", now.Add(lease).UnixMilli()).
			Set("updated_at = ?", now).
			Where("org_id = ?", op.orgID).
			Where("integration = ?", op.integration).
			Where("generation = ?", op.generation).
			Where("state = ?", op.state).
			Exec(ctx)
		if err != nil {
			return err
		}
		if held, err := res.RowsAffected(); err != nil {
			return err
		} else if held != 1 {
			return errors.Newf(errors.TypeAlreadyExists, ErrCodeIntegrationBusy, "another request took integration %s over", op.integration)
		}
		return fn(ctx)
	})
}

// releaseIntegrationOperation ends op's lease, so the next operation need
// not wait for it.
func (r *InstalledIntegrationsSqliteRepo) releaseIntegrationOperation(ctx context.Context, op *integrationOperation, now time.Time) error {
	_, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*operationStorable)(nil)).
		Set("lease_until = 0").
		Set("updated_at = ?", now).
		Where("org_id = ?", op.orgID).
		Where("integration = ?", op.integration).
		Where("generation = ?", op.generation).
		Exec(ctx)
	return err
}

// finishUninstallation, run within op, ends an uninstallation: the
// integration may be installed again. The generation moves on rather than
// the row going, so no generation is ever held twice.
func (r *InstalledIntegrationsSqliteRepo) finishUninstallation(ctx context.Context, op *integrationOperation, now time.Time) error {
	_, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*operationStorable)(nil)).
		Set("state = ?", cloudintegrationtypes.IntegrationOperationStateActive).
		Set("generation = generation + 1").
		Set("lease_until = 0").
		Set("updated_at = ?", now).
		Where("org_id = ?", op.orgID).
		Where("integration = ?", op.integration).
		Where("generation = ?", op.generation).
		Exec(ctx)
	return err
}

// reserveIntegrationAsset records an asset in creating state with a new
// resource ID.
func (r *InstalledIntegrationsSqliteRepo) reserveIntegrationAsset(ctx context.Context, orgID string, integration string, kind cloudintegrationtypes.IntegrationAssetKind, slug string, now time.Time) (*assetStorable, error) {
	row := &assetStorable{
		ID:          valuer.GenerateUUID().StringValue(),
		OrgID:       orgID,
		Integration: integration,
		Kind:        kind,
		Slug:        slug,
		ResourceID:  valuer.GenerateUUID().StringValue(),
		State:       cloudintegrationtypes.IntegrationAssetStateCreating,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := r.store.BunDBCtx(ctx).NewInsert().Model(row).Exec(ctx); err != nil {
		return nil, err
	}
	return row, nil
}

// markIntegrationAssetReady records that an asset's resource was created at
// version.
func (r *InstalledIntegrationsSqliteRepo) markIntegrationAssetReady(ctx context.Context, id string, version string, now time.Time) error {
	_, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*assetStorable)(nil)).
		Set("state = ?", cloudintegrationtypes.IntegrationAssetStateReady).
		Set("version = ?", version).
		Set("updated_at = ?", now).
		Where("id = ?", id).
		Exec(ctx)
	return err
}

// setIntegrationAssetVersion records that an asset's resource reflects
// version.
func (r *InstalledIntegrationsSqliteRepo) setIntegrationAssetVersion(ctx context.Context, id string, version string, now time.Time) error {
	_, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*assetStorable)(nil)).
		Set("version = ?", version).
		Set("updated_at = ?", now).
		Where("id = ?", id).
		Exec(ctx)
	return err
}

func (r *InstalledIntegrationsSqliteRepo) deleteIntegrationAsset(ctx context.Context, id string) error {
	_, err := r.store.BunDBCtx(ctx).NewDelete().Model((*assetStorable)(nil)).Where("id = ?", id).Exec(ctx)
	return err
}

// listIntegrationAssets returns an installed integration's assets, by kind
// and slug.
func (r *InstalledIntegrationsSqliteRepo) listIntegrationAssets(ctx context.Context, orgID string, integration string) ([]*assetStorable, error) {
	rows := []*assetStorable{}
	err := r.store.BunDBCtx(ctx).NewSelect().Model(&rows).
		Where("org_id = ?", orgID).
		Where("integration = ?", integration).
		Order("kind", "slug").
		Scan(ctx)
	return rows, err
}
