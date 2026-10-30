package archivetypes

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewRehydration(t *testing.T) {
	rehydration, err := NewRehydration("logs", time.Date(2026, 9, 3, 17, 4, 0, 0, time.UTC), 7*24*time.Hour, "admin@example.com")
	require.NoError(t, err)

	assert.Equal(t, time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), rehydration.Start)
	assert.Equal(t, time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC), rehydration.End)
	assert.Equal(t, []string{"2026-09-03"}, rehydration.Days())
	assert.Equal(t, RehydrationStatusPending, rehydration.Status)
	assert.WithinDuration(t, time.Now().Add(7*24*time.Hour), rehydration.ExpiresAt, time.Minute)

	_, err = NewRehydration("logs", time.Now(), 0, "admin@example.com")
	assert.True(t, errors.Asc(err, ErrCodeInvalidRehydration), err)
}

func TestRestorablePartInDay(t *testing.T) {
	testCases := []struct {
		name   string
		prefix string
		key    string
		inDay  bool
	}{
		{name: "AttemptDirectory", prefix: "fusescope", key: "fusescope/logs_v2/day=2026-09-03/shard=1/partition=20260903/attempt=a/p.parquet", inDay: true},
		{name: "CompactionDirectory", prefix: "fusescope", key: "fusescope/logs_v2/day=2026-09-03/shard=1/partition=20260903/compaction=c/o.parquet", inDay: true},
		{name: "OtherDay", prefix: "fusescope", key: "fusescope/logs_v2/day=2026-09-04/shard=1/partition=20260904/attempt=a/p.parquet"},
		{name: "OtherTable", prefix: "fusescope", key: "fusescope/logs_v2_resource/day=2026-09-03/shard=1/partition=20260903/attempt=a/p.parquet"},
		{name: "OtherPrefix", prefix: "fuse", key: "fusescope/logs_v2/day=2026-09-03/shard=1/partition=20260903/attempt=a/p.parquet"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			part := RestorablePart{Part: &ArchivedPart{TableName: "logs_v2"}, Object: &Object{ObjectKey: testCase.key}, Attempt: &Attempt{Prefix: testCase.prefix}}
			assert.Equal(t, testCase.inDay, part.InDay("2026-09-03"))
		})
	}
}

func TestAttemptColumnMappings(t *testing.T) {
	testCases := []struct {
		name          string
		formatVersion int
		mapping       string
		wantErr       bool
	}{
		{name: "CurrentVersion", formatVersion: FormatVersion, mapping: `[{"name":"ts","source_type":"UInt64","export_type":"Int64","uint64_rule":"bits"}]`},
		{name: "NewerVersion_Incompatible", formatVersion: FormatVersion + 1, mapping: `[{"name":"ts"}]`, wantErr: true},
		{name: "NoVersion_Incompatible", formatVersion: 0, mapping: `[{"name":"ts"}]`, wantErr: true},
		{name: "EmptyMapping_Incompatible", formatVersion: FormatVersion, mapping: `[]`, wantErr: true},
		{name: "Garbage_Incompatible", formatVersion: FormatVersion, mapping: `{`, wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			mappings, err := (&Attempt{FormatVersion: testCase.formatVersion, ColumnMapping: testCase.mapping}).ColumnMappings()
			if testCase.wantErr {
				assert.Equal(t, FailureIncompatible, FailureReasonOf(err))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, []ColumnMapping{{Name: "ts", SourceType: "UInt64", ExportType: "Int64", UInt64Rule: UInt64RuleBits}}, mappings)
		})
	}
}

func TestRestoreExpressions(t *testing.T) {
	target := []SchemaColumn{
		{Name: "ts", Type: "UInt64"},
		{Name: "severity", Type: "LowCardinality(String)"},
		{Name: "body", Type: "String"},
		{Name: "day", Type: "Date", DefaultKind: "MATERIALIZED", DefaultExpression: "toDate(ts)"},
		{Name: "env", Type: "String", DefaultKind: "DEFAULT", DefaultExpression: "'prod'"},
	}

	testCases := []struct {
		name        string
		mappings    []ColumnMapping
		columns     []string
		expressions []string
		wantErr     bool
	}{
		{
			name: "CastsBackToSourceType_SkipsComputed",
			mappings: []ColumnMapping{
				{Name: "ts", SourceType: "UInt64", ExportType: "Int64", UInt64Rule: UInt64RuleBits},
				{Name: "severity", SourceType: "LowCardinality(String)", ExportType: "String"},
				{Name: "body", SourceType: "String", ExportType: "String"},
				{Name: "day", SourceType: "Date", ExportType: "Date"},
			},
			columns:     []string{"`ts`", "`severity`", "`body`"},
			expressions: []string{"CAST(`ts`, 'UInt64')", "CAST(`severity`, 'LowCardinality(String)')", "`body`"},
		},
		{name: "ColumnGone_Incompatible", mappings: []ColumnMapping{{Name: "gone", SourceType: "String", ExportType: "String"}}, wantErr: true},
		{name: "OnlyComputed_Incompatible", mappings: []ColumnMapping{{Name: "day", SourceType: "Date", ExportType: "Date"}}, wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			columns, expressions, err := RestoreExpressions(testCase.mappings, target)
			if testCase.wantErr {
				assert.Equal(t, FailureIncompatible, FailureReasonOf(err))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.columns, columns)
			assert.Equal(t, testCase.expressions, expressions)
		})
	}
}

func TestRestorePlan(t *testing.T) {
	part := func(table string, shard int, partition string, name string, min int64, max int64) RestorablePart {
		return RestorablePart{Part: &ArchivedPart{TableName: table, Shard: shard, PartitionID: partition, PartName: name, MinBlock: min, MaxBlock: max, DataVersion: min}, Object: &Object{ObjectKey: name}, Attempt: &Attempt{}}
	}
	names := func(parts []RestorablePart) []string {
		var names []string
		for _, part := range parts {
			names = append(names, part.Part.PartName)
		}
		return names
	}

	testCases := []struct {
		name     string
		parts    []RestorablePart
		expected map[string][]string
		failure  string
	}{
		{
			name: "BlockOrderPerShardAndPartition",
			parts: []RestorablePart{
				part("logs_v2", 2, "p", "s2_1_1", 1, 1), part("logs_v2", 1, "p", "s1_5_6", 5, 6), part("logs_v2", 1, "p", "s1_1_4", 1, 4),
				part("logs_v2_resource", 1, "r", "r_1_1", 1, 1),
			},
			expected: map[string][]string{"logs_v2": {"s1_1_4", "s1_5_6", "s2_1_1"}, "logs_v2_resource": {"r_1_1"}},
		},
		{
			name:     "ContainedPart_Skipped",
			parts:    []RestorablePart{part("logs_v2", 1, "p", "p_1_9", 1, 9), part("logs_v2", 1, "p", "p_2_3", 2, 3), part("logs_v2_resource", 1, "r", "r_1_1", 1, 1)},
			expected: map[string][]string{"logs_v2": {"p_1_9"}, "logs_v2_resource": {"r_1_1"}},
		},
		{
			name:     "SameBlocksOtherPartition_Kept",
			parts:    []RestorablePart{part("logs_v2", 1, "p-15", "a_1_1", 1, 1), part("logs_v2", 1, "p-30", "b_1_1", 1, 1), part("logs_v2_resource", 1, "r", "r_1_1", 1, 1)},
			expected: map[string][]string{"logs_v2": {"a_1_1", "b_1_1"}, "logs_v2_resource": {"r_1_1"}},
		},
		{
			name:    "ResourceTableMissing_Incomplete",
			parts:   []RestorablePart{part("logs_v2", 1, "p", "p_1_1", 1, 1)},
			failure: FailureIncomplete,
		},
		{
			name:    "OverlappingParts_Corrupt",
			parts:   []RestorablePart{part("logs_v2", 1, "p", "p_1_5", 1, 5), part("logs_v2", 1, "p", "p_4_9", 4, 9), part("logs_v2_resource", 1, "r", "r_1_1", 1, 1)},
			failure: FailureCorrupt,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			plan, err := RestorePlan([]string{"logs_v2", "logs_v2_resource"}, testCase.parts)
			if testCase.failure != "" {
				assert.Equal(t, testCase.failure, FailureReasonOf(err), err)
				return
			}
			require.NoError(t, err)
			actual := map[string][]string{}
			for table, parts := range plan {
				actual[table] = names(parts)
			}
			assert.Equal(t, testCase.expected, actual)
		})
	}
}
