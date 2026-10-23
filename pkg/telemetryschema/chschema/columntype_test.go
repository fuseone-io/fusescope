package chschema

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestColumnTypeString(t *testing.T) {
	zero, eight := uint(0), uint(8)

	testCases := []struct {
		name       string
		columnType ColumnType
		want       string
		wantType   ColumnTypeEnum
	}{
		{name: "Primitive", columnType: ColumnTypeUInt32, want: "UInt32", wantType: ColumnTypeEnumUInt32},
		{name: "LowCardinality", columnType: LowCardinalityColumnType{ElementType: ColumnTypeString}, want: "LowCardinality(String)", wantType: ColumnTypeEnumLowCardinality},
		{name: "Array", columnType: ArrayColumnType{ElementType: ColumnTypeString}, want: "Array(String)", wantType: ColumnTypeEnumArray},
		{name: "Map_LowCardinalityKey", columnType: MapColumnType{KeyType: LowCardinalityColumnType{ElementType: ColumnTypeString}, ValueType: ColumnTypeFloat64}, want: "Map(LowCardinality(String), Float64)", wantType: ColumnTypeEnumMap},
		{name: "FixedString", columnType: FixedStringColumnType{Length: 32}, want: "FixedString(32)", wantType: ColumnTypeEnumFixedString},
		{name: "DateTime64_WithTimezone", columnType: DateTime64ColumnType{Precision: 9, Timezone: "UTC"}, want: "DateTime64(9, UTC)", wantType: ColumnTypeEnumDateTime64},
		{name: "DateTime64_NoTimezone", columnType: DateTime64ColumnType{Precision: 3}, want: "DateTime64(3)", wantType: ColumnTypeEnumDateTime64},
		{name: "JSON_NoLimits", columnType: JSONColumnType{}, want: "JSON()", wantType: ColumnTypeEnumJSON},
		{name: "JSON_BothLimits_PathsFirst", columnType: JSONColumnType{MaxDynamicTypes: &eight, MaxDynamicPaths: &zero}, want: "JSON(max_dynamic_paths=0, max_dynamic_types=8)", wantType: ColumnTypeEnumJSON},
		{name: "JSON_TypesOnly", columnType: JSONColumnType{MaxDynamicTypes: &eight}, want: "JSON(max_dynamic_types=8)", wantType: ColumnTypeEnumJSON},
		{name: "Nested", columnType: MapColumnType{KeyType: ColumnTypeString, ValueType: ArrayColumnType{ElementType: LowCardinalityColumnType{ElementType: ColumnTypeString}}}, want: "Map(String, Array(LowCardinality(String)))", wantType: ColumnTypeEnumMap},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, testCase.columnType.String())
			assert.Equal(t, testCase.wantType, testCase.columnType.GetType())
		})
	}
}

func TestColumnTypeEquality(t *testing.T) {
	stringMap := MapColumnType{KeyType: LowCardinalityColumnType{ElementType: ColumnTypeString}, ValueType: ColumnTypeString}

	testCases := []struct {
		name  string
		left  ColumnType
		right ColumnType
		want  bool
	}{
		{name: "SameMap_Equal", left: stringMap, right: MapColumnType{KeyType: LowCardinalityColumnType{ElementType: ColumnTypeString}, ValueType: ColumnTypeString}, want: true},
		{name: "MapValueDiffers_NotEqual", left: stringMap, right: MapColumnType{KeyType: LowCardinalityColumnType{ElementType: ColumnTypeString}, ValueType: ColumnTypeBool}},
		{name: "PrimitiveVsLowCardinality_NotEqual", left: ColumnTypeString, right: LowCardinalityColumnType{ElementType: ColumnTypeString}},
		{name: "SamePrimitive_Equal", left: ColumnTypeInt64, right: PrimitiveColumnType(ColumnTypeEnumInt64), want: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, testCase.left == testCase.right)
		})
	}
}
