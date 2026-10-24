package implarchive

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

type store struct {
	sqlstore sqlstore.SQLStore
}

func NewStore(sqlstore sqlstore.SQLStore) archivetypes.Store {
	return &store{sqlstore: sqlstore}
}

func (store *store) GetSignal(ctx context.Context, signal string) (*archivetypes.Signal, error) {
	state := new(archivetypes.Signal)

	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(state).
		Where("signal = ?", signal).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, archivetypes.ErrCodeSignalNotFound, "%s has no archive state", signal)
	}

	return state, nil
}

func (store *store) SetBackstop(ctx context.Context, signal string, days int) error {
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(archivetypes.NewSignal(signal, days)).
		On("CONFLICT (signal) DO UPDATE").
		Set("backstop_days = EXCLUDED.backstop_days").
		Set("applied_at = NULL").
		Set("updated_at = EXCLUDED.updated_at").
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record the archive backstop of %s", signal)
	}

	return nil
}

func (store *store) MarkBackstopApplied(ctx context.Context, signal string, appliedAt time.Time) error {
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(new(archivetypes.Signal)).
		Set("applied_at = ?", appliedAt).
		Set("updated_at = ?", appliedAt).
		Where("signal = ?", signal).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record the archive backstop of %s as applied", signal)
	}

	return nil
}
