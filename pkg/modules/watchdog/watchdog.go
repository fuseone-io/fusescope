package watchdog

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Module interface {
	// Evaluate applies one evaluation to the issue sharing its fingerprint
	// and persists the change in one transaction. Applying an end already
	// applied returns TransitionNone.
	Evaluate(ctx context.Context, evaluation watchdogtypes.Evaluation) (*watchdogtypes.Change, error)

	ListActiveIssues(ctx context.Context, orgID valuer.UUID) ([]*watchdogtypes.Issue, error)

	ListSettings(ctx context.Context, orgID valuer.UUID) ([]*watchdogtypes.Setting, error)

	PutSetting(ctx context.Context, setting *watchdogtypes.Setting) error

	// DeleteExpiredIssues deletes, in bounded batches, the issues resolved
	// longer than watchdogtypes.ResolvedIssueRetention before now.
	DeleteExpiredIssues(ctx context.Context, now time.Time) (int64, error)
}

// Service evaluates the Watchdog detectors of every organization on a fixed
// cycle.
type Service interface {
	factory.Service
}
