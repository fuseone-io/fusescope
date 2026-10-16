package postgressqlstore

import (
	"strings"

	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/uptrace/bun/schema"
)

type formatter struct {
	bunf schema.Formatter
}

func newFormatter(dialect schema.Dialect) sqlstore.SQLFormatter {
	return &formatter{bunf: schema.NewFormatter(dialect)}
}

func (f *formatter) JSONExtractString(column, path string) []byte {
	return f.extractPath("jsonb_extract_path_text", column, jsonPathSegments(path))
}

func (f *formatter) JSONExtractMapValue(column, mapField, key string) []byte {
	return f.extractPath("jsonb_extract_path_text", column, []string{mapField, key})
}

func (f *formatter) JSONType(column, path string) []byte {
	var sql []byte
	sql = append(sql, "jsonb_typeof("...)
	sql = append(sql, f.extractJSON(column, path)...)
	sql = append(sql, ')')
	return sql
}

func (f *formatter) JSONIsArray(column, path string) []byte {
	var sql []byte
	sql = append(sql, f.JSONType(column, path)...)
	sql = append(sql, " = "...)
	sql = schema.Append(f.bunf, sql, "array")
	return sql
}

func (f *formatter) JSONArrayElements(column, path, alias string) ([]byte, []byte) {
	return f.setReturningFunction("jsonb_array_elements", column, path, alias, "value")
}

func (f *formatter) JSONArrayOfStrings(column, path, alias string) ([]byte, []byte) {
	return f.setReturningFunction("jsonb_array_elements_text", column, path, alias, "value")
}

func (f *formatter) JSONKeys(column, path, alias string) ([]byte, []byte) {
	return f.setReturningFunction("jsonb_object_keys", column, path, alias, "key")
}

func (f *formatter) JSONArrayAgg(expression string) []byte {
	var sql []byte
	sql = append(sql, "jsonb_agg("...)
	sql = append(sql, expression...)
	sql = append(sql, ')')
	return sql
}

func (f *formatter) JSONArrayLiteral(values ...string) []byte {
	var sql []byte
	sql = append(sql, "jsonb_build_array("...)
	for idx, value := range values {
		if idx > 0 {
			sql = append(sql, ", "...)
		}
		sql = schema.Append(f.bunf, sql, value)
	}
	sql = append(sql, ')')
	return sql
}

func (f *formatter) TextToJsonColumn(column string) []byte {
	var sql []byte
	sql = f.bunf.AppendIdent(sql, column)
	sql = append(sql, "::jsonb"...)
	return sql
}

func (f *formatter) LowerExpression(expression string) []byte {
	var sql []byte
	sql = append(sql, "lower("...)
	sql = append(sql, expression...)
	sql = append(sql, ')')
	return sql
}

func (f *formatter) EscapeLikePattern(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}

// extractJSON returns the jsonb value at path; the whole document for "$".
func (f *formatter) extractJSON(column, path string) []byte {
	segments := jsonPathSegments(path)
	if len(segments) == 0 {
		return f.TextToJsonColumn(column)
	}

	return f.extractPath("jsonb_extract_path", column, segments)
}

func (f *formatter) extractPath(function, column string, segments []string) []byte {
	if len(segments) == 0 && function == "jsonb_extract_path_text" {
		var sql []byte
		sql = append(sql, '(')
		sql = append(sql, f.TextToJsonColumn(column)...)
		sql = append(sql, " #>> '{}')"...)
		return sql
	}

	var sql []byte
	sql = append(sql, function...)
	sql = append(sql, '(')
	sql = append(sql, f.TextToJsonColumn(column)...)
	for _, segment := range segments {
		sql = append(sql, ", "...)
		sql = schema.Append(f.bunf, sql, segment)
	}
	sql = append(sql, ')')
	return sql
}

func (f *formatter) setReturningFunction(function, column, path, alias, valueColumn string) ([]byte, []byte) {
	var sql []byte
	sql = append(sql, function...)
	sql = append(sql, '(')
	sql = append(sql, f.extractJSON(column, path)...)
	sql = append(sql, ") AS "...)
	sql = f.bunf.AppendIdent(sql, alias)
	sql = append(sql, '(')
	sql = f.bunf.AppendIdent(sql, valueColumn)
	sql = append(sql, ')')

	return sql, append([]byte(alias), "."+valueColumn...)
}

// jsonPathSegments splits a sqlite-style JSON path ("$.a.b", `$.a."b.c"`) into
// its keys. Double-quoted segments may contain dots; `\\` inside them is a backslash.
func jsonPathSegments(path string) []string {
	path = strings.TrimPrefix(strings.TrimSpace(path), "$")
	path = strings.TrimPrefix(path, ".")
	if path == "" {
		return nil
	}

	var (
		segments []string
		current  strings.Builder
		quoted   bool
	)

	for i := 0; i < len(path); i++ {
		ch := path[i]
		switch {
		case quoted && ch == '\\' && i+1 < len(path):
			i++
			current.WriteByte(path[i])
		case ch == '"':
			quoted = !quoted
		case ch == '.' && !quoted:
			segments = append(segments, current.String())
			current.Reset()
		default:
			current.WriteByte(ch)
		}
	}

	return append(segments, current.String())
}
