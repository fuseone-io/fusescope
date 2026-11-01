package archivetypes

import (
	"fmt"
	"sort"
	"time"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

const (
	CycleStatusRunning = "running"
	CycleStatusDone    = "done"
	CycleStatusFailed  = "failed"

	LossKindLost = "lost"

	UnarchivedLevelNone     UnarchivedLevel = ""
	UnarchivedLevelWarning  UnarchivedLevel = "warning"
	UnarchivedLevelCritical UnarchivedLevel = "critical"

	unarchivedWarningAfter = 24 * time.Hour
)

// UnarchivedLevel grades how long a partition past retention has waited to be archived
// (ADR 0002 §6): a warning after a day, critical at half the backstop.
type UnarchivedLevel string

// Cycle is one run of a signal's archive job. Gaps between cycles are the job's downtime,
// during which parts can come and go unseen.
type Cycle struct {
	bun.BaseModel `bun:"table:archive_cycle,alias:archive_cycle"`

	types.Identifiable
	types.TimeAuditable
	Signal     string     `bun:"signal"`
	Epoch      int64      `bun:"epoch"`
	Status     string     `bun:"status"`
	StartedAt  time.Time  `bun:"started_at"`
	FinishedAt *time.Time `bun:"finished_at"`
}

// InventoryPart is a part a cycle saw on a shard, in a partition past retention.
// FirstSeenAt is the earliest time any part it was merged from was seen.
type InventoryPart struct {
	bun.BaseModel `bun:"table:archive_inventory,alias:archive_inventory"`

	types.Identifiable
	types.TimeAuditable
	TableName   string      `bun:"table_name"`
	Shard       int         `bun:"shard"`
	ShardID     valuer.UUID `bun:"shard_id"`
	PartitionID string      `bun:"partition_id"`
	PartName    string      `bun:"part_name"`
	MinBlock    int64       `bun:"min_block"`
	MaxBlock    int64       `bun:"max_block"`
	DataVersion int64       `bun:"data_version"`
	Rows        int64       `bun:"rows"`
	CycleID     valuer.UUID `bun:"cycle_id"`
	FirstSeenAt time.Time   `bun:"first_seen_at"`
	LastSeenAt  time.Time   `bun:"last_seen_at"`
}

// LostPart is an inventoried part that disappeared without being archived.
type LostPart struct {
	bun.BaseModel `bun:"table:archive_loss,alias:archive_loss"`

	types.Identifiable
	types.TimeAuditable
	TableName   string      `bun:"table_name"`
	Shard       int         `bun:"shard"`
	ShardID     valuer.UUID `bun:"shard_id"`
	PartitionID string      `bun:"partition_id"`
	PartName    string      `bun:"part_name"`
	MinBlock    int64       `bun:"min_block"`
	MaxBlock    int64       `bun:"max_block"`
	DataVersion int64       `bun:"data_version"`
	Rows        int64       `bun:"rows"`
	Kind        string      `bun:"kind"`
	DetectedAt  time.Time   `bun:"detected_at"`
}

// Inventory replaces what is known of one partition under a shard pin: its current parts,
// and the parts found lost since the previous inventory.
type Inventory struct {
	Shard       *Shard
	PartitionID string
	Parts       []*InventoryPart
	Lost        []*LostPart
}

func NewCycle(lease *Lease) *Cycle {
	now := time.Now()
	return &Cycle{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		Signal:        lease.Signal,
		Epoch:         lease.Epoch,
		Status:        CycleStatusRunning,
		StartedAt:     now,
	}
}

// NewInventory records current as the partition's parts under shard, each first seen at the
// earliest time of the previous parts its range contains, and the previous parts that are
// neither archived nor contained in a current part as lost.
func NewInventory(cycle *Cycle, shard *Shard, partitionID string, previous []Part, current []Part, archived BlockRanges) *Inventory {
	now := time.Now()
	inventory := &Inventory{Shard: shard, PartitionID: partitionID}
	for _, part := range InheritFirstSeen(previous, current) {
		inventory.Parts = append(inventory.Parts, &InventoryPart{
			Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
			TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
			TableName:     shard.TableName,
			Shard:         shard.Shard,
			ShardID:       shard.ID,
			PartitionID:   partitionID,
			PartName:      part.Name,
			MinBlock:      part.Range.Min,
			MaxBlock:      part.Range.Max,
			DataVersion:   part.DataVersion,
			Rows:          int64(part.Rows),
			CycleID:       cycle.ID,
			FirstSeenAt:   part.FirstSeen,
			LastSeenAt:    now,
		})
	}
	for _, part := range Lost(previous, current, archived) {
		inventory.Lost = append(inventory.Lost, &LostPart{
			Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
			TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
			TableName:     shard.TableName,
			Shard:         shard.Shard,
			ShardID:       shard.ID,
			PartitionID:   partitionID,
			PartName:      part.Name,
			MinBlock:      part.Range.Min,
			MaxBlock:      part.Range.Max,
			DataVersion:   part.DataVersion,
			Rows:          int64(part.Rows),
			Kind:          LossKindLost,
			DetectedAt:    now,
		})
	}

	return inventory
}

func (part *InventoryPart) Part() Part {
	return Part{Name: part.PartName, Range: BlockRange{Min: part.MinBlock, Max: part.MaxBlock}, DataVersion: part.DataVersion, Rows: uint64(part.Rows), FirstSeen: part.FirstSeenAt}
}

// InventoryByPartition groups inventoried parts by partition ID.
func InventoryByPartition(inventoried []*InventoryPart) map[string][]Part {
	byPartition := make(map[string][]Part)
	for _, part := range inventoried {
		byPartition[part.PartitionID] = append(byPartition[part.PartitionID], part.Part())
	}
	return byPartition
}

// UnionByName returns the parts any replica holds, once per name, ordered by range.
func UnionByName(partsByReplica map[string][]Part) []Part {
	seen := make(map[string]bool)
	var union []Part
	for _, parts := range partsByReplica {
		for _, part := range parts {
			if !seen[part.Name] {
				seen[part.Name] = true
				union = append(union, part)
			}
		}
	}
	sort.Slice(union, func(i, j int) bool {
		if union[i].Range.Min != union[j].Range.Min {
			return union[i].Range.Min < union[j].Range.Min
		}
		return union[i].Name < union[j].Name
	})
	return union
}

// Unarchived grades a partition whose unarchived parts are candidates. Its wait starts when it
// passed retention; for late parts in a partition with published parts, only once they have
// been held for hold.MaxHold.
func Unarchived(partition Partition, candidates []Part, partitionHasPublished bool, hold LateHold, backstopDays int, now time.Time) UnarchivedLevel {
	if len(candidates) == 0 {
		return UnarchivedLevelNone
	}

	since := partition.Day.AddDate(0, 0, partition.RetentionDays+1)
	if partitionHasPublished {
		firstSeen := candidates[0].FirstSeen
		for _, part := range candidates[1:] {
			if part.FirstSeen.Before(firstSeen) {
				firstSeen = part.FirstSeen
			}
		}
		if released := firstSeen.Add(hold.MaxHold); released.After(since) {
			since = released
		}
	}

	waited := now.Sub(since)
	switch {
	case waited >= time.Duration(backstopDays)*12*time.Hour:
		return UnarchivedLevelCritical
	case waited >= unarchivedWarningAfter:
		return UnarchivedLevelWarning
	default:
		return UnarchivedLevelNone
	}
}

// DropPartStatement drops one part by name. Partition-level drops and moves remove a
// partition's whole block range, unfetched parts included (ADR 0002, E4), so the archive
// never issues them.
func DropPartStatement(table Table, part string) string {
	return fmt.Sprintf("ALTER TABLE %s.%s DROP PART %s", clickhousesql.Identifier(table.Database), clickhousesql.Identifier(table.Name), clickhousesql.StringLiteral(part))
}
