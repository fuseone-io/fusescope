package implarchive

import (
	"context"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

// cycleRun is the lease and record of the cycle in progress.
type cycleRun struct {
	lease *archivetypes.Lease
	cycle *archivetypes.Cycle
	tally map[string]map[archivetypes.UnarchivedLevel]int64
}

func newCycleRun(lease *archivetypes.Lease, cycle *archivetypes.Cycle) *cycleRun {
	return &cycleRun{lease: lease, cycle: cycle, tally: make(map[string]map[archivetypes.UnarchivedLevel]int64)}
}

// takeInventory gives the parts of the shard's jobs the first sight the previous inventory
// recorded, grades how long each partition has waited to be archived, and, when every replica
// of the shard answered, records the new inventory with the parts lost since the last one
// (ADR 0002 §6). With a replica missing, the parts only it holds would read as lost.
func (service *exportService) takeInventory(ctx context.Context, run *cycleRun, shard shardSnapshot, jobs []exportJob) {
	inventoried, err := service.store.ListInventory(ctx, shard.pin)
	if err != nil {
		service.settings.Logger().WarnContext(ctx, "archive inventory not read, skipped this cycle", slog.String("table", shard.pin.TableName), slog.Int("shard", shard.shard), errors.Attr(err))
		return
	}
	previous := archivetypes.InventoryByPartition(inventoried)

	now := time.Now()
	for i := range jobs {
		for addr, parts := range jobs[i].snapshot {
			jobs[i].snapshot[addr] = archivetypes.InheritFirstSeen(previous[jobs[i].partition.ID], parts)
		}
		service.inventoryPartition(ctx, run, shard, jobs[i].partition, previous[jobs[i].partition.ID], archivetypes.UnionByName(jobs[i].snapshot), now)
	}

	if !shard.complete {
		return
	}
	for id, parts := range previous {
		if _, present := shard.partitionIDs[id]; !present {
			service.inventoryPartition(ctx, run, shard, archivetypes.Partition{ID: id}, parts, nil, now)
		}
	}
}

// inventoryPartition handles one partition past retention, or one gone from the shard when
// current is empty.
func (service *exportService) inventoryPartition(ctx context.Context, run *cycleRun, shard shardSnapshot, partition archivetypes.Partition, previous []archivetypes.Part, current []archivetypes.Part, now time.Time) {
	table := shard.pin.TableName
	err := func() error {
		published, err := service.store.ListPublishedParts(ctx, shard.pin, partition.ID)
		if err != nil {
			return err
		}
		archived := archivetypes.PartsOf(published)

		if len(current) > 0 {
			hold := archivetypes.LateHold{MinRows: service.config.Logs.LateMinRows, MaxHold: service.config.Logs.LateMaxHold}
			level := archivetypes.Unarchived(partition, archivetypes.SelectForExport(current, archived), len(published) > 0, hold, service.config.Logs.BackstopDays, now)
			run.count(table, level)
			if level == archivetypes.UnarchivedLevelCritical {
				service.settings.Logger().WarnContext(ctx, "a partition past retention has waited half the backstop to be archived", slog.String("table", table), slog.Int("shard", shard.shard), slog.String("partition_id", partition.ID))
			}
		}
		if !shard.complete {
			return nil
		}

		inventory := archivetypes.NewInventory(run.cycle, shard.pin, partition.ID, previous, current, archivetypes.RangesOf(archived))
		if err := service.store.RecordInventory(ctx, run.lease, inventory); err != nil {
			return err
		}
		for _, part := range inventory.Lost {
			service.settings.Logger().ErrorContext(ctx, "an archive part disappeared before it was archived", slog.String("table", table), slog.Int("shard", shard.shard), slog.String("partition_id", partition.ID), slog.String("part", part.PartName), slog.Int64("rows", part.Rows))
		}
		if len(inventory.Lost) > 0 {
			service.metrics.recordLost(ctx, table, inventory.Lost)
		}
		return nil
	}()
	if err != nil {
		service.settings.Logger().WarnContext(ctx, "archive inventory of a partition not recorded", slog.String("table", table), slog.Int("shard", shard.shard), slog.String("partition_id", partition.ID), errors.Attr(err))
	}
}

func (run *cycleRun) count(table string, level archivetypes.UnarchivedLevel) {
	if run.tally[table] == nil {
		run.tally[table] = make(map[archivetypes.UnarchivedLevel]int64)
	}
	run.tally[table][level]++
}
