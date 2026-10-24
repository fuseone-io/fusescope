package archivetypes

import (
	"slices"
	"sort"
	"time"
)

// BlockRange is the inclusive block-number range of a part, from system.parts.
type BlockRange struct {
	Min int64
	Max int64
}

// BlockRanges is a union of block ranges, sorted and with overlapping or adjacent ranges merged.
type BlockRanges []BlockRange

// Part is an active part of one partition on one shard.
type Part struct {
	Name  string
	Range BlockRange
	Rows  uint64
}

// LateHold delays exporting parts that land in a partition already archived, so ClickHouse
// merges them first.
type LateHold struct {
	MinRows uint64
	MaxHold time.Duration
}

func (r BlockRange) Contains(other BlockRange) bool {
	return r.Min <= other.Min && other.Max <= r.Max
}

func NewBlockRanges(ranges ...BlockRange) BlockRanges {
	sorted := slices.Clone(ranges)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Min < sorted[j].Min })

	union := make(BlockRanges, 0, len(sorted))
	for _, r := range sorted {
		if last := len(union) - 1; last >= 0 && r.Min <= union[last].Max+1 {
			union[last].Max = max(union[last].Max, r.Max)
			continue
		}
		union = append(union, r)
	}

	return union
}

// Covers reports whether every block number of target is in the union. Block numbers that
// were never committed leave gaps, so a part merged across a gap is not covered.
func (ranges BlockRanges) Covers(target BlockRange) bool {
	for _, r := range ranges {
		if r.Contains(target) {
			return true
		}
	}
	return false
}

func (ranges BlockRanges) CoversAll(other BlockRanges) bool {
	for _, r := range other {
		if !ranges.Covers(r) {
			return false
		}
	}
	return true
}

func RangesOf(parts []Part) BlockRanges {
	ranges := make([]BlockRange, len(parts))
	for i, part := range parts {
		ranges[i] = part.Range
	}
	return NewBlockRanges(ranges...)
}

// ChooseReplica returns the first replica, by name, whose parts cover the union of the
// ranges every replica reports. Coverage is by range, not by part name: one replica can
// hold a merged part while another still holds its sources.
func ChooseReplica(partsByReplica map[string][]Part) (string, bool) {
	var all []Part
	replicas := make([]string, 0, len(partsByReplica))
	for replica, parts := range partsByReplica {
		replicas = append(replicas, replica)
		all = append(all, parts...)
	}
	sort.Strings(replicas)

	union := RangesOf(all)
	for _, replica := range replicas {
		if RangesOf(partsByReplica[replica]).CoversAll(union) {
			return replica, true
		}
	}
	return "", false
}

func SelectForExport(snapshot []Part, published BlockRanges) []Part {
	return filterParts(snapshot, func(part Part) bool { return !published.Covers(part.Range) })
}

// SelectForDrop returns the parts whose rows are all in published archive segments.
func SelectForDrop(active []Part, published BlockRanges) []Part {
	return filterParts(active, func(part Part) bool { return published.Covers(part.Range) })
}

// Superseded returns the published parts whose range is contained in a newly published part.
func Superseded(published []Part, newlyPublished []Part) []Part {
	return filterParts(published, func(part Part) bool {
		return slices.ContainsFunc(newlyPublished, func(newer Part) bool {
			return newer.Name != part.Name && newer.Range.Contains(part.Range)
		})
	})
}

// Maximal returns the parts not contained in another part's range. Of parts with equal
// ranges, the last one wins; callers pass parts in publication order.
func Maximal(parts []Part) []Part {
	var maximal []Part
	for i, part := range parts {
		contained := false
		for j, other := range parts {
			if i == j || !other.Range.Contains(part.Range) {
				continue
			}
			if other.Range != part.Range || j > i {
				contained = true
				break
			}
		}
		if !contained {
			maximal = append(maximal, part)
		}
	}
	return maximal
}

// Lost returns the parts of the previous inventory that disappeared without being
// archived or merged into a current part.
func Lost(previous []Part, current []Part, archived BlockRanges) []Part {
	currentRanges := RangesOf(current)
	return filterParts(previous, func(part Part) bool {
		return !archived.Covers(part.Range) && !currentRanges.Covers(part.Range)
	})
}

// Ready reports whether candidates should be exported this cycle. The first export of a
// partition is never held; later ones wait for MinRows or MaxHold since firstSeen.
func (hold LateHold) Ready(candidates []Part, partitionHasPublished bool, firstSeen time.Time, now time.Time) bool {
	if len(candidates) == 0 {
		return false
	}
	if !partitionHasPublished {
		return true
	}

	var rows uint64
	for _, part := range candidates {
		rows += part.Rows
	}
	return rows >= hold.MinRows || now.Sub(firstSeen) >= hold.MaxHold
}

func filterParts(parts []Part, keep func(Part) bool) []Part {
	var kept []Part
	for _, part := range parts {
		if keep(part) {
			kept = append(kept, part)
		}
	}
	return kept
}
