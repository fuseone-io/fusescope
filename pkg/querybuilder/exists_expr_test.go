package querybuilder

import (
	"testing"

	schema "github.com/fuseone-io/fusescope-otel-collector/cmd/signozschemamigrator/schema_migrator"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExistsExpressionColumnTypes(t *testing.T) {
	lowCardinalityString := schema.LowCardinalityColumnType{ElementType: schema.ColumnTypeString}

	testCases := []struct {
		name       string
		columnType schema.ColumnType
		exists     bool
		want       string
		wantErr    string
	}{
		{name: "String_Exists", columnType: schema.ColumnTypeString, exists: true, want: "expr <> ''"},
		{name: "FixedString_NotExists", columnType: schema.FixedStringColumnType{Length: 32}, want: "expr = ''"},
		{name: "DateTime64_Exists", columnType: schema.DateTime64ColumnType{Precision: 9, Timezone: "UTC"}, exists: true, want: "expr <> toDateTime64(0, 9)"},
		{name: "LowCardinalityString_NotExists", columnType: lowCardinalityString, want: "expr = ''"},
		{name: "LowCardinalityUInt64_Rejected", columnType: schema.LowCardinalityColumnType{ElementType: schema.ColumnTypeUInt64}, exists: true, wantErr: "exists operator is not supported for low cardinality column type UInt64"},
		{name: "UInt8_Exists", columnType: schema.ColumnTypeUInt8, exists: true, want: "expr <> 0"},
		{name: "Bool_NotExists", columnType: schema.ColumnTypeBool, want: "expr = 0"},
		{name: "Array_Exists", columnType: schema.ArrayColumnType{ElementType: schema.ColumnTypeString}, exists: true, want: "notEmpty(expr)"},
		{name: "MapStringValue_Exists", columnType: schema.MapColumnType{KeyType: lowCardinalityString, ValueType: schema.ColumnTypeString}, exists: true, want: "mapContains(attrs, 'http.method')"},
		{name: "MapFloat64Value_NotExists", columnType: schema.MapColumnType{KeyType: lowCardinalityString, ValueType: schema.ColumnTypeFloat64}, want: "NOT mapContains(attrs, 'http.method')"},
		{name: "MapPlainKey_Rejected", columnType: schema.MapColumnType{KeyType: schema.ColumnTypeString, ValueType: schema.ColumnTypeString}, exists: true, wantErr: "key type String is not supported for map column type Map(String, String)"},
		{name: "MapUInt64Value_Rejected", columnType: schema.MapColumnType{KeyType: lowCardinalityString, ValueType: schema.ColumnTypeUInt64}, exists: true, wantErr: "exists operator is not supported for map column type UInt64"},
		{name: "JSON_Exists", columnType: schema.JSONColumnType{}, exists: true, want: "attrs.`http.method` IS NOT NULL"},
		{name: "Float64_Rejected", columnType: schema.ColumnTypeFloat64, exists: true, wantErr: "exists operator is not supported for column type Float64"},
		{name: "Int64_Rejected", columnType: schema.ColumnTypeInt64, exists: true, wantErr: "exists operator is not supported for column type Int64"},
		{name: "MapJSONValue_RenderedWithParams", columnType: schema.MapColumnType{KeyType: lowCardinalityString, ValueType: schema.JSONColumnType{MaxDynamicTypes: ptr(uint(32)), MaxDynamicPaths: ptr(uint(0))}}, exists: true, wantErr: "exists operator is not supported for map column type JSON(max_dynamic_paths=0, max_dynamic_types=32)"},
		{name: "MapDateTime64Value_RenderedWithTimezone", columnType: schema.MapColumnType{KeyType: lowCardinalityString, ValueType: schema.DateTime64ColumnType{Precision: 3, Timezone: "UTC"}}, exists: true, wantErr: "exists operator is not supported for map column type DateTime64(3, UTC)"},
		{name: "MapDateTime64NoTimezone_Rendered", columnType: schema.MapColumnType{KeyType: lowCardinalityString, ValueType: schema.DateTime64ColumnType{Precision: 3}}, exists: true, wantErr: "exists operator is not supported for map column type DateTime64(3)"},
		{name: "MapNestedValue_Rendered", columnType: schema.MapColumnType{KeyType: lowCardinalityString, ValueType: schema.ArrayColumnType{ElementType: schema.FixedStringColumnType{Length: 16}}}, exists: true, wantErr: "exists operator is not supported for map column type Array(FixedString(16))"},
		{name: "MapJSONMaxPathsOnly_Rendered", columnType: schema.MapColumnType{KeyType: lowCardinalityString, ValueType: schema.JSONColumnType{MaxDynamicPaths: ptr(uint(100))}}, exists: true, wantErr: "exists operator is not supported for map column type JSON(max_dynamic_paths=100)"},
		{name: "JSONWithParams_RenderedInError", columnType: schema.LowCardinalityColumnType{ElementType: schema.JSONColumnType{}}, exists: true, wantErr: "exists operator is not supported for low cardinality column type JSON()"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			column := &schema.Column{Name: "attrs", Type: testCase.columnType}
			key := &telemetrytypes.TelemetryFieldKey{Name: "http.method"}
			got, err := ExistsExpression([]*schema.Column{column}, key, 0, 0, "expr", testCase.exists)
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
