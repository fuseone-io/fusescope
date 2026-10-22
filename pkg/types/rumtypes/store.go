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
	ListAllowedOrigins(ctx context.Context) ([]string, error)
	UpdateApplication(ctx context.Context, application *StorableApplication) error
	DeleteApplication(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error
	SetFirstSeenAt(ctx context.Context, id valuer.UUID, seenAt time.Time) error

	CreateKey(ctx context.Context, key *ApplicationKey) error
	GetKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, id valuer.UUID) (*ApplicationKey, error)
	GetKeyByHash(ctx context.Context, hash string) (*ApplicationKey, error)
	ListKeys(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*ApplicationKey, error)
	UpdateKey(ctx context.Context, key *ApplicationKey) error
	SetKeyLastUsedAt(ctx context.Context, id valuer.UUID, usedAt time.Time) error

	RunInTx(ctx context.Context, cb func(ctx context.Context) error) error
}
