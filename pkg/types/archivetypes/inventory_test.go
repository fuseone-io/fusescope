package archivetypes

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewInventory(t *testing.T) {
	shard := &Shard{TableName: "logs_v2", Shard: 2, ReplicaPath: "/clickhouse/tables/u/02"}
	shard.ID = valuer.GenerateUUID()
	cycle := &Cycle{}
	cycle.ID = valuer.GenerateUUID()
	early := time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC)
	late := early.Add(6 * time.Hour)

	previous := []Part{
		{Name: "a_1_2_1", Range: BlockRange{Min: 1, Max: 2}, Rows: 5, FirstSeen: early},
		{Name: "a_3_3_0", Range: BlockRange{Min: 3, Max: 3}, Rows: 1, FirstSeen: late},
		{Name: "a_4_4_0", Range: BlockRange{Min: 4, Max: 4}, Rows: 2, FirstSeen: late},
		{Name: "a_5_5_0", Range: BlockRange{Min: 5, Max: 5}, Rows: 7, FirstSeen: late},
	}
	current := []Part{{Name: "a_3_6_1", Range: BlockRange{Min: 3, Max: 6}, Rows: 9, FirstSeen: late.Add(time.Hour)}}
	archived := NewBlockRanges(BlockRange{Min: 1, Max: 2})

	inventory := NewInventory(cycle, shard, "a", previous, current, archived)

	require.Len(t, inventory.Parts, 1)
	assert.Equal(t, late, inventory.Parts[0].FirstSeenAt, "a merge keeps the earliest first sight of its sources")
	assert.Equal(t, shard.ID, inventory.Parts[0].ShardID)
	assert.Equal(t, cycle.ID, inventory.Parts[0].CycleID)
	assert.Empty(t, inventory.Lost, "archived parts and parts merged into a current one are not lost")

	gone := NewInventory(cycle, shard, "a", previous, nil, archived)
	assert.Empty(t, gone.Parts)
	lost := make([]string, 0, len(gone.Lost))
	var rows int64
	for _, part := range gone.Lost {
		lost = append(lost, part.PartName)
		rows += part.Rows
		assert.Equal(t, LossKindLost, part.Kind)
	}
	assert.Equal(t, []string{"a_3_3_0", "a_4_4_0", "a_5_5_0"}, lost, "a partition gone before it was archived loses its unarchived parts")
	assert.Equal(t, int64(10), rows)
}

func TestUnionByName(t *testing.T) {
	merged := Part{Name: "a_1_5_1", Range: BlockRange{Min: 1, Max: 5}}
	first := Part{Name: "a_1_3_0", Range: BlockRange{Min: 1, Max: 3}}
	second := Part{Name: "a_4_5_0", Range: BlockRange{Min: 4, Max: 5}}

	union := UnionByName(map[string][]Part{"ch-1": {merged}, "ch-2": {first, second}, "ch-3": {merged, second}})

	names := make([]string, len(union))
	for i, part := range union {
		names[i] = part.Name
	}
	assert.Equal(t, []string{"a_1_3_0", "a_1_5_1", "a_4_5_0"}, names)
}

func TestUnarchived(t *testing.T) {
	partition := Partition{ID: "a", Day: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), RetentionDays: 15}
	pastRetention := time.Date(2026, 9, 17, 0, 0, 0, 0, time.UTC)
	hold := LateHold{MinRows: 100, MaxHold: 12 * time.Hour}
	part := func(firstSeen time.Time) []Part { return []Part{{Name: "a_1_1_0", Rows: 1, FirstSeen: firstSeen}} }

	testCases := []struct {
		name       string
		candidates []Part
		published  bool
		now        time.Time
		want       UnarchivedLevel
	}{
		{name: "NothingToArchive_None", now: pastRetention.Add(10 * 24 * time.Hour), want: UnarchivedLevelNone},
		{name: "FirstExport_UnderADay_None", candidates: part(pastRetention), now: pastRetention.Add(23 * time.Hour), want: UnarchivedLevelNone},
		{name: "FirstExport_ADay_Warning", candidates: part(pastRetention), now: pastRetention.Add(24 * time.Hour), want: UnarchivedLevelWarning},
		{name: "FirstExport_HalfTheBackstop_Critical", candidates: part(pastRetention), now: pastRetention.Add(84 * time.Hour), want: UnarchivedLevelCritical},
		{name: "LatePart_CountsAfterTheHold", candidates: part(pastRetention.Add(48 * time.Hour)), published: true, now: pastRetention.Add(48*time.Hour + 35*time.Hour), want: UnarchivedLevelNone},
		{name: "LatePart_ADayAfterTheHold_Warning", candidates: part(pastRetention.Add(48 * time.Hour)), published: true, now: pastRetention.Add(48*time.Hour + 36*time.Hour), want: UnarchivedLevelWarning},
		{name: "LatePartSeenBeforeRetention_CountsFromRetention", candidates: part(pastRetention.Add(-48 * time.Hour)), published: true, now: pastRetention.Add(24 * time.Hour), want: UnarchivedLevelWarning},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, Unarchived(partition, testCase.candidates, testCase.published, hold, 7, testCase.now))
		})
	}
}

func TestDropPartStatement(t *testing.T) {
	statement := DropPartStatement(Table{Database: "signoz_logs", Name: "logs`v2"}, "a'_1_$0_1")

	assert.Equal(t, "ALTER TABLE `signoz_logs`.`logs\\`v2` DROP PART 'a\\'_1_\\x240_1'", statement)
}
