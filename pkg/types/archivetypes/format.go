package archivetypes

import (
	"fmt"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
)

// FormatVersion is the version of the Parquet type contract (ADR 0002 §8) written to the
// manifest of every export.
const FormatVersion = 1

const unixNanoSuffix = "_unix_nano"

var ErrCodeUnsupportedColumn = errors.MustNewCode("archive_unsupported_column")

// Column is a column of a live table, from system.columns.
type Column struct {
	Name string
	Type string
}

// ColumnMapping is how one column is exported. Restores cast ExportType back to
// SourceType; UnixNano adds a portable <name>_unix_nano Int64 next to a DateTime64(9).
type ColumnMapping struct {
	Name       string `json:"name"`
	SourceType string `json:"source_type"`
	ExportType string `json:"export_type"`
	UnixNano   bool   `json:"unix_nano,omitempty"`
}

func NewColumnMappings(columns []Column) ([]ColumnMapping, error) {
	names := make(map[string]bool, len(columns))
	for _, column := range columns {
		names[column.Name] = true
	}

	mappings := make([]ColumnMapping, 0, len(columns))
	for _, column := range columns {
		exportType, err := ExportType(column.Type)
		if err != nil {
			return nil, errors.Wrapf(err, errors.TypeUnsupported, ErrCodeUnsupportedColumn, "column %s can't be archived", column.Name)
		}

		mapping := ColumnMapping{Name: column.Name, SourceType: column.Type, ExportType: exportType, UnixNano: isNanosecondTimestamp(column.Type)}
		if mapping.UnixNano && names[column.Name+unixNanoSuffix] {
			return nil, errors.Newf(errors.TypeUnsupported, ErrCodeUnsupportedColumn, "column %s clashes with the exported %s%s", column.Name+unixNanoSuffix, column.Name, unixNanoSuffix)
		}
		mappings = append(mappings, mapping)
	}

	return mappings, nil
}

// ExportExpressions is the SELECT list of an export, in column order.
func ExportExpressions(mappings []ColumnMapping) []string {
	expressions := make([]string, 0, len(mappings))
	for _, mapping := range mappings {
		column := clickhousesql.Identifier(mapping.Name)
		if mapping.ExportType == mapping.SourceType {
			expressions = append(expressions, column)
		} else {
			expressions = append(expressions, fmt.Sprintf("CAST(%s, %s) AS %s", column, clickhousesql.StringLiteral(mapping.ExportType), column))
		}
		if mapping.UnixNano {
			expressions = append(expressions, fmt.Sprintf("toUnixTimestamp64Nano(%s) AS %s", column, clickhousesql.Identifier(mapping.Name+unixNanoSuffix)))
		}
	}

	return expressions
}

// ExportType is the ClickHouse type a column of type source is written as, so that its
// Parquet type follows the contract: unsigned integers widen to signed ones (UInt64 keeps
// its bits), and types Parquet readers don't share become String.
func ExportType(source string) (string, error) {
	name, args, err := parseType(source)
	if err != nil {
		return "", err
	}

	switch name {
	case "UInt8", "UInt16":
		return "Int32", nil
	case "UInt32", "UInt64":
		return "Int64", nil
	case "Int8", "Int16", "Int32", "Int64", "Float32", "Float64", "Decimal", "Decimal32", "Decimal64", "String", "Bool", "Date", "Date32", "DateTime", "DateTime64", "JSON":
		return source, nil
	case "FixedString", "Enum8", "Enum16", "UUID", "IPv4", "IPv6", "Dynamic", "Variant":
		return "String", nil
	case "LowCardinality":
		if len(args) != 1 {
			return "", unsupportedType(source)
		}
		return ExportType(args[0])
	case "Nullable", "Array":
		if len(args) != 1 {
			return "", unsupportedType(source)
		}
		inner, err := ExportType(args[0])
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%s(%s)", name, inner), nil
	case "Map":
		if len(args) != 2 {
			return "", unsupportedType(source)
		}
		key, err := ExportType(args[0])
		if err != nil {
			return "", err
		}
		value, err := ExportType(args[1])
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Map(%s, %s)", key, value), nil
	}

	return "", unsupportedType(source)
}

func isNanosecondTimestamp(source string) bool {
	name, args, err := parseType(source)
	return err == nil && name == "DateTime64" && len(args) > 0 && args[0] == "9"
}

// parseType splits a ClickHouse type into its name and top-level arguments, keeping quoted
// and nested commas inside their argument.
func parseType(source string) (string, []string, error) {
	source = strings.TrimSpace(source)
	open := strings.IndexByte(source, '(')
	if open < 0 {
		if strings.ContainsAny(source, ")'`, ") || source == "" {
			return "", nil, unsupportedType(source)
		}
		return source, nil, nil
	}
	if !strings.HasSuffix(source, ")") {
		return "", nil, unsupportedType(source)
	}

	var args []string
	depth, start := 0, open+1
	var quote byte
	body := source[:len(source)-1]
	for i := open + 1; i < len(body); i++ {
		c := body[i]
		switch {
		case quote != 0:
			switch c {
			case '\\':
				i++
			case quote:
				quote = 0
			}
		case c == '\'' || c == '`':
			quote = c
		case c == '(':
			depth++
		case c == ')':
			depth--
			if depth < 0 {
				return "", nil, unsupportedType(source)
			}
		case c == ',' && depth == 0:
			args = append(args, strings.TrimSpace(body[start:i]))
			start = i + 1
		}
	}
	if depth != 0 || quote != 0 {
		return "", nil, unsupportedType(source)
	}
	args = append(args, strings.TrimSpace(body[start:]))

	return source[:open], args, nil
}

func unsupportedType(source string) error {
	return errors.Newf(errors.TypeUnsupported, ErrCodeUnsupportedColumn, "type %q has no archive format", source)
}
