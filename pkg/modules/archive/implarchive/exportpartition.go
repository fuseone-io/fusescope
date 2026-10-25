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

func (service *exportService) export(ctx context.Context, lease *archivetypes.Lease, job exportJob) error {
	chosen, ok := archivetypes.ChooseReplica(job.snapshot)
	if !ok {
		service.settings.Logger().InfoContext(ctx, "no replica holds every part of the partition yet, retrying next cycle", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID))
		return nil
	}

	published, err := service.store.ListPublishedParts(ctx, job.table.Name, job.shard, job.partition.ID)
	if err != nil {
		return err
	}
	candidates := service.holdLateParts(job, archivetypes.SelectForExport(job.snapshot[chosen], archivetypes.PartsOf(published)), len(published) > 0)
	if len(candidates) == 0 {
		return nil
	}

	signalConfig := service.config.Logs
	attempt := archivetypes.NewExportAttempt(lease, job.table.Name, job.shard, job.partition.ID, signalConfig.NamedCollection, signalConfig.Prefix)
	if err := service.store.CreateAttempt(ctx, attempt); err != nil {
		return err
	}

	if err := service.publish(ctx, lease, job, job.replicas[chosen].conn, attempt, candidates); err != nil {
		// The attempt is abandoned even when the cycle is stopping, so its objects are orphans.
		if abandonErr := service.store.AbandonAttempt(context.WithoutCancel(ctx), attempt.ID); abandonErr != nil {
			return errors.Join(err, abandonErr)
		}
		return err
	}

	service.mu.Lock()
	delete(service.firstSeen, jobKey(job))
	service.mu.Unlock()

	service.settings.Logger().InfoContext(ctx, "archive partition exported", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID), slog.Int("parts", len(candidates)), slog.String("attempt_id", attempt.ID.StringValue()))
	service.writeIndex(ctx, job.replicas[chosen].conn, lease, job.table)
	return nil
}

// publish writes the parts, checks them back, writes the manifest and commits.
func (service *exportService) publish(ctx context.Context, lease *archivetypes.Lease, job exportJob, conn clickhouse.Conn, attempt *archivetypes.Attempt, parts []archivetypes.Part) error {
	collection := attempt.NamedCollection
	location := archivetypes.ObjectLocation{Prefix: attempt.Prefix, Table: job.table.Name, Day: job.partition.Day, Shard: job.shard, PartitionID: job.partition.ID, AttemptID: attempt.ID.StringValue()}
	settings := service.querySettings()

	for _, part := range parts {
		statement := archivetypes.ExportStatement(job.table, job.mappings, collection, job.shard, part.Name, location.ObjectKey(part.Name))
		if err := conn.Exec(withQuerySettings(ctx, settings, queryID(location.AttemptID, "export")), statement); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't export part %s of %s", part.Name, job.table.Name)
		}
	}

	stats, err := statObjects(withQuerySettings(ctx, settings, queryID(location.AttemptID, "check")), conn, collection, location.Dir())
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
	if err := conn.Exec(withQuerySettings(ctx, settings, queryID(location.AttemptID, "manifest")), archivetypes.WriteBlobStatement(collection, location.ManifestKey(), manifest)); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't write the manifest of archive attempt %s", attempt.ID)
	}
	if err := attempt.SetFormat(job.mappings, location.ManifestKey(), digest); err != nil {
		return err
	}

	return service.store.Publish(ctx, lease, publication)
}

// holdLateParts returns the candidates to export now, remembering when each was first seen
// so a merge of held parts keeps the earliest time. A restart forgets them, which the
// backstop covers: late_max_hold is below half of it.
func (service *exportService) holdLateParts(job exportJob, candidates []archivetypes.Part, partitionHasPublished bool) []archivetypes.Part {
	now := time.Now()
	key := jobKey(job)
	for i := range candidates {
		candidates[i].FirstSeen = now
	}

	service.mu.Lock()
	candidates = archivetypes.InheritFirstSeen(service.firstSeen[key], candidates)
	service.firstSeen[key] = candidates
	service.mu.Unlock()

	hold := archivetypes.LateHold{MinRows: service.config.Logs.LateMinRows, MaxHold: service.config.Logs.LateMaxHold}
	if !hold.Ready(candidates, partitionHasPublished, now) {
		return nil
	}
	return candidates
}

// writeIndex writes the table's active objects under the key of the commit they reflect.
// Of two writers, the one at the later epoch or sequence has the higher key; a key written
// again holds the same snapshot, so it may be overwritten.
func (service *exportService) writeIndex(ctx context.Context, conn clickhouse.Conn, lease *archivetypes.Lease, table archivetypes.Table) {
	err := func() error {
		snapshot, err := service.store.IndexSnapshot(ctx, table.Name)
		if err != nil {
			return err
		}
		encoded, err := json.Marshal(archivetypes.NewIndex(table.Name, lease.Epoch, snapshot))
		if err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't encode the archive index of %s", table.Name)
		}

		statement := archivetypes.WriteBlobStatement(service.config.Logs.NamedCollection, archivetypes.IndexKey(service.config.Logs.Prefix, table.Name, lease.Epoch, snapshot.Sequence), encoded)
		settings := service.querySettings()
		settings["s3_truncate_on_insert"] = 1
		return conn.Exec(withQuerySettings(ctx, settings, queryID(fmt.Sprintf("%d-%d", lease.Epoch, snapshot.Sequence), "index")), statement)
	}()

	service.mu.Lock()
	defer service.mu.Unlock()
	service.staleIndexes[table.Name] = err != nil
	if err != nil {
		service.settings.Logger().WarnContext(ctx, "archive index not written, retrying next cycle", slog.String("table", table.Name), errors.Attr(err))
	}
}

func (service *exportService) retryIndex(ctx context.Context, conn clickhouse.Conn, lease *archivetypes.Lease, table archivetypes.Table) {
	service.mu.Lock()
	stale := service.staleIndexes[table.Name]
	service.mu.Unlock()

	if stale {
		service.writeIndex(ctx, conn, lease, table)
	}
}

func (service *exportService) querySettings() clickhouse.Settings {
	limits := service.config.Limits
	return querySettings(limits.MaxMemoryUsage, limits.MaxThreads, limits.RowGroupRows)
}
