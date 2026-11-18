package watchdogtypes

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Store interface {
	GetActiveIssue(ctx context.Context, orgID valuer.UUID, fingerprint string) (*Issue, error)
	GetLastResolvedIssue(ctx context.Context, orgID valuer.UUID, fingerprint string) (*Issue, error)
	ListActiveIssues(ctx context.Context, orgID valuer.UUID) ([]*Issue, error)

	// SaveChange writes a change made from previous, nil for a created
	// issue. It reports false, writing nothing, when the issue's
	// fingerprint already had this evaluation's end applied or another
	// active issue.
	SaveChange(ctx context.Context, previous *Issue, change *Change) (bool, error)

	// DeleteResolvedIssues deletes at most limit issues resolved before
	// the given time and reports how many it deleted.
	DeleteResolvedIssues(ctx context.Context, resolvedBefore time.Time, limit int) (int64, error)

	// ListSettings returns one setting per detector, the defaults where
	// none is stored.
	ListSettings(ctx context.Context, orgID valuer.UUID) ([]*Setting, error)
	GetSetting(ctx context.Context, orgID valuer.UUID, detector Detector) (*Setting, error)
	PutSetting(ctx context.Context, setting *Setting) error

	RunInTx(ctx context.Context, cb func(ctx context.Context) error) error
}
