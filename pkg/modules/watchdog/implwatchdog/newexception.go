package implwatchdog

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// exceptionCursors are the new_exception cursors of one lease session. An
// organization without one has not warmed up.
type exceptionCursors struct {
	mu    sync.Mutex
	byOrg map[valuer.UUID]watchdogtypes.ExceptionCursor
}

func newExceptionCursors() *exceptionCursors {
	return &exceptionCursors{byOrg: map[valuer.UUID]watchdogtypes.ExceptionCursor{}}
}

func (cursors *exceptionCursors) get(orgID valuer.UUID) (watchdogtypes.ExceptionCursor, bool) {
	cursors.mu.Lock()
	defer cursors.mu.Unlock()
	cursor, ok := cursors.byOrg[orgID]
	return cursor, ok
}

func (cursors *exceptionCursors) set(orgID valuer.UUID, cursor watchdogtypes.ExceptionCursor) {
	cursors.mu.Lock()
	defer cursors.mu.Unlock()
	cursors.byOrg[orgID] = cursor
}

func (cursors *exceptionCursors) forget(orgID valuer.UUID) {
	cursors.mu.Lock()
	defer cursors.mu.Unlock()
	delete(cursors.byOrg, orgID)
}

// exceptionsDue reports whether new_exception reads this window. Its first
// evaluation in the session only warms up, and a disabled detector forgets
// its cursor, so groups seen before are never a burst of issues.
func (run *orgRun) exceptionsDue() bool {
	if !run.exceptionsEnabled {
		run.cursors.forget(run.orgID)
		return false
	}
	if _, ok := run.cursors.get(run.orgID); !ok {
		run.cursors.set(run.orgID, watchdogtypes.NewExceptionCursor(run.window.End))
		return false
	}
	return true
}

// evaluateExceptions opens an issue for each new group of a service with
// history, in cursor order. The cursor passes every group processed, a
// discarded one included, and stops before the first that fails.
func (run *orgRun) evaluateExceptions(ctx context.Context, seasons []*watchdogtypes.REDResult) error {
	cursor, _ := run.cursors.get(run.orgID)
	groups, err := run.exceptionReader.ListNewGroups(ctx, run.window, cursor)
	if err != nil {
		return err
	}
	overflow := len(groups) > watchdogtypes.ExceptionBatchSize
	if overflow {
		groups = groups[:watchdogtypes.ExceptionBatchSize]
		run.logger.WarnContext(ctx, "new exception groups exceed the batch, processing the rest next cycle", slog.String("org_id", run.orgID.StringValue()), slog.Int("batch_size", watchdogtypes.ExceptionBatchSize))
		run.exceptionOverflow.Add(ctx, 1)
	}

	history := watchdogtypes.ServicesWithHistory(seasons)
	now := time.Now()
	for _, group := range groups {
		if history[group.Service] {
			if err := run.apply(ctx, watchdogtypes.NewExceptionEvaluation(run.orgID, run.window, group, now)); err != nil {
				return err
			}
		}
		run.cursors.set(run.orgID, watchdogtypes.ExceptionCursor{FirstSeen: group.FirstSeen, GroupID: group.GroupID})
	}
	if !overflow {
		run.cursors.set(run.orgID, watchdogtypes.NewExceptionCursor(run.window.End))
	}
	return nil
}

// evaluateMutedExceptions applies no-data to the muted new_exception issues,
// enabled or not, so an expired mute reopens them.
func (run *orgRun) evaluateMutedExceptions(ctx context.Context) error {
	var failed error
	now := time.Now()
	for _, issue := range run.mutedExceptions {
		if issue.Evidence == nil {
			continue
		}
		failed = errors.Join(failed, run.apply(ctx, watchdogtypes.Evaluation{
			OrgID:    run.orgID,
			Detector: issue.Detector,
			Service:  issue.Service,
			GroupID:  issue.Evidence.GroupID,
			Outcome:  watchdogtypes.OutcomeNoData,
			End:      run.window.End,
			Now:      now,
		}))
	}
	return failed
}
