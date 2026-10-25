package implarchive

import (
	"context"
	"database/sql"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

func (store *store) CreateAttempt(ctx context.Context, attempt *archivetypes.Attempt) error {
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(attempt).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record archive attempt %s", attempt.ID)
	}

	return nil
}

func (store *store) AbandonAttempt(ctx context.Context, id valuer.UUID) error {
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(new(archivetypes.Attempt)).
		Set("status = ?", archivetypes.AttemptStatusAbandoned).
		Set("updated_at = ?", time.Now()).
		Where("id = ?", id).
		Where("status = ?", archivetypes.AttemptStatusPending).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't abandon archive attempt %s", id)
	}

	return nil
}

func (store *store) Publish(ctx context.Context, lease *archivetypes.Lease, publication *archivetypes.Publication) error {
	return store.sqlstore.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		db := store.sqlstore.BunDBCtx(ctx)
		attempt := publication.Attempt
		now := time.Now().UTC()

		// Taking the lease row first holds off a takeover until the commit ends.
		fenced, err := db.
			NewUpdate().
			Model(new(archivetypes.Lease)).
			Set("updated_at = ?", now).
			Where("signal = ?", lease.Signal).
			Where("holder = ?", lease.Holder).
			Where("epoch = ?", lease.Epoch).
			Where("expires_at > ?", now).
			Exec(ctx)
		if ok, err := oneRowAffected(fenced, err); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't check the archive lease of %s", lease.Signal)
		} else if !ok {
			return errors.Newf(errors.TypeForbidden, archivetypes.ErrCodeLeaseLost, "the archive lease of %s at epoch %d is lost", lease.Signal, lease.Epoch)
		}

		published, err := db.
			NewUpdate().
			Model(new(archivetypes.Attempt)).
			Set("status = ?", archivetypes.AttemptStatusPublished).
			Set("format_version = ?", attempt.FormatVersion).
			Set("column_mapping = ?", attempt.ColumnMapping).
			Set("manifest_key = ?", attempt.ManifestKey).
			Set("manifest_sha256 = ?", attempt.ManifestSHA256).
			Set("updated_at = ?", now).
			Where("id = ?", attempt.ID).
			Where("epoch = ?", lease.Epoch).
			Where("status = ?", archivetypes.AttemptStatusPending).
			Exec(ctx)
		if ok, err := oneRowAffected(published, err); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't publish archive attempt %s", attempt.ID)
		} else if !ok {
			return errors.Newf(errors.TypeAlreadyExists, archivetypes.ErrCodeAttemptNotPending, "archive attempt %s is not pending at epoch %d", attempt.ID, lease.Epoch)
		}

		if len(publication.Objects) > 0 {
			if _, err := db.NewInsert().Model(&publication.Objects).Exec(ctx); err != nil {
				return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record the objects of archive attempt %s", attempt.ID)
			}
		}
		if len(publication.Parts) > 0 {
			if _, err := db.NewInsert().Model(&publication.Parts).Exec(ctx); err != nil {
				return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record the parts of archive attempt %s", attempt.ID)
			}
		}

		return supersede(ctx, db, publication, now)
	})
}

func (store *store) ListPublishedParts(ctx context.Context, table string, shard int, partitionID string) ([]*archivetypes.ArchivedPart, error) {
	parts := make([]*archivetypes.ArchivedPart, 0)

	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&parts).
		Where("table_name = ?", table).
		Where("shard = ?", shard).
		Where("partition_id = ?", partitionID).
		Where("status = ?", archivetypes.PartStatusPublished).
		Order("min_block").
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the published parts of %s partition %s on shard %d", table, partitionID, shard)
	}

	return parts, nil
}

func (store *store) ListActiveObjects(ctx context.Context, table string) ([]*archivetypes.Object, error) {
	objects := make([]*archivetypes.Object, 0)

	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&objects).
		Join("JOIN archive_attempt ON archive_attempt.id = archive_object.attempt_id").
		Where("archive_attempt.table_name = ?", table).
		Where("archive_object.status = ?", archivetypes.ObjectStatusActive).
		Order("archive_object.object_key").
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the active archive objects of %s", table)
	}

	return objects, nil
}

// supersede marks the published parts of the partition that a part of publication contains,
// then the objects left without a published part.
func supersede(ctx context.Context, db bun.IDB, publication *archivetypes.Publication, now time.Time) error {
	attempt := publication.Attempt

	existing := make([]*archivetypes.ArchivedPart, 0)
	err := db.
		NewSelect().
		Model(&existing).
		Where("table_name = ?", attempt.TableName).
		Where("shard = ?", attempt.Shard).
		Where("partition_id = ?", attempt.PartitionID).
		Where("status = ?", archivetypes.PartStatusPublished).
		Where("attempt_id != ?", attempt.ID).
		Scan(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the published parts superseded by archive attempt %s", attempt.ID)
	}

	superseded := make(map[string]bool)
	for _, part := range archivetypes.Superseded(archivetypes.PartsOf(existing), archivetypes.PartsOf(publication.Parts)) {
		superseded[part.Name] = true
	}

	var partIDs, objectIDs []valuer.UUID
	for _, part := range existing {
		if superseded[part.PartName] {
			partIDs = append(partIDs, part.ID)
			objectIDs = append(objectIDs, part.ObjectID)
		}
	}
	if len(partIDs) == 0 {
		return nil
	}

	_, err = db.
		NewUpdate().
		Model(new(archivetypes.ArchivedPart)).
		Set("status = ?", archivetypes.PartStatusSuperseded).
		Set("updated_at = ?", now).
		Where("id IN (?)", bun.In(partIDs)).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't mark the parts superseded by archive attempt %s", attempt.ID)
	}

	_, err = db.
		NewUpdate().
		Model(new(archivetypes.Object)).
		Set("status = ?", archivetypes.ObjectStatusSuperseded).
		Set("updated_at = ?", now).
		Where("id IN (?)", bun.In(objectIDs)).
		Where("status = ?", archivetypes.ObjectStatusActive).
		Where("NOT EXISTS (SELECT 1 FROM archive_part WHERE archive_part.object_id = archive_object.id AND archive_part.status = ?)", archivetypes.PartStatusPublished).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't mark the objects superseded by archive attempt %s", attempt.ID)
	}

	return nil
}

func oneRowAffected(result sql.Result, err error) (bool, error) {
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return rows == 1, nil
}
