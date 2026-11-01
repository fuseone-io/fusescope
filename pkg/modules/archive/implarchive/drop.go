package implarchive

import (
	"context"
	"log/slog"
	"time"

	"github.com/ClickHouse/ch-go/proto"
	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
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
	current, err := partitionActiveParts(ctx, replica.conn, job.table, job.partition.ID)
	if err != nil {
		return false, err
	}

	stale := false
	var dropped []archivetypes.Part
	for _, part := range archivetypes.SelectForDrop(current, archivetypes.PartsOf(published)) {
		statement := archivetypes.DropPartStatement(job.table, part.Name)
		err := service.exec(ctx, service.config.Limits.QueryTimeout, queryID(job.pin.ID.StringValue(), "drop"), func(ctx context.Context) error { return replica.conn.Exec(ctx, statement) })
		if noSuchPart(err) {
			stale = true
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

func (service *exportService) recordDropped(ctx context.Context, job exportJob, dropped []archivetypes.Part) error {
	if len(dropped) == 0 {
		return nil
	}

	service.metrics.recordDropped(ctx, job.table.Name, dropped)
	service.settings.Logger().InfoContext(ctx, "archived parts dropped", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID), slog.Int("parts", len(dropped)), slog.Int64("rows", rowsOf(dropped)))
	return service.store.MarkPartsDropped(ctx, job.pin, job.partition.ID, archivetypes.RangesOf(dropped), time.Now())
}

func noSuchPart(err error) bool {
	var exception *clickhouse.Exception
	return errors.As(err, &exception) && proto.Error(exception.Code) == proto.ErrNoSuchDataPart
}
