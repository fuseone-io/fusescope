package implwatchdog

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/watchdog"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const retentionBatchSize = 500

type module struct {
	store watchdogtypes.Store
}

func NewModule(store watchdogtypes.Store) watchdog.Module {
	return &module{store: store}
}

func (module *module) Evaluate(ctx context.Context, evaluation watchdogtypes.Evaluation) (*watchdogtypes.Change, error) {
	fingerprint, err := watchdogtypes.NewFingerprint(evaluation.Detector, evaluation.Service, evaluation.GroupID)
	if err != nil {
		return nil, err
	}
	var change *watchdogtypes.Change
	err = module.store.RunInTx(ctx, func(ctx context.Context) error {
		issue, err := module.store.GetActiveIssue(ctx, evaluation.OrgID, fingerprint)
		if err != nil && errors.Ast(err, errors.TypeNotFound) {
			issue, err = module.store.GetLastResolvedIssue(ctx, evaluation.OrgID, fingerprint)
		}
		if err != nil && errors.Ast(err, errors.TypeNotFound) {
			issue, err = nil, nil
		}
		if err != nil {
			return err
		}
		change, err = watchdogtypes.ApplyEvaluation(issue, evaluation)
		if err != nil {
			return err
		}
		saved, err := module.store.SaveChange(ctx, issue, change)
		if err != nil {
			return err
		}
		if !saved {
			change = &watchdogtypes.Change{Transition: watchdogtypes.TransitionNone, Issue: issue, End: change.End}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return change, nil
}

func (module *module) ListActiveIssues(ctx context.Context, orgID valuer.UUID) ([]*watchdogtypes.Issue, error) {
	return module.store.ListActiveIssues(ctx, orgID)
}

func (module *module) ListSettings(ctx context.Context, orgID valuer.UUID) ([]*watchdogtypes.Setting, error) {
	return module.store.ListSettings(ctx, orgID)
}

func (module *module) PutSetting(ctx context.Context, setting *watchdogtypes.Setting) error {
	return module.store.PutSetting(ctx, setting)
}

func (module *module) DeleteExpiredIssues(ctx context.Context, now time.Time) (int64, error) {
	resolvedBefore := now.Add(-watchdogtypes.ResolvedIssueRetention)
	var total int64
	for {
		deleted, err := module.store.DeleteResolvedIssues(ctx, resolvedBefore, retentionBatchSize)
		total += deleted
		if err != nil || deleted < retentionBatchSize {
			return total, err
		}
		if err := ctx.Err(); err != nil {
			return total, errors.Wrapf(err, errors.TypeCanceled, errors.CodeCanceled, "stopped deleting expired watchdog issues")
		}
	}
}
