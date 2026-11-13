package integrations

import (
	"context"
	"database/sql"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// assetClaim is what claiming an integration asset found.
type assetClaim int

const (
	// assetClaimed: the caller holds the claim's generation and creates the
	// resource with the claim's resource ID, then finalizes.
	assetClaimed assetClaim = iota
	// assetReady: the resource exists; there is nothing to create.
	assetReady
	// assetBusy: another caller holds a live lease on the creation.
	assetBusy
	// assetDeleting: the asset is being removed and cannot be claimed.
	assetDeleting
)

// claimAttempts bounds the retries when the row changes under a claim; each
// retry follows another caller's progress, so a few always suffice.
const claimAttempts = 4

type assetStorable = cloudintegrationtypes.StorableIntegrationAsset

// claimIntegrationAsset reserves the creation of an asset: it inserts the
// asset in creating state with a new resource ID, or takes over a creation
// whose lease has passed, keeping its resource ID and moving its generation.
// It returns the row as the caller now sees it.
func (r *InstalledIntegrationsSqliteRepo) claimIntegrationAsset(
	ctx context.Context, orgID string, integration string, kind cloudintegrationtypes.IntegrationAssetKind, slug string, now time.Time, lease time.Duration,
) (*assetStorable, assetClaim, error) {
	db := r.store.BunDBCtx(ctx)
	leaseUntil := now.Add(lease).UnixMilli()
	for range claimAttempts {
		row := &assetStorable{
			ID:          valuer.GenerateUUID().StringValue(),
			OrgID:       orgID,
			Integration: integration,
			Kind:        kind,
			Slug:        slug,
			ResourceID:  valuer.GenerateUUID().StringValue(),
			State:       cloudintegrationtypes.IntegrationAssetStateCreating,
			LeaseUntil:  leaseUntil,
			Generation:  1,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		res, err := db.NewInsert().Model(row).On("CONFLICT (org_id, integration, kind, slug) DO NOTHING").Exec(ctx)
		if err != nil {
			return nil, 0, err
		}
		if inserted, err := res.RowsAffected(); err != nil {
			return nil, 0, err
		} else if inserted == 1 {
			return row, assetClaimed, nil
		}

		existing, err := r.findIntegrationAsset(ctx, orgID, integration, kind, slug)
		if err != nil {
			return nil, 0, err
		}
		if existing == nil {
			continue // removed in between
		}
		switch existing.State {
		case cloudintegrationtypes.IntegrationAssetStateReady:
			return existing, assetReady, nil
		case cloudintegrationtypes.IntegrationAssetStateDeleting:
			return existing, assetDeleting, nil
		}
		if existing.LeaseUntil > now.UnixMilli() {
			return existing, assetBusy, nil
		}
		res, err = db.NewUpdate().Model((*assetStorable)(nil)).
			Set("generation = generation + 1").
			Set("lease_until = ?", leaseUntil).
			Set("updated_at = ?", now).
			Where("id = ?", existing.ID).
			Where("generation = ?", existing.Generation).
			Where("state = ?", cloudintegrationtypes.IntegrationAssetStateCreating).
			Exec(ctx)
		if err != nil {
			return nil, 0, err
		}
		if taken, err := res.RowsAffected(); err != nil {
			return nil, 0, err
		} else if taken == 1 {
			existing.Generation++
			existing.LeaseUntil = leaseUntil
			existing.UpdatedAt = now
			return existing, assetClaimed, nil
		}
		// Another caller moved the row first; look again.
	}
	return nil, 0, errors.Newf(errors.TypeInternal, errors.CodeInternal, "integration %s asset %s/%s changed during %d claims", integration, kind.StringValue(), slug, claimAttempts)
}

// finalizeIntegrationAsset marks a created asset ready at version, if the
// caller still holds the claim's generation.
func (r *InstalledIntegrationsSqliteRepo) finalizeIntegrationAsset(ctx context.Context, id string, generation int64, version string, now time.Time) (bool, error) {
	return r.updateIntegrationAsset(ctx, id, generation, cloudintegrationtypes.IntegrationAssetStateCreating, version, now)
}

// setIntegrationAssetVersion records that a ready asset's resource now
// reflects version, unless the asset changed since it was read.
func (r *InstalledIntegrationsSqliteRepo) setIntegrationAssetVersion(ctx context.Context, id string, generation int64, version string, now time.Time) (bool, error) {
	return r.updateIntegrationAsset(ctx, id, generation, cloudintegrationtypes.IntegrationAssetStateReady, version, now)
}

func (r *InstalledIntegrationsSqliteRepo) updateIntegrationAsset(ctx context.Context, id string, generation int64, from cloudintegrationtypes.IntegrationAssetState, version string, now time.Time) (bool, error) {
	res, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*assetStorable)(nil)).
		Set("state = ?", cloudintegrationtypes.IntegrationAssetStateReady).
		Set("version = ?", version).
		Set("lease_until = 0").
		Set("updated_at = ?", now).
		Where("id = ?", id).
		Where("generation = ?", generation).
		Where("state = ?", from).
		Exec(ctx)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// releaseIntegrationAssetLease ends a creating claim's lease early, after a
// creation failed, so the next attempt takes the claim over at once.
func (r *InstalledIntegrationsSqliteRepo) releaseIntegrationAssetLease(ctx context.Context, id string, generation int64, now time.Time) error {
	_, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*assetStorable)(nil)).
		Set("lease_until = 0").
		Set("updated_at = ?", now).
		Where("id = ?", id).
		Where("generation = ?", generation).
		Where("state = ?", cloudintegrationtypes.IntegrationAssetStateCreating).
		Exec(ctx)
	return err
}

// markIntegrationAssetDeleting moves an asset to deleting and its generation
// on, so no holder of an earlier claim can finalize it.
func (r *InstalledIntegrationsSqliteRepo) markIntegrationAssetDeleting(ctx context.Context, id string, now time.Time) error {
	_, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*assetStorable)(nil)).
		Set("state = ?", cloudintegrationtypes.IntegrationAssetStateDeleting).
		Set("generation = generation + 1").
		Set("lease_until = 0").
		Set("updated_at = ?", now).
		Where("id = ?", id).
		Exec(ctx)
	return err
}

// markIntegrationAssetsDeleting marks every asset of an installed integration
// deleting.
func (r *InstalledIntegrationsSqliteRepo) markIntegrationAssetsDeleting(ctx context.Context, orgID string, integration string, now time.Time) error {
	_, err := r.store.BunDBCtx(ctx).NewUpdate().Model((*assetStorable)(nil)).
		Set("state = ?", cloudintegrationtypes.IntegrationAssetStateDeleting).
		Set("generation = generation + 1").
		Set("lease_until = 0").
		Set("updated_at = ?", now).
		Where("org_id = ?", orgID).
		Where("integration = ?", integration).
		Exec(ctx)
	return err
}

func (r *InstalledIntegrationsSqliteRepo) deleteIntegrationAsset(ctx context.Context, id string) error {
	_, err := r.store.BunDBCtx(ctx).NewDelete().Model((*assetStorable)(nil)).Where("id = ?", id).Exec(ctx)
	return err
}

// getIntegrationAsset returns the asset, or nil when there is none.
func (r *InstalledIntegrationsSqliteRepo) getIntegrationAsset(ctx context.Context, id string) (*assetStorable, error) {
	row := new(assetStorable)
	if err := r.store.BunDBCtx(ctx).NewSelect().Model(row).Where("id = ?", id).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return row, nil
}

func (r *InstalledIntegrationsSqliteRepo) findIntegrationAsset(ctx context.Context, orgID string, integration string, kind cloudintegrationtypes.IntegrationAssetKind, slug string) (*assetStorable, error) {
	row := new(assetStorable)
	err := r.store.BunDBCtx(ctx).NewSelect().Model(row).
		Where("org_id = ?", orgID).
		Where("integration = ?", integration).
		Where("kind = ?", kind).
		Where("slug = ?", slug).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return row, nil
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
