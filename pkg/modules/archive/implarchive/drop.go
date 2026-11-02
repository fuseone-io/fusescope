package implarchive

import (
	"context"
	"log/slog"
	"path"
	"slices"
	"time"

	"github.com/ClickHouse/ch-go/proto"
	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// maxDropRounds bounds how often a partition's drop starts over from a new snapshot after a
// part merged away under it.
const maxDropRounds = 3

// dropArchived drops, by name on replica, the partition's active parts whose rows are all in
// published parts of the job's shard pin (ADR 0002 §4). The replica's parts and the published
// parts are read right before, and the replica must still hold the pinned data, so a part
// committed since the snapshot or a recreated table is never taken for an archived one.
func (service *exportService) dropArchived(ctx context.Context, job exportJob, replica replica) error {
	for round := 1; round <= maxDropRounds; round++ {
		stale, err := service.dropRound(ctx, job, replica)
		if err != nil || !stale {
			return err
		}
		service.settings.Logger().InfoContext(ctx, "an archived part merged away before its drop, taking a new snapshot", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID), slog.Int("round", round))
	}

	return nil
}

// dropRound reports whether a part to drop no longer existed, as the snapshot then changed.
func (service *exportService) dropRound(ctx context.Context, job exportJob, replica replica) (bool, error) {
	inspected, err := inspectReplica(ctx, replica.conn, service.telemetryStore.Cluster(), replica.shard, replica.replica, job.table)
	if err != nil {
		return false, err
	}
	if !inspected.isReplica || inspected.identity() != job.pin.ReplicaPath {
		return false, errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeShardMismatch, "%s no longer holds %s of shard %d at %s, nothing dropped", replica.addr, job.table.Name, job.shard, job.pin.ReplicaPath)
	}

	published, err := service.store.ListPublishedParts(ctx, job.pin, job.partition.ID)
	if err != nil {
		return false, err
	}
	current, err := partitionParts(ctx, replica.conn, job.table, job.partition.ID)
	if err != nil {
		return false, err
	}

	selected := archivetypes.SelectForDrop(current, archivetypes.PartsOf(published))
	if len(selected) == 0 {
		return false, nil
	}
	verified, err := service.verifiedParts(ctx, job, replica, published)
	if err != nil {
		return false, err
	}

	return service.dropParts(ctx, job, replica, archivetypes.SelectForDrop(selected, archivetypes.PartsOf(verified)))
}

// dropParts drops parts in order, skipping a part that merged away or that a merge or
// mutation holds.
func (service *exportService) dropParts(ctx context.Context, job exportJob, replica replica, parts []archivetypes.Part) (bool, error) {
	stale := false
	var dropped []archivetypes.Part
	for _, part := range parts {
		statement := archivetypes.DropPartStatement(job.table, part.Name)
		err := service.exec(ctx, service.config.Limits.QueryTimeout, queryID(job.pin.ID.StringValue(), "drop"), func(ctx context.Context) error { return replica.conn.Exec(ctx, statement) })
		if hasCode(err, proto.ErrNoSuchDataPart) {
			stale = true
			continue
		}
		if hasCode(err, proto.ErrPartIsTemporarilyLocked) {
			service.settings.Logger().InfoContext(ctx, "an archived part is locked by a merge or mutation, dropping it next cycle", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("part", part.Name))
			continue
		}
		if err != nil {
			err = errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't drop archived part %s of %s", part.Name, job.table.Name)
			return false, errors.Join(err, service.recordDropped(ctx, job, dropped))
		}
		dropped = append(dropped, part)
	}

	return stale, service.recordDropped(ctx, job, dropped)
}

// verifiedParts returns the published parts whose object, unless already dropped, the bucket
// still holds at its published size and ETag: a part covered only by a deleted or rewritten
// object would lose its only copy.
func (service *exportService) verifiedParts(ctx context.Context, job exportJob, replica replica, published []*archivetypes.ArchivedPart) ([]*archivetypes.ArchivedPart, error) {
	objects, err := service.store.ListUndroppedObjects(ctx, job.pin, job.partition.ID)
	if err != nil {
		return nil, err
	}

	var found []archivetypes.ObjectStat
	for dir, collection := range objectDirs(objects) {
		var stats []archivetypes.ObjectStat
		err := service.exec(ctx, service.config.Limits.QueryTimeout, queryID(job.pin.ID.StringValue(), "verify"), func(ctx context.Context) error {
			var err error
			stats, err = listObjects(ctx, replica.conn, collection, dir)
			return err
		})
		if err != nil {
			return nil, err
		}
		for _, stat := range stats {
			stat.File = dir + "/" + stat.File
			found = append(found, stat)
		}
	}

	mismatched := make(map[valuer.UUID]bool)
	for _, mismatch := range archivetypes.MismatchedObjects(objects, found) {
		mismatched[mismatch.Object.ID] = true
		attrs := []any{slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("object_key", mismatch.Object.ObjectKey), slog.Int64("bytes", mismatch.Object.Bytes), slog.String("etag", mismatch.Object.ETag)}
		if mismatch.Found != nil {
			attrs = append(attrs, slog.Int64("found_bytes", mismatch.Found.Bytes), slog.String("found_etag", mismatch.Found.ETag))
		}
		service.settings.Logger().ErrorContext(ctx, "archived object missing or changed in the bucket, its parts are kept in ClickHouse", attrs...)
	}
	service.metrics.recordMismatched(ctx, job.table.Name, len(mismatched))

	return slices.DeleteFunc(slices.Clone(published), func(part *archivetypes.ArchivedPart) bool { return mismatched[part.ObjectID] }), nil
}

// objectDirs maps the directories holding objects to their named collection.
func objectDirs(objects []*archivetypes.Object) map[string]string {
	dirs := make(map[string]string)
	for _, object := range objects {
		dirs[path.Dir(object.ObjectKey)] = object.NamedCollection
	}
	return dirs
}

func (service *exportService) recordDropped(ctx context.Context, job exportJob, dropped []archivetypes.Part) error {
	if len(dropped) == 0 {
		return nil
	}

	service.metrics.recordDropped(ctx, job.table.Name, dropped)
	service.settings.Logger().InfoContext(ctx, "archived parts dropped", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID), slog.Int("parts", len(dropped)), slog.Int64("rows", rowsOf(dropped)))
	return service.store.MarkPartsDropped(ctx, job.pin, job.partition.ID, archivetypes.RangesOf(dropped), time.Now())
}

func hasCode(err error, code proto.Error) bool {
	var exception *clickhouse.Exception
	return errors.As(err, &exception) && proto.Error(exception.Code) == code
}

func listObjects(ctx context.Context, conn clickhouse.Conn, namedCollection string, dir string) ([]archivetypes.ObjectStat, error) {
	rows, err := conn.Query(ctx, archivetypes.ListObjectsStatement(namedCollection, dir))
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the objects under %s", dir)
	}
	defer rows.Close()

	var stats []archivetypes.ObjectStat
	for rows.Next() {
		var stat archivetypes.ObjectStat
		var size uint64
		if err := rows.Scan(&stat.File, &size, &stat.ETag); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the objects under %s", dir)
		}
		stat.Bytes = int64(size)
		stats = append(stats, stat)
	}

	return stats, rows.Err()
}
