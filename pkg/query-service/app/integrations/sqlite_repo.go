package integrations

import (
	"context"
	"fmt"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

type InstalledIntegrationsSqliteRepo struct {
	store sqlstore.SQLStore
}

func NewInstalledIntegrationsSqliteRepo(store sqlstore.SQLStore) (
	*InstalledIntegrationsSqliteRepo, error,
) {
	return &InstalledIntegrationsSqliteRepo{
		store: store,
	}, nil
}

func (r *InstalledIntegrationsSqliteRepo) list(
	ctx context.Context,
	orgId string,
) ([]cloudintegrationtypes.InstalledIntegration, *model.ApiError) {
	integrations := []cloudintegrationtypes.InstalledIntegration{}

	err := r.store.BunDB().NewSelect().
		Model(&integrations).
		Where("org_id = ?", orgId).
		Order("installed_at").
		Scan(ctx)
	if err != nil {
		return nil, model.InternalError(fmt.Errorf(
			"could not query installed integrations: %w", err,
		))
	}
	return integrations, nil
}

func (r *InstalledIntegrationsSqliteRepo) get(
	ctx context.Context, orgId string, integrationTypes []string,
) (map[string]cloudintegrationtypes.InstalledIntegration, *model.ApiError) {
	integrations := []cloudintegrationtypes.InstalledIntegration{}

	typeValues := []interface{}{}
	for _, integrationType := range integrationTypes {
		typeValues = append(typeValues, integrationType)
	}

	err := r.store.BunDBCtx(ctx).NewSelect().Model(&integrations).
		Where("org_id = ?", orgId).
		Where("type IN (?)", bun.List(typeValues)).
		Scan(ctx)
	if err != nil {
		return nil, model.InternalError(fmt.Errorf(
			"could not query installed integrations: %w", err,
		))
	}

	result := map[string]cloudintegrationtypes.InstalledIntegration{}
	for _, ii := range integrations {
		result[ii.Type] = ii
	}

	return result, nil
}

func (r *InstalledIntegrationsSqliteRepo) upsert(
	ctx context.Context,
	orgId string,
	integrationType string,
	version string,
	config cloudintegrationtypes.InstalledIntegrationConfig,
) (*cloudintegrationtypes.InstalledIntegration, *model.ApiError) {

	integration := cloudintegrationtypes.InstalledIntegration{
		Identifiable: types.Identifiable{
			ID: valuer.GenerateUUID(),
		},
		OrgID:   orgId,
		Type:    integrationType,
		Version: version,
		Config:  config,
	}

	_, dbErr := r.store.BunDBCtx(ctx).NewInsert().
		Model(&integration).
		On("conflict (type, org_id) DO UPDATE").
		Set("config = EXCLUDED.config").
		Exec(ctx)

	if dbErr != nil {
		return nil, model.InternalError(fmt.Errorf(
			"could not insert record for integration installation: %w", dbErr,
		))
	}

	res, apiErr := r.get(ctx, orgId, []string{integrationType})
	if apiErr != nil || len(res) < 1 {
		return nil, model.WrapApiError(
			apiErr, "could not fetch installed integration",
		)
	}

	installed := res[integrationType]

	return &installed, nil
}

func (r *InstalledIntegrationsSqliteRepo) delete(
	ctx context.Context, orgId string, integrationType string,
) *model.ApiError {
	_, dbErr := r.store.BunDBCtx(ctx).NewDelete().
		Model(&cloudintegrationtypes.InstalledIntegration{}).
		Where("type = ?", integrationType).
		Where("org_id = ?", orgId).
		Exec(ctx)

	if dbErr != nil {
		return model.InternalError(fmt.Errorf(
			"could not delete installed integration record for %s: %w",
			integrationType, dbErr,
		))
	}

	return nil
}

func (r *InstalledIntegrationsSqliteRepo) updateVersion(ctx context.Context, orgID string, integrationType string, version string) error {
	_, err := r.store.BunDBCtx(ctx).NewUpdate().
		Model(new(cloudintegrationtypes.InstalledIntegration)).
		Set("version = ?", version).
		Where("type = ?", integrationType).
		Where("org_id = ?", orgID).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "could not update the version of installed integration %s", integrationType)
	}
	return nil
}
