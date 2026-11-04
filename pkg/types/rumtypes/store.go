package rumtypes

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Store interface {
	CreateApplication(ctx context.Context, application *StorableApplication) error
	GetApplication(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (*StorableApplication, error)
	GetApplicationByID(ctx context.Context, id valuer.UUID) (*StorableApplication, error)
	ListApplications(ctx context.Context, orgID valuer.UUID) ([]*StorableApplication, error)
	CountApplications(ctx context.Context) (int, error)
	// ListApplicationsInAllOrgs loads only the id, org_id and data columns.
	ListApplicationsInAllOrgs(ctx context.Context) ([]*StorableApplication, error)
	// ListAllApplications loads at most limit applications of every organization, ordered by id.
	ListAllApplications(ctx context.Context, limit int) ([]*StorableApplication, error)
	UpdateApplication(ctx context.Context, application *StorableApplication) error
	DeleteApplication(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error
	// SetFirstSeenAt keeps the earliest first-seen time.
	SetFirstSeenAt(ctx context.Context, id valuer.UUID, seenAt time.Time) error
	// KnownApplicationIDs is which of ids are applications.
	KnownApplicationIDs(ctx context.Context, ids []valuer.UUID) (map[valuer.UUID]bool, error)
	// SetFirstSeenAtEarliest is SetFirstSeenAt for many applications, a few
	// statements for all; unknown IDs are ignored.
	SetFirstSeenAtEarliest(ctx context.Context, seenAt map[valuer.UUID]time.Time) error
	// ListReportedApplication loads the window values the collectors
	// reported for the application since the given time, one row per agent.
	ListReportedApplication(ctx context.Context, id valuer.UUID, since time.Time) ([]*ingesttypes.StorableReportApplication, error)

	CreateKey(ctx context.Context, key *ApplicationKey) error
	GetKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, id valuer.UUID) (*ApplicationKey, error)
	GetKeyByHash(ctx context.Context, hash string) (*ApplicationKey, error)
	ListKeys(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*ApplicationKey, error)
	// ListUsableKeys loads at most limit keys of every organization usable at the given time, ordered by id.
	ListUsableKeys(ctx context.Context, at time.Time, limit int) ([]*ApplicationKey, error)
	// CountUsableKeys counts, per application, the keys usable at the given
	// time and those of them expiring (in a rotation overlap).
	CountUsableKeys(ctx context.Context, at time.Time) (map[valuer.UUID]KeyCounts, error)
	// DatabaseNow is the database's clock, which the ingest policy decides
	// key expiry at.
	DatabaseNow(ctx context.Context) (time.Time, error)
	// TouchIngestPolicy records, in the caller's transaction, a change of the
	// collectors' ingest policy content; it serialises such changes.
	TouchIngestPolicy(ctx context.Context) error
	UpdateKey(ctx context.Context, key *ApplicationKey) error
	// SetKeyLastUsedAt keeps the latest use.
	SetKeyLastUsedAt(ctx context.Context, id valuer.UUID, usedAt time.Time) error
	// SetKeysLastUsedAtLatest is SetKeyLastUsedAt for many keys, a few
	// statements for all; unknown IDs are ignored.
	SetKeysLastUsedAtLatest(ctx context.Context, usedAt map[valuer.UUID]time.Time) error

	CreateSourceMaps(ctx context.Context, files []*StorableSourceMap) error
	ListSourceMaps(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*StorableSourceMap, error)
	ListReleaseSourceMaps(ctx context.Context, applicationID valuer.UUID, release string) ([]*StorableSourceMap, error)
	GetSourceMap(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, id valuer.UUID) (*StorableSourceMap, error)
	DeleteSourceMaps(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, ids []valuer.UUID) error
	SetSourceMapsLastUsedAt(ctx context.Context, ids []valuer.UUID, usedAt time.Time) error

	RunInTx(ctx context.Context, cb func(ctx context.Context) error) error
}
