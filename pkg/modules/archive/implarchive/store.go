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

func (store *store) AcquireLease(ctx context.Context, signal string, holder string, expiresAt time.Time) (*archivetypes.Lease, error) {
	now := time.Now().UTC()

	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(archivetypes.NewLease(signal, holder, expiresAt)).
		On("CONFLICT (signal) DO UPDATE").
		Set("epoch = CASE WHEN archive_lease.holder = EXCLUDED.holder AND archive_lease.expires_at > ? THEN archive_lease.epoch ELSE archive_lease.epoch + 1 END", now).
		Set("holder = EXCLUDED.holder").
		Set("expires_at = EXCLUDED.expires_at").
		Set("updated_at = EXCLUDED.updated_at").
		Where("archive_lease.holder = EXCLUDED.holder OR archive_lease.expires_at <= ?", now).
		Exec(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't acquire the archive lease of %s", signal)
	}

	lease := new(archivetypes.Lease)
	err = store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(lease).
		Where("signal = ?", signal).
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the archive lease of %s", signal)
	}
	if lease.Holder != holder {
		return nil, errors.Newf(errors.TypeAlreadyExists, archivetypes.ErrCodeLeaseHeld, "the archive lease of %s is held by %s until %s", signal, lease.Holder, lease.ExpiresAt.Format(time.RFC3339))
	}

	return lease, nil
}
