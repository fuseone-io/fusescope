package rumtypes

import (
	"context"
	"time"

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
	UpdateApplication(ctx context.Context, application *StorableApplication) error
	DeleteApplication(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error
	SetFirstSeenAt(ctx context.Context, id valuer.UUID, seenAt time.Time) error

	CreateKey(ctx context.Context, key *ApplicationKey) error
	GetKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, id valuer.UUID) (*ApplicationKey, error)
	GetKeyByHash(ctx context.Context, hash string) (*ApplicationKey, error)
	ListKeys(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*ApplicationKey, error)
	UpdateKey(ctx context.Context, key *ApplicationKey) error
	SetKeyLastUsedAt(ctx context.Context, id valuer.UUID, usedAt time.Time) error

	CreateSourceMaps(ctx context.Context, files []*StorableSourceMap) error
	ListSourceMaps(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*StorableSourceMap, error)
	ListReleaseSourceMaps(ctx context.Context, applicationID valuer.UUID, release string) ([]*StorableSourceMap, error)
	GetSourceMap(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, id valuer.UUID) (*StorableSourceMap, error)
	DeleteSourceMaps(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, ids []valuer.UUID) error
	SetSourceMapsLastUsedAt(ctx context.Context, ids []valuer.UUID, usedAt time.Time) error

	RunInTx(ctx context.Context, cb func(ctx context.Context) error) error
}
