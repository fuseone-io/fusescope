package implarchive

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/uptrace/bun"
)

func (store *store) StartCycle(ctx context.Context, cycle *archivetypes.Cycle) error {
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(cycle).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record archive cycle %s", cycle.ID)
	}

	return nil
}

func (store *store) FinishCycle(ctx context.Context, cycle *archivetypes.Cycle, status string, finishedAt time.Time) error {
	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(new(archivetypes.Cycle)).
		Set("status = ?", status).
		Set("finished_at = ?", finishedAt).
		Set("updated_at = ?", finishedAt).
		Where("id = ?", cycle.ID).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't finish archive cycle %s", cycle.ID)
	}

	return nil
}

func (store *store) ListInventory(ctx context.Context, shard *archivetypes.Shard) ([]*archivetypes.InventoryPart, error) {
	parts := make([]*archivetypes.InventoryPart, 0)

	err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&parts).
		Where("shard_id = ?", shard.ID).
		Order("partition_id", "min_block").
		Scan(ctx)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the archive inventory of %s shard %d", shard.TableName, shard.Shard)
	}

	return parts, nil
}

func (store *store) RecordInventory(ctx context.Context, lease *archivetypes.Lease, inventory *archivetypes.Inventory) error {
	return store.sqlstore.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		db := store.sqlstore.BunDBCtx(ctx)
		if err := fence(ctx, db, lease, time.Now().UTC()); err != nil {
			return err
		}

		_, err := db.
			NewDelete().
			Model(new(archivetypes.InventoryPart)).
			Where("shard_id = ?", inventory.Shard.ID).
			Where("partition_id = ?", inventory.PartitionID).
			Exec(ctx)
		if err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't clear the archive inventory of %s partition %s", inventory.Shard.TableName, inventory.PartitionID)
		}

		if len(inventory.Parts) > 0 {
			if _, err := db.NewInsert().Model(&inventory.Parts).Exec(ctx); err != nil {
				return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record the archive inventory of %s partition %s", inventory.Shard.TableName, inventory.PartitionID)
			}
		}
		if len(inventory.Lost) > 0 {
			if _, err := db.NewInsert().Model(&inventory.Lost).Exec(ctx); err != nil {
				return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't record the lost parts of %s partition %s", inventory.Shard.TableName, inventory.PartitionID)
			}
		}

		return nil
	})
}

func (store *store) MarkPartsDropped(ctx context.Context, shard *archivetypes.Shard, partitionID string, dropped archivetypes.BlockRanges, droppedAt time.Time) error {
	if len(dropped) == 0 {
		return nil
	}

	_, err := store.
		sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(new(archivetypes.ArchivedPart)).
		Set("dropped_at = ?", droppedAt).
		Set("updated_at = ?", droppedAt).
		Where("shard_id = ?", shard.ID).
		Where("partition_id = ?", partitionID).
		Where("dropped_at IS NULL").
		WhereGroup(" AND ", func(query *bun.UpdateQuery) *bun.UpdateQuery {
			for _, blocks := range dropped {
				query = query.WhereOr("(min_block >= ? AND max_block <= ?)", blocks.Min, blocks.Max)
			}
			return query
		}).
		Exec(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't mark the dropped parts of %s partition %s on shard %d", shard.TableName, partitionID, shard.Shard)
	}

	return nil
}
