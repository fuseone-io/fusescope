package archivetypes

import (
	"math"
	"slices"
	"sort"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeOverlappingParts = errors.MustNewCode("archive_overlapping_parts")

// BlockRange is the inclusive block-number range of a part, from system.parts.
type BlockRange struct {
	Min int64
	Max int64
}

// BlockRanges is a union of block ranges, sorted and with overlapping or adjacent ranges merged.
type BlockRanges []BlockRange

// Part is a part of one partition on one shard. DataVersion is system.parts.data_version:
// the part's min block until a mutation, ours included, rewrites it.
type Part struct {
	Name        string
	Range       BlockRange
	DataVersion int64
	Rows        uint64
	FirstSeen   time.Time
}

// LateHold delays exporting parts that land in a partition already archived, so ClickHouse
// merges them first.
type LateHold struct {
	MinRows uint64
	MaxHold time.Duration
}

func (r BlockRange) Valid() bool {
	return r.Min <= r.Max
}

func (r BlockRange) Contains(other BlockRange) bool {
	return r.Valid() && other.Valid() && r.Min <= other.Min && other.Max <= r.Max
}

func NewBlockRanges(ranges ...BlockRange) BlockRanges {
	sorted := slices.DeleteFunc(slices.Clone(ranges), func(r BlockRange) bool { return !r.Valid() })
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Min < sorted[j].Min })

	union := make(BlockRanges, 0, len(sorted))
	for _, r := range sorted {
		if last := len(union) - 1; last >= 0 && (union[last].Max == math.MaxInt64 || r.Min <= union[last].Max+1) {
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

func SelectForExport(snapshot []Part, published []Part) []Part {
	return filterParts(snapshot, func(part Part) bool { return !Archived(part, published) })
}

// SelectForDrop returns the parts whose rows are all in published archive segments.
func SelectForDrop(active []Part, published []Part) []Part {
	return filterParts(active, func(part Part) bool { return Archived(part, published) })
}

// Archived reports whether part's rows are all in published parts: those at its data
// version or newer must cover its range. A merge of published parts keeps the lowest
// version and passes; a mutation after publication raises it and forces a re-export.
func Archived(part Part, published []Part) bool {
	current := filterParts(published, func(p Part) bool { return p.DataVersion >= part.DataVersion })
	return RangesOf(current).Covers(part.Range)
}

// Superseded returns the published parts whose range a newly published part contains. Of
// equal ranges, only the same or a later data version supersedes, so a late copy of a part
// doesn't bring back rows a mutation deleted. Data versions of different ranges don't
// compare: an unmutated part's is its first block.
func Superseded(published []Part, newlyPublished []Part) []Part {
	return filterParts(published, func(part Part) bool {
		return slices.ContainsFunc(newlyPublished, func(newer Part) bool {
			return newer.Name != part.Name && newer.Range.Contains(part.Range) && (newer.Range != part.Range || newer.DataVersion >= part.DataVersion)
		})
	})
}

// Maximal returns the parts not contained in another part's range. Of parts with equal
// ranges, the highest data version wins. Kept parts that partially overlap are an error:
// restoring both would duplicate rows.
func Maximal(parts []Part) ([]Part, error) {
	var maximal []Part
	for i, part := range parts {
		contained := false
		for j, other := range parts {
			if i == j || !other.Range.Contains(part.Range) {
				continue
			}
			if other.Range != part.Range || other.DataVersion > part.DataVersion || (other.DataVersion == part.DataVersion && j > i) {
				contained = true
				break
			}
		}
		if !contained {
			maximal = append(maximal, part)
		}
	}

	for i, part := range maximal {
		for _, other := range maximal[i+1:] {
			if part.Range.Min <= other.Range.Max && other.Range.Min <= part.Range.Max {
				return nil, errors.Newf(errors.TypeInternal, ErrCodeOverlappingParts, "published parts %s and %s overlap", part.Name, other.Name)
			}
		}
	}

	return maximal, nil
}

// Lost returns the parts of the previous inventory that disappeared without being
// archived or merged into a current part.
func Lost(previous []Part, current []Part, archived BlockRanges) []Part {
	currentRanges := RangesOf(current)
	return filterParts(previous, func(part Part) bool {
		return !archived.Covers(part.Range) && !currentRanges.Covers(part.Range)
	})
}

// InheritFirstSeen gives each current part the earliest FirstSeen of the previous parts its
// range contains, so merging held parts doesn't restart their hold.
func InheritFirstSeen(previous []Part, current []Part) []Part {
	inherited := slices.Clone(current)
	for i := range inherited {
		for _, part := range previous {
			if inherited[i].Range.Contains(part.Range) && part.FirstSeen.Before(inherited[i].FirstSeen) {
				inherited[i].FirstSeen = part.FirstSeen
			}
		}
	}
	return inherited
}

// Ready reports whether candidates should be exported this cycle. The first export of a
// partition is never held; later ones wait for MinRows, or MaxHold since the earliest
// candidate was first seen.
func (hold LateHold) Ready(candidates []Part, partitionHasPublished bool, now time.Time) bool {
	if len(candidates) == 0 {
		return false
	}
	if !partitionHasPublished {
		return true
	}

	var rows uint64
	firstSeen := now
	for _, part := range candidates {
		rows += part.Rows
		if part.FirstSeen.Before(firstSeen) {
			firstSeen = part.FirstSeen
		}
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
