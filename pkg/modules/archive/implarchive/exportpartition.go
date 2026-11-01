package implarchive

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

const abandonTimeout = 30 * time.Second

func (service *exportService) export(ctx context.Context, lease *archivetypes.Lease, job exportJob) error {
	chosen, ok := archivetypes.ChooseReplica(job.snapshot)
	if !ok {
		service.settings.Logger().InfoContext(ctx, "no replica holds every part of the partition yet, retrying next cycle", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID))
		return nil
	}

	published, err := service.store.ListPublishedParts(ctx, job.pin, job.partition.ID)
	if err != nil {
		return err
	}
	candidates := service.holdLateParts(archivetypes.SelectForExport(job.snapshot[chosen], archivetypes.PartsOf(published)), len(published) > 0)
	if len(candidates) > 0 {
		if err := service.exportCandidates(ctx, lease, job, chosen, candidates); err != nil {
			return err
		}
	}

	return service.dropArchived(ctx, job, job.replicas[chosen])
}

func (service *exportService) exportCandidates(ctx context.Context, lease *archivetypes.Lease, job exportJob, chosen string, candidates []archivetypes.Part) error {
	signalConfig := service.config.Logs
	attempt := archivetypes.NewExportAttempt(lease, job.pin, job.partition.ID, signalConfig.NamedCollection, signalConfig.Prefix)
	if err := service.store.CreateAttempt(ctx, attempt); err != nil {
		return err
	}

	if err := service.publish(ctx, lease, job, job.replicas[chosen].conn, attempt, candidates); err != nil {
		// The attempt is abandoned even when the cycle is stopping, so its objects are orphans.
		abandonCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), abandonTimeout)
		defer cancel()
		if abandonErr := service.store.AbandonAttempt(abandonCtx, attempt.ID); abandonErr != nil {
			return errors.Join(err, abandonErr)
		}
		return err
	}

	service.settings.Logger().InfoContext(ctx, "archive partition exported", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID), slog.Int("parts", len(candidates)), slog.String("attempt_id", attempt.ID.StringValue()))
	return nil
}

// publish writes the parts, checks them back, writes the manifest and commits.
func (service *exportService) publish(ctx context.Context, lease *archivetypes.Lease, job exportJob, conn clickhouse.Conn, attempt *archivetypes.Attempt, parts []archivetypes.Part) error {
	collection := attempt.NamedCollection
	location := archivetypes.ObjectLocation{Prefix: attempt.Prefix, Table: job.table.Name, Day: job.partition.Day, Shard: job.shard, PartitionID: job.partition.ID, AttemptID: attempt.ID.StringValue()}
	for _, part := range parts {
		statement := archivetypes.ExportStatement(job.table, job.mappings, collection, job.shard, part.Name, location.ObjectKey(part.Name))
		if err := service.exec(ctx, service.partTimeout(part), queryID(location.AttemptID, "export"), func(ctx context.Context) error { return conn.Exec(ctx, statement) }); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't export part %s of %s", part.Name, job.table.Name)
		}
	}

	var stats []archivetypes.ObjectStat
	err := service.exec(ctx, service.config.Limits.QueryTimeout, queryID(location.AttemptID, "check"), func(ctx context.Context) error {
		var err error
		stats, err = statObjects(ctx, conn, collection, location.Dir())
		return err
	})
	if err != nil {
		return err
	}
	publication, err := archivetypes.NewPublication(attempt, location, parts, stats)
	if err != nil {
		return err
	}

	manifest, digest, err := publication.Manifest(location, job.version, job.mappings).Encode()
	if err != nil {
		return err
	}
	if err := service.exec(ctx, service.config.Limits.QueryTimeout, queryID(location.AttemptID, "manifest"), func(ctx context.Context) error {
		return writeBlob(ctx, conn, collection, location.ManifestKey(), manifest)
	}); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't write the manifest of archive attempt %s", attempt.ID)
	}
	if err := attempt.SetFormat(job.mappings, location.ManifestKey(), digest); err != nil {
		return err
	}

	return service.store.Publish(ctx, lease, publication)
}

// holdLateParts returns the candidates to export now. A candidate is first seen when it was
// written, or, merged from inventoried parts, when the earliest of them was first seen.
func (service *exportService) holdLateParts(candidates []archivetypes.Part, partitionHasPublished bool) []archivetypes.Part {
	hold := archivetypes.LateHold{MinRows: service.config.Logs.LateMinRows, MaxHold: service.config.Logs.LateMaxHold}
	if !hold.Ready(candidates, partitionHasPublished, time.Now()) {
		return nil
	}
	return candidates
}

// syncIndex writes the table's active objects under the key of the commit they reflect, unless
// the bucket already has an index at the table's latest commit. Reading the bucket rather than
// remembering writes covers a cycle that published and then lost its lease or crashed. Of two
// writers, the one at the later epoch or sequence has the higher key; a key written again
// holds the same snapshot, so it may be overwritten.
func (service *exportService) syncIndex(ctx context.Context, conn clickhouse.Conn, lease *archivetypes.Lease, table archivetypes.Table) {
	signalConfig := service.config.Logs
	err := func() error {
		snapshot, err := service.store.IndexSnapshot(ctx, table.Name)
		if err != nil {
			return err
		}
		written, err := service.writtenIndexSequence(ctx, conn, table)
		if err != nil {
			service.settings.Logger().WarnContext(ctx, "archive indexes not read back, writing the index", slog.String("table", table.Name), errors.Attr(err))
		} else if written >= snapshot.Sequence {
			return nil
		}

		encoded, err := json.Marshal(archivetypes.NewIndex(table.Name, lease.Epoch, snapshot))
		if err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't encode the archive index of %s", table.Name)
		}

		settings := service.querySettings(service.config.Limits.QueryTimeout)
		settings["s3_truncate_on_insert"] = 1
		ctx, cancel := withQuerySettings(ctx, settings, service.config.Limits.QueryTimeout, queryID(fmt.Sprintf("%d-%d", lease.Epoch, snapshot.Sequence), "index"))
		defer cancel()
		return writeBlob(ctx, conn, signalConfig.NamedCollection, archivetypes.IndexKey(signalConfig.Prefix, table.Name, lease.Epoch, snapshot.Sequence), encoded)
	}()
	if err != nil {
		service.settings.Logger().WarnContext(ctx, "archive index not written, retrying next cycle", slog.String("table", table.Name), errors.Attr(err))
	}
}

// writtenIndexSequence is the latest commit sequence the bucket has an index at, 0 when none.
func (service *exportService) writtenIndexSequence(ctx context.Context, conn clickhouse.Conn, table archivetypes.Table) (int64, error) {
	var files []string
	err := service.exec(ctx, service.config.Limits.QueryTimeout, queryID(table.Name, "indexes"), func(ctx context.Context) error {
		var err error
		files, err = listIndexes(ctx, conn, service.config.Logs.NamedCollection, service.config.Logs.Prefix, table.Name)
		return err
	})
	if err != nil {
		return 0, err
	}

	var latest int64
	for _, file := range files {
		if sequence, ok := archivetypes.IndexSequence(file); ok && sequence > latest {
			latest = sequence
		}
	}
	return latest, nil
}

// partTimeout grows with the part's size, as encoding and uploading a large merged part can
// outlast query_timeout, but never past the cycle's deadline.
func (service *exportService) partTimeout(part archivetypes.Part) time.Duration {
	limits := service.config.Limits
	startedGiB := (part.BytesOnDisk + 1<<30 - 1) >> 30
	timeout := limits.QueryTimeout + time.Duration(startedGiB)*limits.QueryTimeoutPerGiB
	return min(timeout, service.config.Logs.CycleTimeout())
}

// exec runs query with the archive limits, under timeout.
func (service *exportService) exec(ctx context.Context, timeout time.Duration, id string, query func(ctx context.Context) error) error {
	ctx, cancel := withQuerySettings(ctx, service.querySettings(timeout), timeout, id)
	defer cancel()
	return query(ctx)
}

func (service *exportService) querySettings(timeout time.Duration) clickhouse.Settings {
	limits := service.config.Limits
	return querySettings(limits.MaxMemoryUsage, limits.MaxThreads, limits.RowGroupRows, timeout)
}
