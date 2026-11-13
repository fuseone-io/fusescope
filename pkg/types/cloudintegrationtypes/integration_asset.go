package cloudintegrationtypes

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

// IntegrationAssetKind is the kind of resource an installed integration owns.
type IntegrationAssetKind struct{ valuer.String }

var (
	IntegrationAssetKindDashboard = IntegrationAssetKind{valuer.NewString("dashboard")}
	IntegrationAssetKindAlert     = IntegrationAssetKind{valuer.NewString("alert")}
)

// IntegrationAssetState is where an owned resource is in its life.
//   - creating: the resource ID is reserved and its creation is in progress
//     or was interrupted; the holder of the lease (generation) may create it;
//   - ready: the resource exists and belongs to the integration;
//   - deleting: the integration is being uninstalled; nothing may claim it.
type IntegrationAssetState struct{ valuer.String }

var (
	IntegrationAssetStateCreating = IntegrationAssetState{valuer.NewString("creating")}
	IntegrationAssetStateReady    = IntegrationAssetState{valuer.NewString("ready")}
	IntegrationAssetStateDeleting = IntegrationAssetState{valuer.NewString("deleting")}
)

// StorableIntegrationAsset records that an installed integration owns a
// resource of an organization. (org_id, integration, kind, slug) is unique,
// so one asset of a catalog version maps to one resource whatever the number
// of installers. The resource ID is chosen when the asset is claimed, before
// the resource is created, so an interrupted creation is recovered by
// looking that ID up.
type StorableIntegrationAsset struct {
	bun.BaseModel `bun:"table:integration_asset"`

	ID          string                `bun:"id,pk,type:text"`
	OrgID       string                `bun:"org_id,type:text"`
	Integration string                `bun:"integration,type:text"`
	Kind        IntegrationAssetKind  `bun:"kind,type:text"`
	Slug        string                `bun:"slug,type:text"`
	ResourceID  string                `bun:"resource_id,type:text"`
	State       IntegrationAssetState `bun:"state,type:text"`
	// Version is the catalog version the resource reflects; it lags the
	// installation's pin until an upgrade has updated the resource.
	Version string `bun:"version,type:text"`
	// LeaseUntil bounds a creating claim, in Unix milliseconds; another
	// installer may take the claim over once it has passed. 0 without a lease.
	LeaseUntil int64 `bun:"lease_until"`
	// Generation increases on every take-over and when uninstalling starts,
	// so a holder that lost its lease cannot finalize.
	Generation int64     `bun:"generation"`
	CreatedAt  time.Time `bun:"created_at"`
	UpdatedAt  time.Time `bun:"updated_at"`
}
