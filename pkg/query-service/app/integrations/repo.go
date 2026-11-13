package integrations

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
)

type InstalledIntegrationsRepo interface {
	list(ctx context.Context, orgId string) ([]cloudintegrationtypes.InstalledIntegration, *model.ApiError)

	get(
		ctx context.Context, orgId string, integrationTypes []string,
	) (map[string]cloudintegrationtypes.InstalledIntegration, *model.ApiError)

	upsert(
		ctx context.Context,
		orgId string,
		integrationType string,
		version string,
		config cloudintegrationtypes.InstalledIntegrationConfig,
	) (*cloudintegrationtypes.InstalledIntegration, *model.ApiError)

	delete(ctx context.Context, orgId string, integrationType string) *model.ApiError

	updateVersion(ctx context.Context, orgID string, integrationType string, version string) error

	claimIntegrationAsset(ctx context.Context, orgID string, integration string, kind cloudintegrationtypes.IntegrationAssetKind, slug string, now time.Time, lease time.Duration) (*cloudintegrationtypes.StorableIntegrationAsset, assetClaim, error)

	finalizeIntegrationAsset(ctx context.Context, id string, generation int64, version string, now time.Time) (bool, error)

	setIntegrationAssetVersion(ctx context.Context, id string, generation int64, version string, now time.Time) (bool, error)

	releaseIntegrationAssetLease(ctx context.Context, id string, generation int64, now time.Time) error

	markIntegrationAssetDeleting(ctx context.Context, id string, now time.Time) error

	markIntegrationAssetsDeleting(ctx context.Context, orgID string, integration string, now time.Time) error

	deleteIntegrationAsset(ctx context.Context, id string) error

	getIntegrationAsset(ctx context.Context, id string) (*cloudintegrationtypes.StorableIntegrationAsset, error)

	listIntegrationAssets(ctx context.Context, orgID string, integration string) ([]*cloudintegrationtypes.StorableIntegrationAsset, error)
}

type AvailableIntegrationsRepo interface {
	list(context.Context) ([]IntegrationDetails, *model.ApiError)

	get(
		ctx context.Context, integrationTypes []string,
	) (map[string]IntegrationDetails, *model.ApiError)

	// getVersion returns one version of an integration, which installations
	// pinned to it are served.
	getVersion(ctx context.Context, integrationType string, version string) (*IntegrationDetails, bool)

	// AvailableIntegrationsRepo implementations are expected to cache
	// details of installed integrations for quick retrieval.
	//
	// For v0 only bundled integrations are available, later versions
	// are expected to add methods in this interface for pinning installed
	// integration details in local cache.
}
