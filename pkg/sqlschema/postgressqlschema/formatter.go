package postgressqlschema

import (
	"strings"

	"github.com/fuseone-io/fusescope/pkg/sqlschema"
)

type Formatter struct {
	sqlschema.Formatter
}

func (formatter Formatter) SQLDataTypeOf(dataType sqlschema.DataType) string {
	if dataType == sqlschema.DataTypeBytea {
		return "BYTEA"
	}

	return strings.ToUpper(dataType.String())
}

// DataTypeOf maps a catalog type name (as returned by format_type) to its logical
// data type. bun creates string fields as VARCHAR and time.Time as TIMESTAMPTZ, so
// those are folded into TEXT and TIMESTAMP to keep schema diffs free of spurious changes.
func (formatter Formatter) DataTypeOf(dataType string) sqlschema.DataType {
	normalized := strings.ToUpper(strings.TrimSpace(dataType))
	if i := strings.IndexByte(normalized, '('); i != -1 {
		normalized = strings.TrimSpace(normalized[:i])
	}

	switch normalized {
	case "TEXT", "CHARACTER VARYING", "VARCHAR", "CHARACTER", "CHAR", "BPCHAR":
		return sqlschema.DataTypeText
	case "BIGINT", "INT8":
		return sqlschema.DataTypeBigInt
	case "INTEGER", "INT", "INT4", "SMALLINT", "INT2":
		return sqlschema.DataTypeInteger
	case "NUMERIC", "DECIMAL", "DOUBLE PRECISION", "FLOAT8", "REAL", "FLOAT4":
		return sqlschema.DataTypeNumeric
	case "BOOLEAN", "BOOL":
		return sqlschema.DataTypeBoolean
	case "TIMESTAMP", "TIMESTAMP WITHOUT TIME ZONE", "TIMESTAMP WITH TIME ZONE", "TIMESTAMPTZ":
		return sqlschema.DataTypeTimestamp
	case "BYTEA":
		return sqlschema.DataTypeBytea
	}

	return formatter.Formatter.DataTypeOf(normalized)
}
