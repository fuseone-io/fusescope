package postgressqlschema

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/uptrace/bun/dialect/pgdialect"

	"github.com/fuseone-io/fusescope/pkg/sqlschema"
)

func TestNormalizeDefault(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected string
	}{
		{name: "Empty", input: "", expected: ""},
		{name: "TextCast", input: "'[]'::text", expected: "'[]'"},
		{name: "VarcharCastWithLength", input: "'user'::character varying(255)", expected: "'user'"},
		{name: "ArrayCast", input: "'{}'::text[]", expected: "'{}'"},
		{name: "ChainedCasts", input: "'{}'::jsonb::text", expected: "'{}'"},
		{name: "Boolean", input: "false", expected: "false"},
		{name: "Number", input: "1.1", expected: "1.1"},
		{name: "Function", input: "CURRENT_TIMESTAMP", expected: "CURRENT_TIMESTAMP"},
		{name: "SequenceKeepsInnerCast", input: "nextval('users_id_seq'::regclass)", expected: "nextval('users_id_seq'::regclass)"},
		{name: "CastInsideLiteral", input: "'a::text", expected: "'a::text"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, normalizeDefault(testCase.input))
		})
	}
}

func TestDataTypeOf(t *testing.T) {
	fmter := Formatter{sqlschema.NewFormatter(pgdialect.New())}

	testCases := []struct {
		name     string
		input    string
		expected sqlschema.DataType
	}{
		{name: "Text", input: "text", expected: sqlschema.DataTypeText},
		{name: "VarcharWithLength", input: "character varying(255)", expected: sqlschema.DataTypeText},
		{name: "BigInt", input: "bigint", expected: sqlschema.DataTypeBigInt},
		{name: "Integer", input: "integer", expected: sqlschema.DataTypeInteger},
		{name: "SmallInt", input: "smallint", expected: sqlschema.DataTypeInteger},
		{name: "NumericWithPrecision", input: "numeric(10,2)", expected: sqlschema.DataTypeNumeric},
		{name: "DoublePrecision", input: "double precision", expected: sqlschema.DataTypeNumeric},
		{name: "Boolean", input: "boolean", expected: sqlschema.DataTypeBoolean},
		{name: "TimestampWithTimeZone", input: "timestamp with time zone", expected: sqlschema.DataTypeTimestamp},
		{name: "TimestampWithoutTimeZone", input: "timestamp without time zone", expected: sqlschema.DataTypeTimestamp},
		{name: "Bytea", input: "bytea", expected: sqlschema.DataTypeBytea},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, fmter.DataTypeOf(testCase.input))
		})
	}

	assert.Equal(t, "JSONB", fmter.SQLDataTypeOf(fmter.DataTypeOf("jsonb")))
}

func TestSQLDataTypeOf(t *testing.T) {
	fmter := Formatter{sqlschema.NewFormatter(pgdialect.New())}

	assert.Equal(t, "BYTEA", fmter.SQLDataTypeOf(sqlschema.DataTypeBytea))
	assert.Equal(t, "TEXT", fmter.SQLDataTypeOf(sqlschema.DataTypeText))
	assert.Equal(t, "TIMESTAMP", fmter.SQLDataTypeOf(sqlschema.DataTypeTimestamp))
	assert.Equal(t, "NUMERIC", fmter.SQLDataTypeOf(sqlschema.DataTypeNumeric))
}

func TestToColumnNames(t *testing.T) {
	assert.Equal(t, []sqlschema.ColumnName{"org_id", "user", `we"ird`}, toColumnNames([]string{"org_id", `"user"`, `"we""ird"`}))
}
