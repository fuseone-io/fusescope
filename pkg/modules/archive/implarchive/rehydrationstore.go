package implarchive

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

func (store *store) CreateRehydration(ctx context.Context, rehydration *archivetypes.Rehydration) error {
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(rehydration).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record restoration %s", rehydration.ID)
	}

	return nil
}

func (store *store) GetRehydration(ctx context.Context, id valuer.UUID) (*archivetypes.Rehydration, error) {
	rehydration := new(archivetypes.Rehydration)

	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(rehydration).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, archivetypes.ErrCodeRehydrationNotFound, "restoration %s doesn't exist", id)
	}

	return rehydration, nil
}

func (store *store) NextRehydration(ctx context.Context, signal string) (*archivetypes.Rehydration, error) {
	rehydration := new(archivetypes.Rehydration)

	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(rehydration).
		Where("signal = ?", signal).
		Where("status IN (?)", bun.In([]string{archivetypes.RehydrationStatusPending, archivetypes.RehydrationStatusLoading})).
		OrderExpr("created_at ASC, id ASC").
		Limit(1).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, archivetypes.ErrCodeRehydrationNotFound, "%s has no restoration to load", signal)
	}

	return rehydration, nil
}

func (store *store) UpdateRehydration(ctx context.Context, rehydration *archivetypes.Rehydration) error {
	rehydration.UpdatedAt = time.Now().UTC()

	result, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(rehydration).
		Column("status", "bytes", "rows", "ddl", "failure_reason", "failure_message", "updated_at").
		WherePK().
		Exec(ctx)
	if ok, err := oneRowAffected(result, err); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't update restoration %s", rehydration.ID)
	} else if !ok {
		return errors.Newf(errors.TypeNotFound, archivetypes.ErrCodeRehydrationNotFound, "restoration %s doesn't exist", rehydration.ID)
	}

	return nil
}

func (store *store) ListRestorableParts(ctx context.Context, table string, day string) ([]archivetypes.RestorablePart, error) {
	db := store.sqlstore.BunDBCtx(ctx)

	var parts []*archivetypes.ArchivedPart
	err := db.
		NewSelect().
		Model(&parts).
		Join("JOIN archive_object ON archive_object.id = archive_part.object_id").
		Join("JOIN archive_attempt ON archive_attempt.id = archive_part.attempt_id").
		Where("archive_part.table_name = ?", table).
		Where("archive_part.status = ?", archivetypes.PartStatusPublished).
		Where("archive_object.status = ?", archivetypes.ObjectStatusActive).
		Where("archive_attempt.status = ?", archivetypes.AttemptStatusPublished).
		// A superset: _ matches any character. InDay checks the exact directory.
		Where("archive_object.object_key LIKE ?", "%/"+table+"/day="+day+"/%").
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the archived parts of %s on %s", table, day)
	}
	if len(parts) == 0 {
		return nil, nil
	}

	objectIDs, attemptIDs := make([]valuer.UUID, len(parts)), make([]valuer.UUID, len(parts))
	for i, part := range parts {
		objectIDs[i], attemptIDs[i] = part.ObjectID, part.AttemptID
	}
	var objects []*archivetypes.Object
	if err := db.NewSelect().Model(&objects).Where("id IN (?)", bun.In(objectIDs)).Scan(ctx); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the archived objects of %s on %s", table, day)
	}
	var attempts []*archivetypes.Attempt
	if err := db.NewSelect().Model(&attempts).Where("id IN (?)", bun.In(attemptIDs)).Scan(ctx); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the archive attempts of %s on %s", table, day)
	}

	return restorableParts(parts, objects, attempts, day), nil
}

func restorableParts(parts []*archivetypes.ArchivedPart, objects []*archivetypes.Object, attempts []*archivetypes.Attempt, day string) []archivetypes.RestorablePart {
	objectsByID := make(map[valuer.UUID]*archivetypes.Object, len(objects))
	for _, object := range objects {
		objectsByID[object.ID] = object
	}
	attemptsByID := make(map[valuer.UUID]*archivetypes.Attempt, len(attempts))
	for _, attempt := range attempts {
		attemptsByID[attempt.ID] = attempt
	}

	restorable := make([]archivetypes.RestorablePart, 0, len(parts))
	for _, part := range parts {
		candidate := archivetypes.RestorablePart{Part: part, Object: objectsByID[part.ObjectID], Attempt: attemptsByID[part.AttemptID]}
		if candidate.Object != nil && candidate.Attempt != nil && candidate.InDay(day) {
			restorable = append(restorable, candidate)
		}
	}
	return restorable
}
