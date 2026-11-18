package implwatchdog

import (
	"context"
	"database/sql"
	"time"

	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var activeStatuses = []watchdogtypes.Status{watchdogtypes.StatusOpen, watchdogtypes.StatusAcknowledged, watchdogtypes.StatusMuted}

type store struct {
	sqlstore sqlstore.SQLStore
}

func NewStore(sqlstore sqlstore.SQLStore) watchdogtypes.Store {
	return &store{sqlstore: sqlstore}
}

func (store *store) GetActiveIssue(ctx context.Context, orgID valuer.UUID, fingerprint string) (*watchdogtypes.Issue, error) {
	issue := new(watchdogtypes.Issue)
	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(issue).
		Where("org_id = ?", orgID).
		Where("fingerprint = ?", fingerprint).
		Where("status IN (?)", bun.List(activeStatuses)).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, watchdogtypes.ErrCodeIssueNotFound, "no active watchdog issue with fingerprint %s in org %s", fingerprint, orgID)
	}
	return issue, nil
}

func (store *store) GetLastResolvedIssue(ctx context.Context, orgID valuer.UUID, fingerprint string) (*watchdogtypes.Issue, error) {
	issue := new(watchdogtypes.Issue)
	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(issue).
		Where("org_id = ?", orgID).
		Where("fingerprint = ?", fingerprint).
		Where("status = ?", watchdogtypes.StatusResolved).
		OrderExpr("resolved_at DESC").
		Limit(1).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, watchdogtypes.ErrCodeIssueNotFound, "no resolved watchdog issue with fingerprint %s in org %s", fingerprint, orgID)
	}
	return issue, nil
}

func (store *store) ListActiveIssues(ctx context.Context, orgID valuer.UUID) ([]*watchdogtypes.Issue, error) {
	issues := make([]*watchdogtypes.Issue, 0)
	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&issues).
		Where("org_id = ?", orgID).
		Where("status IN (?)", bun.List(activeStatuses)).
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the active watchdog issues of org %s", orgID)
	}
	return issues, nil
}

// SaveChange inserts a created issue unless its fingerprint is already
// active, and updates any other change only while the row still has the
// previous status and has not seen an end at or after the change's.
func (store *store) SaveChange(ctx context.Context, previous *watchdogtypes.Issue, change *watchdogtypes.Change) (bool, error) {
	db := store.sqlstore.BunDBCtx(ctx)
	switch {
	case change.Transition == watchdogtypes.TransitionNone:
		return false, nil
	case change.Transition == watchdogtypes.TransitionCreated:
		result, err := db.
			NewInsert().
			Model(change.Issue).
			On("CONFLICT DO NOTHING").
			Exec(ctx)
		return affectedOne(result, err, change)
	case previous == nil || previous.ID != change.Issue.ID:
		return false, errors.Newf(errors.TypeInternal, errors.CodeInternal, "a %s change needs the issue it was made from", change.Transition.StringValue())
	}
	result, err := db.
		NewUpdate().
		Model(change.Issue).
		WherePK().
		Where("org_id = ?", previous.OrgID).
		Where("status = ?", previous.Status).
		Where("(last_evaluated_at IS NULL OR last_evaluated_at < ?)", change.End).
		Exec(ctx)
	return affectedOne(result, err, change)
}

func (store *store) DeleteResolvedIssues(ctx context.Context, resolvedBefore time.Time, limit int) (int64, error) {
	db := store.sqlstore.BunDBCtx(ctx)
	expired := db.
		NewSelect().
		Table("watchdog_issue").
		Column("id").
		Where("status = ?", watchdogtypes.StatusResolved).
		Where("resolved_at < ?", resolvedBefore).
		OrderExpr("resolved_at").
		Limit(int64(limit))
	result, err := db.
		NewDelete().
		TableExpr("watchdog_issue").
		Where("id IN (?)", expired).
		Exec(ctx)
	if err != nil {
		return 0, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't delete expired watchdog issues")
	}
	return result.RowsAffected()
}

func (store *store) ListSettings(ctx context.Context, orgID valuer.UUID) ([]*watchdogtypes.Setting, error) {
	stored := make([]*watchdogtypes.Setting, 0)
	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&stored).
		Where("org_id = ?", orgID).
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the watchdog settings of org %s", orgID)
	}
	byDetector := make(map[watchdogtypes.Detector]*watchdogtypes.Setting, len(stored))
	for _, setting := range stored {
		byDetector[setting.Detector] = setting
	}
	settings := make([]*watchdogtypes.Setting, 0, len(watchdogtypes.Detector{}.Enum()))
	for _, value := range (watchdogtypes.Detector{}).Enum() {
		detector := value.(watchdogtypes.Detector)
		setting, ok := byDetector[detector]
		if !ok {
			setting = watchdogtypes.NewDefaultSetting(orgID, detector)
		}
		settings = append(settings, setting)
	}
	return settings, nil
}

func (store *store) GetSetting(ctx context.Context, orgID valuer.UUID, detector watchdogtypes.Detector) (*watchdogtypes.Setting, error) {
	setting := watchdogtypes.NewDefaultSetting(orgID, detector)
	if err := setting.Validate(); err != nil {
		return nil, err
	}
	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(setting).
		Where("org_id = ?", orgID).
		Where("detector = ?", detector).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return watchdogtypes.NewDefaultSetting(orgID, detector), nil
	}
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't get the %s watchdog setting of org %s", detector.StringValue(), orgID)
	}
	return setting, nil
}

func (store *store) PutSetting(ctx context.Context, setting *watchdogtypes.Setting) error {
	if err := setting.Validate(); err != nil {
		return err
	}
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(setting).
		On("CONFLICT (org_id, detector) DO UPDATE").
		Set("enabled = EXCLUDED.enabled").
		Set("notify = EXCLUDED.notify").
		Set("updated_at = EXCLUDED.updated_at").
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't put the %s watchdog setting of org %s", setting.Detector.StringValue(), setting.OrgID)
	}
	return nil
}

func (store *store) RunInTx(ctx context.Context, cb func(context.Context) error) error {
	return store.sqlstore.RunInTxCtx(ctx, nil, cb)
}

func affectedOne(result sql.Result, err error, change *watchdogtypes.Change) (bool, error) {
	if err != nil {
		return false, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't save the %s watchdog issue %s", change.Transition.StringValue(), change.Issue.ID)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't save the watchdog issue %s", change.Issue.ID)
	}
	return affected == 1, nil
}
