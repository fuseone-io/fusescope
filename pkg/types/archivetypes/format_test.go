package archivetypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExportType(t *testing.T) {
	testCases := []struct {
		name   string
		source string
		want   string
	}{
		{name: "UInt8_Int32", source: "UInt8", want: "Int32"},
		{name: "UInt16_Int32", source: "UInt16", want: "Int32"},
		{name: "UInt32_Int64", source: "UInt32", want: "Int64"},
		{name: "UInt64_Int64", source: "UInt64", want: "Int64"},
		{name: "Int64_Unchanged", source: "Int64", want: "Int64"},
		{name: "Float64_Unchanged", source: "Float64", want: "Float64"},
		{name: "Bool_Unchanged", source: "Bool", want: "Bool"},
		{name: "String_Unchanged", source: "String", want: "String"},
		{name: "FixedString_String", source: "FixedString(16)", want: "String"},
		{name: "LowCardinality_Unwrapped", source: "LowCardinality(String)", want: "String"},
		{name: "LowCardinalityNullable_Nullable", source: "LowCardinality(Nullable(String))", want: "Nullable(String)"},
		{name: "EnumWithQuotedComma_String", source: "Enum8('a' = 1, 'b,c' = 2)", want: "String"},
		{name: "UUID_String", source: "UUID", want: "String"},
		{name: "Dynamic_String", source: "Dynamic", want: "String"},
		{name: "Variant_String", source: "Variant(UInt8, String)", want: "String"},
		{name: "JSON_Unchanged", source: "JSON", want: "JSON"},
		{name: "JSONWithParameters_Unchanged", source: "JSON(max_dynamic_paths=0, message String)", want: "JSON(max_dynamic_paths=0, message String)"},
		{name: "DateTime64Millis_Unchanged", source: "DateTime64(3)", want: "DateTime64(3)"},
		{name: "DateTime64NanosWithTimezone_Unchanged", source: "DateTime64(9, 'UTC')", want: "DateTime64(9, 'UTC')"},
		{name: "MapLowCardinalityKey_StringKey", source: "Map(LowCardinality(String), String)", want: "Map(String, String)"},
		{name: "MapBoolValue_StringKey", source: "Map(LowCardinality(String), Bool)", want: "Map(String, Bool)"},
		{name: "ArrayUInt64_ArrayInt64", source: "Array(UInt64)", want: "Array(Int64)"},
		{name: "NullableUInt16_NullableInt32", source: "Nullable(UInt16)", want: "Nullable(Int32)"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := ExportType(testCase.source)
			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}

func TestExportTypeUnsupported(t *testing.T) {
	testCases := []struct {
		name   string
		source string
	}{
		{name: "Tuple", source: "Tuple(a String)"},
		{name: "UInt128", source: "UInt128"},
		{name: "MapWithoutValue", source: "Map(String)"},
		{name: "UnclosedParenthesis", source: "LowCardinality("},
		{name: "TrailingParenthesis", source: "Array(String))"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := ExportType(testCase.source)
			assert.Error(t, err)
		})
	}
}

func TestNewColumnMappings(t *testing.T) {
	mappings, err := NewColumnMappings([]Column{
		{Name: "timestamp", Type: "UInt64"},
		{Name: "body", Type: "String"},
		{Name: "attributes_string", Type: "Map(LowCardinality(String), String)"},
		{Name: "observed", Type: "DateTime64(9)"},
		{Name: "seen", Type: "Nullable(DateTime64(9))"},
		{Name: "price", Type: "Decimal(18, 4)"},
		{Name: "events", Type: "Array(Map(LowCardinality(String), UInt64))"},
		{Name: "odd`name", Type: "String"},
		{Name: "payload", Type: "Dynamic"},
	})
	require.NoError(t, err)

	assert.Equal(t, []ColumnMapping{
		{Name: "timestamp", SourceType: "UInt64", ExportType: "Int64", UInt64Rule: UInt64RuleBits},
		{Name: "body", SourceType: "String", ExportType: "String"},
		{Name: "attributes_string", SourceType: "Map(LowCardinality(String), String)", ExportType: "Map(String, String)"},
		{Name: "observed", SourceType: "DateTime64(9)", ExportType: "DateTime64(9)", UnixNano: true},
		{Name: "seen", SourceType: "Nullable(DateTime64(9))", ExportType: "Nullable(DateTime64(9))", UnixNano: true},
		{Name: "price", SourceType: "Decimal(18, 4)", ExportType: "Decimal(18, 4)"},
		{Name: "events", SourceType: "Array(Map(LowCardinality(String), UInt64))", ExportType: "Array(Map(String, Int64))", UInt64Rule: UInt64RuleBits},
		{Name: "odd`name", SourceType: "String", ExportType: "String"},
		{Name: "payload", SourceType: "Dynamic", ExportType: "String"},
	}, mappings)

	assert.Equal(t, []string{
		"CAST(`timestamp`, 'Int64') AS `timestamp`",
		"`body`",
		"CAST(`attributes_string`, 'Map(String, String)') AS `attributes_string`",
		"`observed`",
		"toUnixTimestamp64Nano(`observed`) AS `observed_unix_nano`",
		"`seen`",
		"toUnixTimestamp64Nano(`seen`) AS `seen_unix_nano`",
		"`price`",
		"CAST(`events`, 'Array(Map(String, Int64))') AS `events`",
		"`odd\\`name`",
		"CAST(`payload`, 'String') AS `payload`",
		"toInt32(2) AS `_shard`",
		"_part AS `_part`",
	}, ExportExpressions(mappings, 2))
}

func TestNewColumnMappingsRejectsUnsupportedAndClashingColumns(t *testing.T) {
	_, err := NewColumnMappings([]Column{{Name: "pair", Type: "Tuple(a String)"}})
	assert.Error(t, err)

	_, err = NewColumnMappings([]Column{{Name: "observed", Type: "DateTime64(9)"}, {Name: "observed_unix_nano", Type: "Int64"}})
	assert.Error(t, err)

	for _, reserved := range []string{ShardColumn, PartColumn} {
		_, err = NewColumnMappings([]Column{{Name: reserved, Type: "String"}})
		assert.Error(t, err, "%s is written by every export", reserved)
	}
}
