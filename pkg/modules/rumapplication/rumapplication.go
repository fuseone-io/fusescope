package rumapplication

import (
	"context"
	"net/http"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Module interface {
	List(ctx context.Context, orgID valuer.UUID) ([]*rumtypes.Application, error)
	Get(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (*rumtypes.Application, error)

	// Create also issues the first key and promotes the RUM fields in ClickHouse.
	Create(ctx context.Context, orgID valuer.UUID, createdBy string, postable *rumtypes.PostableApplication) (*rumtypes.GettableCreatedApplication, error)
	Update(ctx context.Context, orgID valuer.UUID, id valuer.UUID, updatable *rumtypes.UpdatableApplication) (*rumtypes.Application, error)

	// Delete removes the application and all its keys.
	Delete(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error

	ListKeys(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*rumtypes.GettableApplicationKey, error)

	// CreateKey fails while the application has a usable key; use RotateKey then.
	CreateKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) (*rumtypes.GettableCreatedApplicationKey, error)

	// RotateKey issues a new key and lets the active one expire after the overlap.
	// It fails while a previous rotation is still in its overlap.
	RotateKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, keyID valuer.UUID, overlap rumtypes.KeyOverlap) (*rumtypes.GettableCreatedApplicationKey, error)
	RevokeKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, keyID valuer.UUID) error

	Status(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (*rumtypes.GettableApplicationStatus, error)

	// Authenticate resolves a plaintext key to its application and key id.
	// An issued but unusable key still returns the application, with an error.
	Authenticate(ctx context.Context, plaintext string) (*rumtypes.Application, valuer.UUID, error)
	// ApplicationsAllowingOrigin returns the ids of the applications, in any organization, that allow the origin.
	// It answers preflights, which carry no key, and attributes requests with an unknown key.
	ApplicationsAllowingOrigin(ctx context.Context, origin string) []valuer.UUID
	ObserveIngest(application *rumtypes.Application, keyID valuer.UUID, batch *rumtypes.IngestBatch)
	ObserveRejection(applicationID valuer.UUID, reason rumtypes.RejectionReason, origin string)

	// FlushUsage writes key last-used and application first-seen times observed since the last flush.
	FlushUsage(ctx context.Context) error

	// PromoteFields materializes the RUM attributes in the traces and logs tables. It is idempotent.
	PromoteFields(ctx context.Context) error

	// HasApplications reports whether any organization has an application.
	HasApplications(ctx context.Context) (bool, error)

	ListViews(ctx context.Context, orgID valuer.UUID, id valuer.UUID, params *rumtypes.ListViewsParams) (*rumtypes.GettableViews, error)
	GetView(ctx context.Context, orgID valuer.UUID, id valuer.UUID, route string, params *rumtypes.GetViewParams) (*rumtypes.GettableView, error)
	ListErrorGroups(ctx context.Context, orgID valuer.UUID, id valuer.UUID, params *rumtypes.ListErrorGroupsParams) (*rumtypes.GettableErrorGroups, error)
	GetErrorGroup(ctx context.Context, orgID valuer.UUID, id valuer.UUID, fingerprint string, params *rumtypes.GetErrorGroupParams) (*rumtypes.GettableErrorGroup, error)
	ListSessions(ctx context.Context, orgID valuer.UUID, id valuer.UUID, params *rumtypes.ListSessionsParams) (*rumtypes.GettableSessions, error)
	GetSession(ctx context.Context, orgID valuer.UUID, id valuer.UUID, sessionID string, params *rumtypes.GetSessionParams) (*rumtypes.GettableSession, error)
}

type Handler interface {
	List(http.ResponseWriter, *http.Request)
	Get(http.ResponseWriter, *http.Request)
	Create(http.ResponseWriter, *http.Request)
	Update(http.ResponseWriter, *http.Request)
	Delete(http.ResponseWriter, *http.Request)
	Status(http.ResponseWriter, *http.Request)
	ListKeys(http.ResponseWriter, *http.Request)
	CreateKey(http.ResponseWriter, *http.Request)
	RotateKey(http.ResponseWriter, *http.Request)
	RevokeKey(http.ResponseWriter, *http.Request)
	ListViews(http.ResponseWriter, *http.Request)
	GetView(http.ResponseWriter, *http.Request)
	ListErrorGroups(http.ResponseWriter, *http.Request)
	GetErrorGroup(http.ResponseWriter, *http.Request)
	ListSessions(http.ResponseWriter, *http.Request)
	GetSession(http.ResponseWriter, *http.Request)
}

// Symbolicator maps minified frames to source through the release's uploaded
// source maps. It runs at read time; stored telemetry stays raw. It reports
// false when it has no map for the frames.
type Symbolicator interface {
	Symbolicate(ctx context.Context, applicationID valuer.UUID, release string, frames []rumtypes.StackFrame) ([]rumtypes.StackFrame, bool, error)
}

// Gateway serves the public OTLP/HTTP ingestion endpoints.
type Gateway interface {
	Traces(http.ResponseWriter, *http.Request)
	Logs(http.ResponseWriter, *http.Request)
}

type Service interface {
	factory.Service
}
