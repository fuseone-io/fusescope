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
	result, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(new(archivetypes.Attempt)).
		Set("status = ?", archivetypes.AttemptStatusAbandoned).
		Set("updated_at = ?", time.Now()).
		Where("id = ?", id).
		Where("status = ?", archivetypes.AttemptStatusPending).
		Exec(ctx)
	if ok, err := oneRowAffected(result, err); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't abandon archive attempt %s", id)
	} else if !ok {
		return errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeAttemptNotPending, "archive attempt %s is not pending", id)
	}

	return nil
}

func (store *store) Publish(ctx context.Context, lease *archivetypes.Lease, publication *archivetypes.Publication) error {
	if err := publication.Validate(); err != nil {
		return err
	}

	return store.sqlstore.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		db := store.sqlstore.BunDBCtx(ctx)
		attempt := publication.Attempt
		now := time.Now().UTC()

		if err := fence(ctx, db, lease, now); err != nil {
			return err
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
			Where("signal = ?", lease.Signal).
			Where("epoch = ?", lease.Epoch).
			Where("status = ?", archivetypes.AttemptStatusPending).
			Exec(ctx)
		if ok, err := oneRowAffected(published, err); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't publish archive attempt %s", attempt.ID)
		} else if !ok {
			return notPublished(ctx, db, attempt.ID, lease)
		}

		if len(publication.Objects) > 0 {
			if _, err := db.NewInsert().Model(&publication.Objects).Exec(ctx); err != nil {
				return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record the objects of archive attempt %s", attempt.ID)
			}
		}
		if len(publication.Parts) > 0 {
			if _, err := db.NewInsert().Model(&publication.Parts).Exec(ctx); err != nil {
				if wrapped := store.sqlstore.WrapAlreadyExistsErrf(err, archivetypes.ErrCodePartAlreadyPublished, "a part of archive attempt %s is published already", attempt.ID); wrapped != err {
					return wrapped
				}
				return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record the parts of archive attempt %s", attempt.ID)
			}
		}

		return supersede(ctx, db, publication, now)
	})
}

func (store *store) ListPublishedParts(ctx context.Context, shard *archivetypes.Shard, partitionID string) ([]*archivetypes.ArchivedPart, error) {
	parts := make([]*archivetypes.ArchivedPart, 0)

	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&parts).
		Where("shard_id = ?", shard.ID).
		Where("partition_id = ?", partitionID).
		Where("status = ?", archivetypes.PartStatusPublished).
		Order("min_block").
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the published parts of %s partition %s on shard %d", shard.TableName, partitionID, shard.Shard)
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

func (store *store) IndexSnapshot(ctx context.Context, table string) (*archivetypes.IndexSnapshot, error) {
	snapshot := new(archivetypes.IndexSnapshot)
	err := store.sqlstore.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		sequence, err := store.
			sqlstore.
			BunDBCtx(ctx).
			NewSelect().
			Model(new(archivetypes.Attempt)).
			Where("table_name = ?", table).
			Where("status = ?", archivetypes.AttemptStatusPublished).
			Count(ctx)
		if err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't count the archive commits of %s", table)
		}
		snapshot.Sequence = int64(sequence)

		snapshot.Objects, err = store.ListActiveObjects(ctx, table)
		return err
	})
	if err != nil {
		return nil, err
	}

	return snapshot, nil
}

// notPublished tells why the attempt update matched no row: the attempt is published, or the
// lease isn't the attempt's.
func notPublished(ctx context.Context, db bun.IDB, id valuer.UUID, lease *archivetypes.Lease) error {
	attempt := new(archivetypes.Attempt)
	if err := db.NewSelect().Model(attempt).Where("id = ?", id).Scan(ctx); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read archive attempt %s", id)
	}

	switch {
	case attempt.Status == archivetypes.AttemptStatusPublished:
		return errors.Newf(errors.TypeAlreadyExists, archivetypes.ErrCodeAttemptAlreadyPublished, "archive attempt %s is published already", id)
	case attempt.Signal != lease.Signal || attempt.Epoch != lease.Epoch:
		return errors.Newf(errors.TypeForbidden, archivetypes.ErrCodeLeaseLost, "archive attempt %s was made under the %s lease at epoch %d, not the %s lease at epoch %d", id, attempt.Signal, attempt.Epoch, lease.Signal, lease.Epoch)
	default:
		return errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeAttemptNotPending, "archive attempt %s is %s", id, attempt.Status)
	}
}

// supersede marks the partition's published parts that a part of publication contains, and
// the parts of publication that a remaining published part contains, then the objects left
// without a published part.
func supersede(ctx context.Context, db bun.IDB, publication *archivetypes.Publication, now time.Time) error {
	attempt := publication.Attempt

	existing := make([]*archivetypes.ArchivedPart, 0)
	err := db.
		NewSelect().
		Model(&existing).
		Where("shard_id = ?", attempt.ShardID).
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
	var remaining []*archivetypes.ArchivedPart
	for _, part := range existing {
		if !superseded[part.PartName] {
			remaining = append(remaining, part)
		}
	}
	newlySuperseded := make(map[string]bool)
	for _, part := range archivetypes.Superseded(archivetypes.PartsOf(publication.Parts), archivetypes.PartsOf(remaining)) {
		newlySuperseded[part.Name] = true
	}

	var partIDs, objectIDs []valuer.UUID
	for _, part := range existing {
		if superseded[part.PartName] {
			partIDs = append(partIDs, part.ID)
			objectIDs = append(objectIDs, part.ObjectID)
		}
	}
	for _, part := range publication.Parts {
		if newlySuperseded[part.PartName] {
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

// fence takes the lease row first, which holds off a takeover until the transaction ends, and
// fails with ErrCodeLeaseLost unless lease is still valid at its epoch.
func fence(ctx context.Context, db bun.IDB, lease *archivetypes.Lease, now time.Time) error {
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

func (store *store) PinShard(ctx context.Context, table string, shard int, replicaPath string) (*archivetypes.Shard, error) {
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(archivetypes.NewShard(table, shard, replicaPath)).
		On("CONFLICT DO NOTHING").
		Exec(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't pin shard %d of %s", shard, table)
	}

	var pinned []*archivetypes.Shard
	err = store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&pinned).
		Where("table_name = ?", table).
		WhereGroup(" AND ", func(query *bun.SelectQuery) *bun.SelectQuery {
			return query.Where("shard = ?", shard).WhereOr("replica_path = ?", replicaPath)
		}).
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the pinned shards of %s", table)
	}

	var pin *archivetypes.Shard
	for _, other := range pinned {
		switch {
		case other.Shard == shard && other.ReplicaPath == replicaPath:
			pin = other
		case other.Shard == shard:
			return nil, errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeShardMismatch, "shard %d of %s holds %s, but was pinned to %s; if the table was recreated or moved, re-pin it by deleting its archive_shard row (id %s)", shard, table, replicaPath, other.ReplicaPath, other.ID)
		default:
			return nil, errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeShardMismatch, "shard %d of %s holds %s, which shard %d was pinned to; remote_servers was reordered", shard, table, replicaPath, other.Shard)
		}
	}
	if pin == nil {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "shard %d of %s wasn't pinned", shard, table)
	}

	return pin, nil
}
