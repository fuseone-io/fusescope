package archivetypes

import (
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

const (
	RehydrationStatusPending = "pending"
	RehydrationStatusLoading = "loading"
	RehydrationStatusReady   = "ready"
	RehydrationStatusFailed  = "failed"

	// FailureCorrupt is an object or manifest that no longer matches its commit.
	FailureCorrupt = "corrupt"
	// FailureIncompatible is an object written by a format or schema the restore can't map.
	FailureIncompatible = "incompatible"
	// FailureIncomplete is a range that a table of the signal's set has no archive for.
	FailureIncomplete = "incomplete"
	FailureError      = "error"
)

var (
	ErrCodeRehydrationNotFound   = errors.MustNewCode("archive_rehydration_not_found")
	ErrCodeRehydrationCorrupt    = errors.MustNewCode("archive_rehydration_corrupt")
	ErrCodeRehydrationIncompat   = errors.MustNewCode("archive_rehydration_incompatible")
	ErrCodeRehydrationIncomplete = errors.MustNewCode("archive_rehydration_incomplete")
	ErrCodeInvalidRehydration    = errors.MustNewCode("archive_invalid_rehydration")
)

// Rehydration is a restoration of a signal's archived days [Start, End) into the
// rehydrated_* tables, under partition ID. DDL is the effective DDL it was loaded with.
type Rehydration struct {
	bun.BaseModel `bun:"table:archive_rehydration,alias:archive_rehydration"`

	types.Identifiable
	types.TimeAuditable
	Signal         string    `bun:"signal"`
	Start          time.Time `bun:"range_start"`
	End            time.Time `bun:"range_end"`
	Status         string    `bun:"status"`
	ExpiresAt      time.Time `bun:"expires_at"`
	CreatedBy      string    `bun:"created_by"`
	Bytes          int64     `bun:"bytes"`
	Rows           int64     `bun:"rows"`
	DDL            string    `bun:"ddl"`
	FailureReason  string    `bun:"failure_reason"`
	FailureMessage string    `bun:"failure_message"`
}

// RestorablePart is a published part with the object holding it and the attempt that
// committed both.
type RestorablePart struct {
	Part    *ArchivedPart
	Object  *Object
	Attempt *Attempt
}

func NewRehydration(signal string, day time.Time, ttl time.Duration, createdBy string) (*Rehydration, error) {
	start := day.UTC().Truncate(24 * time.Hour)
	if ttl <= 0 {
		return nil, errors.New(errors.TypeInvalidInput, ErrCodeInvalidRehydration, "a restoration needs a positive time to live")
	}

	now := time.Now().UTC()
	return &Rehydration{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		Signal:        signal,
		Start:         start,
		End:           start.Add(24 * time.Hour),
		Status:        RehydrationStatusPending,
		ExpiresAt:     now.Add(ttl),
		CreatedBy:     createdBy,
	}, nil
}

// Days returns the UTC days of the range, as the day= segment of object keys spells them.
func (rehydration *Rehydration) Days() []string {
	var days []string
	for day := rehydration.Start.UTC().Truncate(24 * time.Hour); day.Before(rehydration.End); day = day.Add(24 * time.Hour) {
		days = append(days, day.Format(time.DateOnly))
	}
	return days
}

// FailureReasonOf maps a restore error to the reason recorded with the failed restoration.
func FailureReasonOf(err error) string {
	switch {
	case errors.Asc(err, ErrCodeRehydrationCorrupt):
		return FailureCorrupt
	case errors.Asc(err, ErrCodeRehydrationIncompat):
		return FailureIncompatible
	case errors.Asc(err, ErrCodeRehydrationIncomplete):
		return FailureIncomplete
	}
	return FailureError
}

// InDay reports whether the part's object is under its attempt's day= directory for day.
// Keys follow ObjectLocation, and compaction keeps objects under the same directory.
func (part RestorablePart) InDay(day string) bool {
	return strings.HasPrefix(part.Object.ObjectKey, strings.TrimSuffix(part.Attempt.Prefix, "/")+"/"+part.Part.TableName+"/day="+day+"/")
}

// ColumnMappings decodes the attempt's column mapping, refusing format versions this
// release can't restore: the current one and the one before (ADR 0002 §8).
func (attempt *Attempt) ColumnMappings() ([]ColumnMapping, error) {
	if attempt.FormatVersion < FormatVersion-1 || attempt.FormatVersion > FormatVersion || attempt.FormatVersion < 1 {
		return nil, errors.Newf(errors.TypeUnsupported, ErrCodeRehydrationIncompat, "archive attempt %s has format version %d, this release restores %d and %d", attempt.ID, attempt.FormatVersion, FormatVersion-1, FormatVersion)
	}

	var mappings []ColumnMapping
	if err := json.Unmarshal([]byte(attempt.ColumnMapping), &mappings); err != nil || len(mappings) == 0 {
		return nil, errors.Newf(errors.TypeUnsupported, ErrCodeRehydrationIncompat, "archive attempt %s has no readable column mapping", attempt.ID)
	}
	return mappings, nil
}

// RestorePlan selects, per shard and partition of each table, the maximal published parts
// in block order. Every table of the set must have parts in the range.
func RestorePlan(tables []string, parts []RestorablePart) (map[string][]RestorablePart, error) {
	type partition struct {
		shard int
		id    string
	}

	plan := make(map[string][]RestorablePart, len(tables))
	for _, table := range tables {
		byPartition := map[partition][]RestorablePart{}
		for _, part := range parts {
			if part.Part.TableName == table {
				key := partition{shard: part.Part.Shard, id: part.Part.PartitionID}
				byPartition[key] = append(byPartition[key], part)
			}
		}
		if len(byPartition) == 0 {
			return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeRehydrationIncomplete, "%s has no archived parts in the range", table)
		}

		for _, candidates := range byPartition {
			maximal, err := Maximal(PartsOf(archivedParts(candidates)))
			if err != nil {
				return nil, errors.Wrapf(err, errors.TypeInternal, ErrCodeRehydrationCorrupt, "couldn't select the parts of %s to restore", table)
			}
			for _, part := range maximal {
				index := slices.IndexFunc(candidates, func(candidate RestorablePart) bool { return candidate.Part.PartName == part.Name })
				plan[table] = append(plan[table], candidates[index])
			}
		}

		sort.SliceStable(plan[table], func(i, j int) bool {
			a, b := plan[table][i].Part, plan[table][j].Part
			if a.Shard != b.Shard {
				return a.Shard < b.Shard
			}
			if a.PartitionID != b.PartitionID {
				return a.PartitionID < b.PartitionID
			}
			return a.MinBlock < b.MinBlock
		})
	}

	return plan, nil
}

// RestoreExpressions returns the columns of target an archived object fills, and the SELECT
// list casting each from its exported type back to its source type. Columns target
// computes are left to it; an archived column target lacks needs a restore adapter.
func RestoreExpressions(mappings []ColumnMapping, target []SchemaColumn) ([]string, []string, error) {
	columns := make([]string, 0, len(mappings))
	expressions := make([]string, 0, len(mappings))
	for _, mapping := range mappings {
		index := slices.IndexFunc(target, func(column SchemaColumn) bool { return column.Name == mapping.Name })
		if index < 0 {
			return nil, nil, errors.Newf(errors.TypeUnsupported, ErrCodeRehydrationIncompat, "archived column %s is not in the table", mapping.Name)
		}
		if !target[index].Insertable() {
			continue
		}

		column := clickhousesql.Identifier(mapping.Name)
		columns = append(columns, column)
		if mapping.ExportType == mapping.SourceType {
			expressions = append(expressions, column)
		} else {
			expressions = append(expressions, fmt.Sprintf("CAST(%s, %s)", column, clickhousesql.StringLiteral(mapping.SourceType)))
		}
	}
	if len(columns) == 0 {
		return nil, nil, errors.New(errors.TypeUnsupported, ErrCodeRehydrationIncompat, "no archived column can be restored")
	}

	return columns, expressions, nil
}

func archivedParts(parts []RestorablePart) []*ArchivedPart {
	archived := make([]*ArchivedPart, len(parts))
	for i, part := range parts {
		archived[i] = part.Part
	}
	return archived
}
