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
//   - creating: the resource ID is reserved; the resource may not exist yet,
//     or exist from an interrupted creation, and is created with that ID;
//   - ready: the resource was created. It may have been deleted since, by a
//     user or by accident, and is then not created again: the record stays
//     as a tombstone until the integration drops the asset or is
//     uninstalled. Ready does not mean the resource still exists.
type IntegrationAssetState struct{ valuer.String }

var (
	IntegrationAssetStateCreating = IntegrationAssetState{valuer.NewString("creating")}
	IntegrationAssetStateReady    = IntegrationAssetState{valuer.NewString("ready")}
)

// StorableIntegrationAsset records that an installed integration owns a
// resource of an organization. (org_id, integration, kind, slug) is unique,
// so an asset of the catalog maps to one resource. The resource ID is chosen
// before the resource is created, so an interrupted creation is finished by
// creating with that ID. Only the holder of the integration's operation
// changes these records.
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
	Version   string    `bun:"version,type:text"`
	CreatedAt time.Time `bun:"created_at"`
	UpdatedAt time.Time `bun:"updated_at"`
}

// IntegrationOperationState is what an integration's operation is doing.
//   - active: installing or upgrading, or idle once the lease is released;
//   - uninstalling: until the uninstallation finishes, nothing installs or
//     upgrades the integration.
type IntegrationOperationState struct{ valuer.String }

var (
	IntegrationOperationStateActive       = IntegrationOperationState{valuer.NewString("active")}
	IntegrationOperationStateUninstalling = IntegrationOperationState{valuer.NewString("uninstalling")}
)

// StorableIntegrationOperation serializes the operations on an installed
// integration of an organization: install, upgrade and uninstall each take
// it over atomically, moving its generation, and hold a lease while they
// work. Every change they make runs in a transaction that first confirms
// the generation, so an operation that lost the lease changes nothing.
type StorableIntegrationOperation struct {
	bun.BaseModel `bun:"table:integration_operation"`

	OrgID       string                    `bun:"org_id,pk,type:text"`
	Integration string                    `bun:"integration,pk,type:text"`
	State       IntegrationOperationState `bun:"state,type:text"`
	Generation  int64                     `bun:"generation"`
	// LeaseUntil is when another operation may take over, in Unix
	// milliseconds; 0 once the holder released it.
	LeaseUntil int64     `bun:"lease_until"`
	UpdatedAt  time.Time `bun:"updated_at"`
}

// IntegrationAutoInstallState is what the backend did about an integration
// it is configured to install in an organization.
//   - pending: not installed yet;
//   - done: installed, by the backend or by a user before it; never acted
//     on again;
//   - failed: the last attempt failed; retried from NextAttemptAt;
//   - suppressed: the organization uninstalled it; never installed again
//     by the backend, whatever the configuration.
type IntegrationAutoInstallState struct{ valuer.String }

var (
	IntegrationAutoInstallStatePending    = IntegrationAutoInstallState{valuer.NewString("pending")}
	IntegrationAutoInstallStateDone       = IntegrationAutoInstallState{valuer.NewString("done")}
	IntegrationAutoInstallStateFailed     = IntegrationAutoInstallState{valuer.NewString("failed")}
	IntegrationAutoInstallStateSuppressed = IntegrationAutoInstallState{valuer.NewString("suppressed")}
)

// StorableIntegrationAutoInstall records an integration the backend installs
// by itself in an organization. Only the holder of the integration's
// operation changes it.
type StorableIntegrationAutoInstall struct {
	bun.BaseModel `bun:"table:integration_auto_install"`

	OrgID         string                      `bun:"org_id,pk,type:text"`
	Integration   string                      `bun:"integration,pk,type:text"`
	State         IntegrationAutoInstallState `bun:"state,type:text"`
	Attempts      int64                       `bun:"attempts"`
	LastError     string                      `bun:"last_error,type:text"`
	LastAttemptAt *time.Time                  `bun:"last_attempt_at,nullzero"`
	NextAttemptAt *time.Time                  `bun:"next_attempt_at,nullzero"`
	DoneAt        *time.Time                  `bun:"done_at,nullzero"`
	// Version is the catalog version installed, once done.
	Version   string    `bun:"version,type:text"`
	UpdatedAt time.Time `bun:"updated_at"`
}
