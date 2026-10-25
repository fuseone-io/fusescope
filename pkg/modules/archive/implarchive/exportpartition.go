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
		abandonCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), abandonTimeout)
		defer cancel()
		if abandonErr := service.store.AbandonAttempt(abandonCtx, attempt.ID); abandonErr != nil {
			return errors.Join(err, abandonErr)
		}
		return err
	}

	service.mu.Lock()
	delete(service.firstSeen, jobKey(job))
	service.mu.Unlock()

	service.settings.Logger().InfoContext(ctx, "archive partition exported", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID), slog.Int("parts", len(candidates)), slog.String("attempt_id", attempt.ID.StringValue()))
	service.markIndexStale(job.table)
	return nil
}

// publish writes the parts, checks them back, writes the manifest and commits.
func (service *exportService) publish(ctx context.Context, lease *archivetypes.Lease, job exportJob, conn clickhouse.Conn, attempt *archivetypes.Attempt, parts []archivetypes.Part) error {
	collection := attempt.NamedCollection
	location := archivetypes.ObjectLocation{Prefix: attempt.Prefix, Table: job.table.Name, Day: job.partition.Day, Shard: job.shard, PartitionID: job.partition.ID, AttemptID: attempt.ID.StringValue()}
	for _, part := range parts {
		statement := archivetypes.ExportStatement(job.table, job.mappings, collection, job.shard, part.Name, location.ObjectKey(part.Name))
		if err := service.exec(ctx, queryID(location.AttemptID, "export"), func(ctx context.Context) error { return conn.Exec(ctx, statement) }); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't export part %s of %s", part.Name, job.table.Name)
		}
	}

	var stats []archivetypes.ObjectStat
	err := service.exec(ctx, queryID(location.AttemptID, "check"), func(ctx context.Context) error {
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
	if err := service.exec(ctx, queryID(location.AttemptID, "manifest"), func(ctx context.Context) error {
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
// written; a merge of held parts keeps the earliest time this backend saw, and after a restart
// the hold of a merged part counts from the merge.
func (service *exportService) holdLateParts(job exportJob, candidates []archivetypes.Part, partitionHasPublished bool) []archivetypes.Part {
	now := time.Now()
	key := jobKey(job)

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

		settings := service.querySettings()
		settings["s3_truncate_on_insert"] = 1
		ctx, cancel := withQuerySettings(ctx, settings, service.config.Limits.QueryTimeout, queryID(fmt.Sprintf("%d-%d", lease.Epoch, snapshot.Sequence), "index"))
		defer cancel()
		return writeBlob(ctx, conn, service.config.Logs.NamedCollection, archivetypes.IndexKey(service.config.Logs.Prefix, table.Name, lease.Epoch, snapshot.Sequence), encoded)
	}()

	service.mu.Lock()
	defer service.mu.Unlock()
	service.staleIndexes[table.Name] = err != nil
	if err != nil {
		service.settings.Logger().WarnContext(ctx, "archive index not written, retrying next cycle", slog.String("table", table.Name), errors.Attr(err))
	}
}

func (service *exportService) markIndexStale(table archivetypes.Table) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.staleIndexes[table.Name] = true
}

// writeStaleIndex writes the table's index once per cycle, when an export or an earlier write
// left it stale.
func (service *exportService) writeStaleIndex(ctx context.Context, conn clickhouse.Conn, lease *archivetypes.Lease, table archivetypes.Table) {
	service.mu.Lock()
	stale := service.staleIndexes[table.Name]
	service.mu.Unlock()

	if stale {
		service.writeIndex(ctx, conn, lease, table)
	}
}

// exec runs query with the archive limits, under the query timeout.
func (service *exportService) exec(ctx context.Context, id string, query func(ctx context.Context) error) error {
	ctx, cancel := withQuerySettings(ctx, service.querySettings(), service.config.Limits.QueryTimeout, id)
	defer cancel()
	return query(ctx)
}

func (service *exportService) querySettings() clickhouse.Settings {
	limits := service.config.Limits
	return querySettings(limits.MaxMemoryUsage, limits.MaxThreads, limits.RowGroupRows, limits.QueryTimeout)
}
