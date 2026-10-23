package querybuilder

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExistsExpressionColumnTypes(t *testing.T) {
	lowCardinalityString := chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString}

	testCases := []struct {
		name       string
		columnType chschema.ColumnType
		exists     bool
		want       string
		wantErr    string
	}{
		{name: "String_Exists", columnType: chschema.ColumnTypeString, exists: true, want: "expr <> ''"},
		{name: "FixedString_NotExists", columnType: chschema.FixedStringColumnType{Length: 32}, want: "expr = ''"},
		{name: "DateTime64_Exists", columnType: chschema.DateTime64ColumnType{Precision: 9, Timezone: "UTC"}, exists: true, want: "expr <> toDateTime64(0, 9)"},
		{name: "LowCardinalityString_NotExists", columnType: lowCardinalityString, want: "expr = ''"},
		{name: "LowCardinalityUInt64_Rejected", columnType: chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeUInt64}, exists: true, wantErr: "exists operator is not supported for low cardinality column type UInt64"},
		{name: "UInt8_Exists", columnType: chschema.ColumnTypeUInt8, exists: true, want: "expr <> 0"},
		{name: "Bool_NotExists", columnType: chschema.ColumnTypeBool, want: "expr = 0"},
		{name: "Array_Exists", columnType: chschema.ArrayColumnType{ElementType: chschema.ColumnTypeString}, exists: true, want: "notEmpty(expr)"},
		{name: "MapStringValue_Exists", columnType: chschema.MapColumnType{KeyType: lowCardinalityString, ValueType: chschema.ColumnTypeString}, exists: true, want: "mapContains(attrs, 'http.method')"},
		{name: "MapFloat64Value_NotExists", columnType: chschema.MapColumnType{KeyType: lowCardinalityString, ValueType: chschema.ColumnTypeFloat64}, want: "NOT mapContains(attrs, 'http.method')"},
		{name: "MapPlainKey_Rejected", columnType: chschema.MapColumnType{KeyType: chschema.ColumnTypeString, ValueType: chschema.ColumnTypeString}, exists: true, wantErr: "key type String is not supported for map column type Map(String, String)"},
		{name: "MapUInt64Value_Rejected", columnType: chschema.MapColumnType{KeyType: lowCardinalityString, ValueType: chschema.ColumnTypeUInt64}, exists: true, wantErr: "exists operator is not supported for map column type UInt64"},
		{name: "JSON_Exists", columnType: chschema.JSONColumnType{}, exists: true, want: "attrs.`http.method` IS NOT NULL"},
		{name: "Float64_Rejected", columnType: chschema.ColumnTypeFloat64, exists: true, wantErr: "exists operator is not supported for column type Float64"},
		{name: "Int64_Rejected", columnType: chschema.ColumnTypeInt64, exists: true, wantErr: "exists operator is not supported for column type Int64"},
		{name: "MapJSONValue_RenderedWithParams", columnType: chschema.MapColumnType{KeyType: lowCardinalityString, ValueType: chschema.JSONColumnType{MaxDynamicTypes: ptr(uint(32)), MaxDynamicPaths: ptr(uint(0))}}, exists: true, wantErr: "exists operator is not supported for map column type JSON(max_dynamic_paths=0, max_dynamic_types=32)"},
		{name: "MapDateTime64Value_RenderedWithTimezone", columnType: chschema.MapColumnType{KeyType: lowCardinalityString, ValueType: chschema.DateTime64ColumnType{Precision: 3, Timezone: "UTC"}}, exists: true, wantErr: "exists operator is not supported for map column type DateTime64(3, UTC)"},
		{name: "MapDateTime64NoTimezone_Rendered", columnType: chschema.MapColumnType{KeyType: lowCardinalityString, ValueType: chschema.DateTime64ColumnType{Precision: 3}}, exists: true, wantErr: "exists operator is not supported for map column type DateTime64(3)"},
		{name: "MapNestedValue_Rendered", columnType: chschema.MapColumnType{KeyType: lowCardinalityString, ValueType: chschema.ArrayColumnType{ElementType: chschema.FixedStringColumnType{Length: 16}}}, exists: true, wantErr: "exists operator is not supported for map column type Array(FixedString(16))"},
		{name: "MapJSONMaxPathsOnly_Rendered", columnType: chschema.MapColumnType{KeyType: lowCardinalityString, ValueType: chschema.JSONColumnType{MaxDynamicPaths: ptr(uint(100))}}, exists: true, wantErr: "exists operator is not supported for map column type JSON(max_dynamic_paths=100)"},
		{name: "JSONWithParams_RenderedInError", columnType: chschema.LowCardinalityColumnType{ElementType: chschema.JSONColumnType{}}, exists: true, wantErr: "exists operator is not supported for low cardinality column type JSON()"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			column := &chschema.Column{Name: "attrs", Type: testCase.columnType}
			key := &telemetrytypes.TelemetryFieldKey{Name: "http.method"}
			got, err := ExistsExpression([]*chschema.Column{column}, key, 0, 0, "expr", testCase.exists)
			if testCase.wantErr != "" {
				require.Error(t, err)
				assert.Equal(t, testCase.wantErr, err.Error())
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}

func ptr[T any](v T) *T { return &v }
