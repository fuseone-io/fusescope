package archivetypes

import (
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBlockRangesCovers(t *testing.T) {
	testCases := []struct {
		name      string
		published []BlockRange
		target    BlockRange
		want      bool
	}{
		{name: "Empty_NotCovered", published: nil, target: BlockRange{Min: 0, Max: 0}, want: false},
		{name: "SameRange_Covered", published: []BlockRange{{Min: 3, Max: 5}}, target: BlockRange{Min: 3, Max: 5}, want: true},
		{name: "Inside_Covered", published: []BlockRange{{Min: 0, Max: 9}}, target: BlockRange{Min: 2, Max: 4}, want: true},
		{name: "AdjacentRanges_MergedCovered", published: []BlockRange{{Min: 4, Max: 5}, {Min: 1, Max: 3}}, target: BlockRange{Min: 1, Max: 5}, want: true},
		{name: "Gap_NotCovered", published: []BlockRange{{Min: 1, Max: 3}, {Min: 5, Max: 5}}, target: BlockRange{Min: 1, Max: 5}, want: false},
		{name: "OverlappingRanges_Covered", published: []BlockRange{{Min: 0, Max: 4}, {Min: 2, Max: 8}}, target: BlockRange{Min: 1, Max: 7}, want: true},
		{name: "ExtendsPastEnd_NotCovered", published: []BlockRange{{Min: 0, Max: 4}}, target: BlockRange{Min: 3, Max: 5}, want: false},
		{name: "InvertedTarget_NotCovered", published: []BlockRange{{Min: 0, Max: 9}}, target: BlockRange{Min: 5, Max: 2}, want: false},
		{name: "InvertedPublished_Ignored", published: []BlockRange{{Min: 9, Max: 0}}, target: BlockRange{Min: 2, Max: 5}, want: false},
		{name: "MaxInt64_NoOverflow", published: []BlockRange{{Min: math.MaxInt64 - 1, Max: math.MaxInt64}, {Min: 0, Max: 1}}, target: BlockRange{Min: 0, Max: 2}, want: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, NewBlockRanges(testCase.published...).Covers(testCase.target))
		})
	}
}

func TestChooseReplica(t *testing.T) {
	testCases := []struct {
		name   string
		parts  map[string][]Part
		want   string
		wantOK bool
	}{
		{
			name: "AllReplicasEqual_FirstByName",
			parts: map[string][]Part{
				"b": {{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}},
				"a": {{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}},
			},
			want:   "a",
			wantOK: true,
		},
		{
			name: "LaggingReplica_Skipped",
			parts: map[string][]Part{
				"a": {{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}},
				"b": {{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}, {Name: "p_1_1_0", Range: BlockRange{Min: 1, Max: 1}}},
			},
			want:   "b",
			wantOK: true,
		},
		{
			name: "DifferentlyNamedParts_CoverageByRange",
			parts: map[string][]Part{
				"a": {{Name: "p_1_5_1", Range: BlockRange{Min: 1, Max: 5}}},
				"b": {{Name: "p_1_3_0", Range: BlockRange{Min: 1, Max: 3}}, {Name: "p_4_5_0", Range: BlockRange{Min: 4, Max: 5}}},
			},
			want:   "a",
			wantOK: true,
		},
		{
			name: "EachReplicaMissesOne_NoneCovers",
			parts: map[string][]Part{
				"a": {{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}},
				"b": {{Name: "p_1_1_0", Range: BlockRange{Min: 1, Max: 1}}},
			},
			wantOK: false,
		},
		{
			name:   "NoReplicas_NoneCovers",
			parts:  map[string][]Part{},
			wantOK: false,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			replica, ok := ChooseReplica(testCase.parts)
			assert.Equal(t, testCase.wantOK, ok)
			assert.Equal(t, testCase.want, replica)
		})
	}
}

func TestSelectForExportAndDrop(t *testing.T) {
	testCases := []struct {
		name       string
		snapshot   []Part
		published  []Part
		wantExport []string
		wantDrop   []string
	}{
		{
			name:       "NothingPublished_AllExported",
			snapshot:   []Part{{Name: "p_0_2_1", Range: BlockRange{Min: 0, Max: 2}}},
			wantExport: []string{"p_0_2_1"},
		},
		{
			name:       "LateInsertAfterCommit_ExportedNotDropped",
			snapshot:   []Part{{Name: "p_0_2_1", Range: BlockRange{Min: 0, Max: 2}}, {Name: "p_3_3_0", Range: BlockRange{Min: 3, Max: 3}, DataVersion: 3}},
			published:  []Part{{Name: "p_0_2_1", Range: BlockRange{Min: 0, Max: 2}}},
			wantExport: []string{"p_3_3_0"},
			wantDrop:   []string{"p_0_2_1"},
		},
		{
			name:       "MergeWithUnexportedPart_ExportedWhole",
			snapshot:   []Part{{Name: "p_0_3_2", Range: BlockRange{Min: 0, Max: 3}}},
			published:  []Part{{Name: "p_0_2_1", Range: BlockRange{Min: 0, Max: 2}}},
			wantExport: []string{"p_0_3_2"},
		},
		{
			name:      "MergeOfPublishedPartsOnly_Dropped",
			snapshot:  []Part{{Name: "p_0_3_2", Range: BlockRange{Min: 0, Max: 3}}},
			published: []Part{{Name: "p_0_2_1", Range: BlockRange{Min: 0, Max: 2}}, {Name: "p_3_3_0", Range: BlockRange{Min: 3, Max: 3}, DataVersion: 3}},
			wantDrop:  []string{"p_0_3_2"},
		},
		{
			name:       "LowerBlockAppearsAfterHigherPublished_Exported",
			snapshot:   []Part{{Name: "p_4_4_0", Range: BlockRange{Min: 4, Max: 4}, DataVersion: 4}, {Name: "p_5_5_0", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 5}},
			published:  []Part{{Name: "p_5_5_0", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 5}},
			wantExport: []string{"p_4_4_0"},
			wantDrop:   []string{"p_5_5_0"},
		},
		{
			name:       "MergeAcrossTableWideBlockGap_ExportedAgain",
			snapshot:   []Part{{Name: "p_1_3_1", Range: BlockRange{Min: 1, Max: 3}, DataVersion: 1}},
			published:  []Part{{Name: "p_1_1_0", Range: BlockRange{Min: 1, Max: 1}, DataVersion: 1}, {Name: "p_3_3_0", Range: BlockRange{Min: 3, Max: 3}, DataVersion: 3}},
			wantExport: []string{"p_1_3_1"},
		},
		{
			name:       "MutatedAfterPublication_ExportedNotDropped",
			snapshot:   []Part{{Name: "p_5_5_0_9", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 9}},
			published:  []Part{{Name: "p_5_5_0", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 5}},
			wantExport: []string{"p_5_5_0_9"},
		},
		{
			name:      "MutatedPartPublished_Dropped",
			snapshot:  []Part{{Name: "p_5_5_0_9", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 9}},
			published: []Part{{Name: "p_5_5_0", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 5}, {Name: "p_5_5_0_9", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 9}},
			wantDrop:  []string{"p_5_5_0_9"},
		},
		{
			name:       "MergeOfMutatedAndStalePublished_Exported",
			snapshot:   []Part{{Name: "p_1_2_1_9", Range: BlockRange{Min: 1, Max: 2}, DataVersion: 9}},
			published:  []Part{{Name: "p_1_1_0", Range: BlockRange{Min: 1, Max: 1}, DataVersion: 1}, {Name: "p_2_2_0_9", Range: BlockRange{Min: 2, Max: 2}, DataVersion: 9}},
			wantExport: []string{"p_1_2_1_9"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.wantExport, partNames(SelectForExport(testCase.snapshot, testCase.published)))
			assert.Equal(t, testCase.wantDrop, partNames(SelectForDrop(testCase.snapshot, testCase.published)))
		})
	}
}

func TestSuperseded(t *testing.T) {
	published := []Part{
		{Name: "p_0_2_1", Range: BlockRange{Min: 0, Max: 2}},
		{Name: "p_5_5_0", Range: BlockRange{Min: 5, Max: 5}},
		{Name: "p_7_7_0", Range: BlockRange{Min: 7, Max: 7}},
	}
	newlyPublished := []Part{
		{Name: "p_0_3_2", Range: BlockRange{Min: 0, Max: 3}},
		{Name: "p_5_5_0_9", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 9},
	}

	assert.Equal(t, []string{"p_0_2_1", "p_5_5_0"}, partNames(Superseded(published, newlyPublished)))
}

func TestMaximal(t *testing.T) {
	t.Run("ContainedAndOlderVersions_Removed", func(t *testing.T) {
		maximal, err := Maximal([]Part{
			{Name: "p_5_5_0_9", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 9},
			{Name: "p_0_2_1", Range: BlockRange{Min: 0, Max: 2}},
			{Name: "p_0_3_2", Range: BlockRange{Min: 0, Max: 3}},
			{Name: "p_5_5_0", Range: BlockRange{Min: 5, Max: 5}, DataVersion: 5},
		})
		require.NoError(t, err)
		assert.Equal(t, []string{"p_5_5_0_9", "p_0_3_2"}, partNames(maximal))
	})

	t.Run("PartialOverlap_Error", func(t *testing.T) {
		_, err := Maximal([]Part{
			{Name: "p_0_3_1", Range: BlockRange{Min: 0, Max: 3}},
			{Name: "p_2_5_1", Range: BlockRange{Min: 2, Max: 5}, DataVersion: 2},
		})
		assert.Error(t, err)
	})
}

func TestLost(t *testing.T) {
	testCases := []struct {
		name     string
		previous []Part
		current  []Part
		archived []BlockRange
		want     []string
	}{
		{
			name:     "StillActive_NotLost",
			previous: []Part{{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}},
			current:  []Part{{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}},
		},
		{
			name:     "MergedIntoCurrentPart_NotLost",
			previous: []Part{{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}, {Name: "p_1_1_0", Range: BlockRange{Min: 1, Max: 1}}},
			current:  []Part{{Name: "p_0_1_1", Range: BlockRange{Min: 0, Max: 1}}},
		},
		{
			name:     "ArchivedThenDropped_NotLost",
			previous: []Part{{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}}},
			archived: []BlockRange{{Min: 0, Max: 0}},
		},
		{
			name:     "GoneUnarchived_Lost",
			previous: []Part{{Name: "p_0_0_0", Range: BlockRange{Min: 0, Max: 0}, Rows: 50}, {Name: "p_1_1_0", Range: BlockRange{Min: 1, Max: 1}}},
			archived: []BlockRange{{Min: 1, Max: 1}},
			want:     []string{"p_0_0_0"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, partNames(Lost(testCase.previous, testCase.current, NewBlockRanges(testCase.archived...))))
		})
	}
}

func TestLateHoldReady(t *testing.T) {
	now := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	hold := LateHold{MinRows: 100, MaxHold: 24 * time.Hour}

	testCases := []struct {
		name         string
		candidates   []Part
		hasPublished bool
		want         bool
	}{
		{name: "NoCandidates_NotReady", hasPublished: true, want: false},
		{name: "FirstExport_NeverHeld", candidates: []Part{{Rows: 1, FirstSeen: now}}, hasPublished: false, want: true},
		{name: "LateBelowRows_Held", candidates: []Part{{Rows: 60, FirstSeen: now.Add(-time.Hour)}, {Rows: 39, FirstSeen: now}}, hasPublished: true, want: false},
		{name: "LateReachesRows_Ready", candidates: []Part{{Rows: 60, FirstSeen: now}, {Rows: 40, FirstSeen: now}}, hasPublished: true, want: true},
		{name: "EarliestPartHeldTooLong_Ready", candidates: []Part{{Rows: 1, FirstSeen: now}, {Rows: 1, FirstSeen: now.Add(-24 * time.Hour)}}, hasPublished: true, want: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, hold.Ready(testCase.candidates, testCase.hasPublished, now))
		})
	}
}

func TestInheritFirstSeen(t *testing.T) {
	early := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	late := time.Date(2026, 10, 23, 0, 0, 0, 0, time.UTC)
	now := time.Date(2026, 10, 24, 0, 0, 0, 0, time.UTC)

	previous := []Part{
		{Name: "p_7_7_0", Range: BlockRange{Min: 7, Max: 7}, FirstSeen: early},
		{Name: "p_8_8_0", Range: BlockRange{Min: 8, Max: 8}, FirstSeen: late},
		{Name: "p_9_9_0", Range: BlockRange{Min: 9, Max: 9}, FirstSeen: late},
	}
	current := []Part{
		{Name: "p_7_8_1", Range: BlockRange{Min: 7, Max: 8}, FirstSeen: now},
		{Name: "p_9_9_0", Range: BlockRange{Min: 9, Max: 9}, FirstSeen: now},
		{Name: "p_10_10_0", Range: BlockRange{Min: 10, Max: 10}, FirstSeen: now},
	}

	inherited := InheritFirstSeen(previous, current)

	assert.Equal(t, []time.Time{early, late, now}, []time.Time{inherited[0].FirstSeen, inherited[1].FirstSeen, inherited[2].FirstSeen}, "a merge of held parts keeps the earliest first-seen, so a trickle can't restart the hold")
}

func partNames(parts []Part) []string {
	var names []string
	for _, part := range parts {
		names = append(names, part.Name)
	}
	return names
}
