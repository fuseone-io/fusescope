package lease

import (
	"context"
	"database/sql"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
)

// Times are the database's: bun writes them in UTC with a fixed layout, so
// SQLite's text timestamps compare in order.
type store struct {
	sqlstore sqlstore.SQLStore
}

func newStore(sqlstore sqlstore.SQLStore) *store {
	return &store{sqlstore: sqlstore}
}

// acquire takes a lease that is free or expired, whoever held it, and moves it
// to a new epoch.
func (store *store) acquire(ctx context.Context, name string, holder string, duration time.Duration) (Lease, error) {
	var epoch int64
	err := store.sqlstore.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		db := store.sqlstore.BunDBCtx(ctx)
		now, err := store.sqlstore.Dialect().CurrentTimestamp(ctx, db)
		if err != nil {
			return err
		}
		return db.
			NewRaw(`INSERT INTO lease (name, holder, epoch, expires_at, created_at, updated_at)
				VALUES (?, ?, 1, ?, ?, ?)
				ON CONFLICT (name) DO UPDATE SET
					holder = EXCLUDED.holder,
					epoch = lease.epoch + 1,
					expires_at = EXCLUDED.expires_at,
					updated_at = EXCLUDED.updated_at
				WHERE lease.expires_at <= ?
				RETURNING epoch`, name, holder, now.Add(duration), now, now, now).
			Scan(ctx, &epoch)
	})
	if errors.Is(err, sql.ErrNoRows) {
		return Lease{}, errors.Newf(errors.TypeAlreadyExists, ErrCodeHeld, "the lease %s is held", name)
	}
	if err != nil {
		return Lease{}, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't acquire the lease %s", name)
	}
	return Lease{Name: name, Holder: holder, Epoch: epoch}, nil
}

func (store *store) renew(ctx context.Context, lease Lease, duration time.Duration) error {
	renewed, err := store.extend(ctx, lease, func(now time.Time) time.Time { return now.Add(duration) })
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't renew the lease %s", lease.Name)
	}
	if !renewed {
		return errors.Newf(errors.TypeCanceled, ErrCodeLost, "the lease %s was lost at epoch %d", lease.Name, lease.Epoch)
	}
	return nil
}

// release expires the lease rather than deleting it, so the epoch keeps
// growing for the next holder.
func (store *store) release(ctx context.Context, lease Lease) error {
	if _, err := store.extend(ctx, lease, func(now time.Time) time.Time { return now }); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't release the lease %s", lease.Name)
	}
	return nil
}

// extend moves the expiry of a lease still held by its holder at its epoch,
// and reports whether it was.
func (store *store) extend(ctx context.Context, lease Lease, expiresAt func(now time.Time) time.Time) (bool, error) {
	var updated int64
	err := store.sqlstore.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		db := store.sqlstore.BunDBCtx(ctx)
		now, err := store.sqlstore.Dialect().CurrentTimestamp(ctx, db)
		if err != nil {
			return err
		}
		result, err := db.
			NewUpdate().
			Table("lease").
			Set("expires_at = ?", expiresAt(now)).
			Set("updated_at = ?", now).
			Where("name = ?", lease.Name).
			Where("holder = ?", lease.Holder).
			Where("epoch = ?", lease.Epoch).
			Where("expires_at > ?", now).
			Exec(ctx)
		if err != nil {
			return err
		}
		updated, err = result.RowsAffected()
		return err
	})
	return updated == 1, err
}
