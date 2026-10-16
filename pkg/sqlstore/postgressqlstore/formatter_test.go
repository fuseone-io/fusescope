package postgressqlstore

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/uptrace/bun/dialect/pgdialect"
)

func TestJSONExtractString(t *testing.T) {
	testCases := []struct {
		name     string
		column   string
		path     string
		expected string
	}{
		{
			name:     "SimplePath",
			column:   "data",
			path:     "$.field",
			expected: `jsonb_extract_path_text("data"::jsonb, 'field')`,
		},
		{
			name:     "NestedPath_QualifiedColumn",
			column:   "dashboard.data",
			path:     "$.spec.display.name",
			expected: `jsonb_extract_path_text("dashboard"."data"::jsonb, 'spec', 'display', 'name')`,
		},
		{
			name:     "RootPath",
			column:   "json_col",
			path:     "$",
			expected: `("json_col"::jsonb #>> '{}')`,
		},
		{
			name:     "EmptyPath",
			column:   "json_col",
			path:     "",
			expected: `("json_col"::jsonb #>> '{}')`,
		},
		{
			name:     "QuotedSegmentWithDots",
			column:   "rule.data",
			path:     `$.labels."service.name"`,
			expected: `jsonb_extract_path_text("rule"."data"::jsonb, 'labels', 'service.name')`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			f := newFormatter(pgdialect.New())
			assert.Equal(t, testCase.expected, string(f.JSONExtractString(testCase.column, testCase.path)))
		})
	}
}

func TestJSONExtractMapValue(t *testing.T) {
	testCases := []struct {
		name     string
		column   string
		mapField string
		key      string
		expected string
	}{
		{
			name:     "PlainKey",
			column:   "rule.data",
			mapField: "labels",
			key:      "severity",
			expected: `jsonb_extract_path_text("rule"."data"::jsonb, 'labels', 'severity')`,
		},
		{
			name:     "KeyWithDotsAndQuotes",
			column:   "data",
			mapField: "labels",
			key:      `k8s.pod"name's`,
			expected: `jsonb_extract_path_text("data"::jsonb, 'labels', 'k8s.pod"name''s')`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			f := newFormatter(pgdialect.New())
			assert.Equal(t, testCase.expected, string(f.JSONExtractMapValue(testCase.column, testCase.mapField, testCase.key)))
		})
	}
}

func TestJSONTypeAndIsArray(t *testing.T) {
	f := newFormatter(pgdialect.New())

	assert.Equal(t, `jsonb_typeof(jsonb_extract_path("data"::jsonb, 'items'))`, string(f.JSONType("data", "$.items")))
	assert.Equal(t, `jsonb_typeof("data"::jsonb)`, string(f.JSONType("data", "$")))
	assert.Equal(t, `jsonb_typeof(jsonb_extract_path("data"::jsonb, 'items')) = 'array'`, string(f.JSONIsArray("data", "$.items")))
}

func TestSetReturningFunctions(t *testing.T) {
	testCases := []struct {
		name           string
		build          func(f *formatter) ([]byte, []byte)
		expectedSQL    string
		expectedColumn string
	}{
		{
			name: "ArrayElements_NestedPath",
			build: func(f *formatter) ([]byte, []byte) {
				return f.JSONArrayElements("data", "$.tags", "tag")
			},
			expectedSQL:    `jsonb_array_elements(jsonb_extract_path("data"::jsonb, 'tags')) AS "tag"("value")`,
			expectedColumn: "tag.value",
		},
		{
			name: "ArrayOfStrings_RootPath",
			build: func(f *formatter) ([]byte, []byte) {
				return f.JSONArrayOfStrings("names", "$", "n")
			},
			expectedSQL:    `jsonb_array_elements_text("names"::jsonb) AS "n"("value")`,
			expectedColumn: "n.value",
		},
		{
			name: "Keys_NestedPath",
			build: func(f *formatter) ([]byte, []byte) {
				return f.JSONKeys("data", "$.labels", "label")
			},
			expectedSQL:    `jsonb_object_keys(jsonb_extract_path("data"::jsonb, 'labels')) AS "label"("key")`,
			expectedColumn: "label.key",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			f := newFormatter(pgdialect.New()).(*formatter)
			sql, column := testCase.build(f)
			assert.Equal(t, testCase.expectedSQL, string(sql))
			assert.Equal(t, testCase.expectedColumn, string(column))
		})
	}
}

func TestAggregatesAndLiterals(t *testing.T) {
	f := newFormatter(pgdialect.New())

	assert.Equal(t, `jsonb_agg(t.name)`, string(f.JSONArrayAgg("t.name")))
	assert.Equal(t, `jsonb_build_array('a', 'b''c')`, string(f.JSONArrayLiteral("a", "b'c")))
	assert.Equal(t, `jsonb_build_array()`, string(f.JSONArrayLiteral()))
	assert.Equal(t, `"data"::jsonb`, string(f.TextToJsonColumn("data")))
	assert.Equal(t, `lower(u.email)`, string(f.LowerExpression("u.email")))
	assert.Equal(t, `100\%\_off\\`, f.EscapeLikePattern(`100%_off\`))
}

func TestJSONPathSegments(t *testing.T) {
	testCases := []struct {
		name     string
		path     string
		expected []string
	}{
		{name: "Root", path: "$", expected: nil},
		{name: "Empty", path: "", expected: nil},
		{name: "Nested", path: "$.a.b.c", expected: []string{"a", "b", "c"}},
		{name: "QuotedWithDot", path: `$.labels."x.y"`, expected: []string{"labels", "x.y"}},
		{name: "QuotedWithEscapedBackslash", path: `$.labels."a\\b"`, expected: []string{"labels", `a\b`}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, jsonPathSegments(testCase.path))
		})
	}
}
