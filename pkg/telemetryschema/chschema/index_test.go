package chschema

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAlterTableAddIndexToSQL(t *testing.T) {
	index := Index{Name: "`body_v2.user.name_string_ngrambf_v1`", Expression: "lower(assumeNotNull(dynamicElement(body_v2.user.name, 'String')))", Type: "ngrambf_v1(4, 1024, 2, 0)", Granularity: 1}

	testCases := []struct {
		name    string
		cluster string
		want    string
	}{
		{
			name:    "OnCluster",
			cluster: "cluster",
			want:    "ALTER TABLE signoz_logs.logs_v2 ON CLUSTER cluster ADD INDEX IF NOT EXISTS `body_v2.user.name_string_ngrambf_v1` lower(assumeNotNull(dynamicElement(body_v2.user.name, 'String'))) TYPE ngrambf_v1(4, 1024, 2, 0) GRANULARITY 1",
		},
		{
			name: "NoCluster",
			want: "ALTER TABLE signoz_logs.logs_v2 ADD INDEX IF NOT EXISTS `body_v2.user.name_string_ngrambf_v1` lower(assumeNotNull(dynamicElement(body_v2.user.name, 'String'))) TYPE ngrambf_v1(4, 1024, 2, 0) GRANULARITY 1",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			stmt := AlterTableAddIndex{Database: "signoz_logs", Table: "logs_v2", Index: index}
			assert.Equal(t, testCase.want, stmt.OnCluster(testCase.cluster).ToSQL())
		})
	}
}

func TestJSONSubColumnIndexExpr(t *testing.T) {
	testCases := []struct {
		name         string
		column       string
		path         string
		jsonDataType string
		want         string
	}{
		{name: "String_Lowered", column: "body_v2", path: "user.name", jsonDataType: "String", want: "lower(assumeNotNull(dynamicElement(body_v2.user.name, 'String')))"},
		{name: "Float64_NotLowered", column: "body_promoted", path: "request.duration", jsonDataType: "Float64", want: "assumeNotNull(dynamicElement(body_promoted.request.duration, 'Float64'))"},
		{name: "Bool_NotLowered", column: "body_v2", path: "enabled", jsonDataType: "Bool", want: "assumeNotNull(dynamicElement(body_v2.enabled, 'Bool'))"},
		{name: "LowercaseTypeName_NotLowered", column: "body_v2", path: "a", jsonDataType: "string", want: "assumeNotNull(dynamicElement(body_v2.a, 'string'))"},
		{name: "DashedSegment_Backticked", column: "body_v2", path: "x.user-agent.y", jsonDataType: "Int64", want: "assumeNotNull(dynamicElement(body_v2.x.`user-agent`.y, 'Int64'))"},
		{name: "ColonAndAtSegments_Backticked", column: "body_v2", path: "a:b.c@d", jsonDataType: "Int64", want: "assumeNotNull(dynamicElement(body_v2.`a:b`.`c@d`, 'Int64'))"},
		{name: "DashedColumn_Backticked", column: "body-v2", path: "a", jsonDataType: "Int64", want: "assumeNotNull(dynamicElement(`body-v2`.a, 'Int64'))"},
		{name: "LeadingDigitAndUnderscore_Bare", column: "body_v2", path: "1a._b", jsonDataType: "Int64", want: "assumeNotNull(dynamicElement(body_v2.1a._b, 'Int64'))"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, JSONSubColumnIndexExpr(testCase.column, testCase.path, testCase.jsonDataType))
		})
	}
}

func TestUnfoldJSONSubColumnIndexExpr(t *testing.T) {
	testCases := []struct {
		name       string
		expr       string
		wantColumn string
		wantType   string
		wantErr    bool
	}{
		{name: "Lowered", expr: "lower(assumeNotNull(dynamicElement(body_v2.user.name, 'String')))", wantColumn: "body_v2.user.name", wantType: "String"},
		{name: "NotLowered", expr: "assumeNotNull(dynamicElement(body_v2.request.duration, 'Float64'))", wantColumn: "body_v2.request.duration", wantType: "Float64"},
		{name: "NoSpaceAfterComma", expr: "lower(assumeNotNull(dynamicElement(body_v2.a,'String')))", wantColumn: "body_v2.a", wantType: "String"},
		{name: "BacktickedParentheses", expr: "assumeNotNull(dynamicElement(body_v2.`a(b)`, 'Int64'))", wantColumn: "body_v2.`a(b)`", wantType: "Int64"},
		{name: "CompositeType", expr: "assumeNotNull(dynamicElement(body_v2.tags, 'Array(Nullable(String))'))", wantColumn: "body_v2.tags", wantType: "Array(Nullable(String))"},
		{name: "UnbalancedLower_Rejected", expr: "lower(assumeNotNull(dynamicElement(body_v2.a, 'String'))", wantErr: true},
		{name: "ExtraClosingParenthesis_Rejected", expr: "assumeNotNull(dynamicElement(body_v2.a, 'String')))", wantErr: true},
		{name: "LeadingText_Rejected", expr: "x assumeNotNull(dynamicElement(body_v2.a, 'String'))", wantErr: true},
		{name: "UppercaseLower_Rejected", expr: "LOWER(assumeNotNull(dynamicElement(body_v2.a, 'String')))", wantErr: true},
		{name: "EmptyType_Rejected", expr: "assumeNotNull(dynamicElement(body_v2.a, ''))", wantErr: true},
		{name: "EmptyColumn_Rejected", expr: "assumeNotNull(dynamicElement(, 'String'))", wantErr: true},
		{name: "Cast_Rejected", expr: "CAST(attributes.`http.method`, 'String')", wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			column, jsonDataType, err := UnfoldJSONSubColumnIndexExpr(testCase.expr)
			if testCase.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.wantColumn, column)
			assert.Equal(t, testCase.wantType, jsonDataType)
		})
	}
}

func TestJSONSubColumnIndexExprRoundTrip(t *testing.T) {
	testCases := []struct {
		name         string
		path         string
		jsonDataType string
	}{
		{name: "String", path: "user.name", jsonDataType: "String"},
		{name: "Int64_DashedSegment", path: "http-request.retries", jsonDataType: "Int64"},
		{name: "Bool", path: "flags.enabled", jsonDataType: "Bool"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			column, jsonDataType, err := UnfoldJSONSubColumnIndexExpr(JSONSubColumnIndexExpr("body_v2", testCase.path, testCase.jsonDataType))
			require.NoError(t, err)
			assert.Equal(t, "body_v2."+jsonSubColumnPath(testCase.path), column)
			assert.Equal(t, testCase.jsonDataType, jsonDataType)
		})
	}
}

func TestJSONSubColumnIndexName(t *testing.T) {
	testCases := []struct {
		name      string
		path      string
		indexType IndexType
		want      string
	}{
		{name: "NGram", path: "user.name", indexType: IndexTypeNGramBF, want: "`body_v2.user.name_string_ngrambf_v1`"},
		{name: "DashedPath_NotSegmentQuoted", path: "x.user-agent", indexType: IndexTypeTokenBF, want: "`body_v2.x.user-agent_string_tokenbf_v1`"},
		{name: "OtherType", path: "a", indexType: "bloom_filter", want: "`body_v2.a_string_bloom_filter`"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, JSONSubColumnIndexName("body_v2", testCase.path, "string", testCase.indexType))
		})
	}
}

func TestJSONPathsIndexExpr(t *testing.T) {
	assert.Equal(t, "JSONAllPaths(body_v2)", JSONPathsIndexExpr("body_v2"))
}
