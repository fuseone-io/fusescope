package implarchive

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

func (store *store) AbandonStaleAttempts(ctx context.Context, lease *archivetypes.Lease) (int64, error) {
	result, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(new(archivetypes.Attempt)).
		Set("status = ?", archivetypes.AttemptStatusAbandoned).
		Set("updated_at = ?", time.Now()).
		Where("signal = ?", lease.Signal).
		Where("epoch < ?", lease.Epoch).
		Where("status = ?", archivetypes.AttemptStatusPending).
		Exec(ctx)
	if err != nil {
		return 0, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't abandon the stale archive attempts of %s", lease.Signal)
	}

	abandoned, err := result.RowsAffected()
	if err != nil {
		return 0, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't abandon the stale archive attempts of %s", lease.Signal)
	}
	return abandoned, nil
}
