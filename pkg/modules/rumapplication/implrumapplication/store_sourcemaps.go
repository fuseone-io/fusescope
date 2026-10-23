package implrumapplication

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

func (store *store) CreateSourceMaps(ctx context.Context, files []*rumtypes.StorableSourceMap) error {
	if len(files) == 0 {
		return nil
	}
	_, err := store.sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(&files).
		Exec(ctx)
	if err != nil {
		return store.sqlstore.WrapAlreadyExistsErrf(err, rumtypes.ErrCodeSourceMapInvalidInput, "a source map with the same path was uploaded to the release at the same time; retry")
	}
	return nil
}

func (store *store) ListSourceMaps(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*rumtypes.StorableSourceMap, error) {
	files := make([]*rumtypes.StorableSourceMap, 0)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&files).
		Where("org_id = ?", orgID).
		Where("application_id = ?", applicationID).
		Scan(ctx)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to list rum source maps")
	}
	return files, nil
}

func (store *store) ListReleaseSourceMaps(ctx context.Context, applicationID valuer.UUID, release string) ([]*rumtypes.StorableSourceMap, error) {
	files := make([]*rumtypes.StorableSourceMap, 0)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&files).
		Where("application_id = ?", applicationID).
		Where("release_name = ?", release).
		Scan(ctx)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to list rum source maps of a release")
	}
	return files, nil
}

func (store *store) GetSourceMap(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, id valuer.UUID) (*rumtypes.StorableSourceMap, error) {
	file := new(rumtypes.StorableSourceMap)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(file).
		Where("org_id = ?", orgID).
		Where("application_id = ?", applicationID).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, rumtypes.ErrCodeSourceMapNotFound, "rum source map %s not found", id.StringValue())
	}
	return file, nil
}

func (store *store) DeleteSourceMaps(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, ids []valuer.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := store.sqlstore.
		BunDBCtx(ctx).
		NewDelete().
		Model((*rumtypes.StorableSourceMap)(nil)).
		Where("org_id = ?", orgID).
		Where("application_id = ?", applicationID).
		Where("id IN (?)", bun.In(ids)).
		Exec(ctx)
	if err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "failed to delete rum source maps")
	}
	return nil
}

func (store *store) SetSourceMapsLastUsedAt(ctx context.Context, ids []valuer.UUID, usedAt time.Time) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := store.sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model((*rumtypes.StorableSourceMap)(nil)).
		Set("last_used_at = ?", usedAt).
		Where("id IN (?)", bun.In(ids)).
		Exec(ctx)
	if err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "failed to set rum source maps last used time")
	}
	return nil
}
