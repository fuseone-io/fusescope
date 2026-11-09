package datafusionsql

import (
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// Interpolate replaces each ? placeholder of sql, in order, by the literal of the matching arg,
// since the engine takes no statement parameters. A ? inside a string, a quoted identifier or a
// comment is text and stays. Every arg must be used exactly once.
func Interpolate(sql string, args []any) (string, error) {
	var out strings.Builder
	out.Grow(len(sql))
	next := 0
	for i := 0; i < len(sql); i++ {
		c := sql[i]
		switch {
		case c == '\'' || c == '"':
			end, err := quotedEnd(sql, i, c)
			if err != nil {
				return "", err
			}
			out.WriteString(sql[i:end])
			i = end - 1
		case c == '-' && strings.HasPrefix(sql[i:], "--"):
			end := strings.IndexByte(sql[i:], '\n')
			if end < 0 {
				end = len(sql) - i
			}
			out.WriteString(sql[i : i+end])
			i += end - 1
		case c == '/' && strings.HasPrefix(sql[i:], "/*"):
			end := strings.Index(sql[i+2:], "*/")
			if end < 0 {
				return "", errors.NewInvalidInputf(ErrCodeUnrenderable, "an unterminated comment")
			}
			out.WriteString(sql[i : i+2+end+2])
			i += 2 + end + 1
		case c == '?':
			if next >= len(args) {
				return "", errors.NewInvalidInputf(ErrCodeUnrenderable, "more placeholders than the %d args", len(args))
			}
			literal, err := Literal(args[next])
			if err != nil {
				return "", err
			}
			out.WriteString(literal)
			next++
		default:
			out.WriteByte(c)
		}
	}
	if next != len(args) {
		return "", errors.NewInvalidInputf(ErrCodeUnrenderable, "%d placeholders for %d args", next, len(args))
	}
	return out.String(), nil
}

// quotedEnd is the index just past the quote closing the string or identifier opened at start.
func quotedEnd(sql string, start int, quote byte) (int, error) {
	for i := start + 1; i < len(sql); i++ {
		if sql[i] != quote {
			continue
		}
		if i+1 < len(sql) && sql[i+1] == quote {
			i++
			continue
		}
		return i + 1, nil
	}
	return 0, errors.NewInvalidInputf(ErrCodeUnrenderable, "an unterminated quote")
}

// Literal renders one value: a string, an integer, a float, a bool, or a list of them as an array.
func Literal(v any) (string, error) {
	switch v := v.(type) {
	case string:
		return String(v)
	case bool:
		return Bool(v), nil
	case int:
		return Int(int64(v)), nil
	case int8:
		return Int(int64(v)), nil
	case int16:
		return Int(int64(v)), nil
	case int32:
		return Int(int64(v)), nil
	case int64:
		return Int(v), nil
	case uint:
		return Uint(uint64(v)), nil
	case uint8:
		return Uint(uint64(v)), nil
	case uint16:
		return Uint(uint64(v)), nil
	case uint32:
		return Uint(uint64(v)), nil
	case uint64:
		return Uint(v), nil
	case float32:
		return Float(float64(v))
	case float64:
		return Float(v)
	case []string:
		items := make([]any, len(v))
		for i := range v {
			items[i] = v[i]
		}
		return array(items)
	case []any:
		return array(v)
	default:
		return "", errors.NewInvalidInputf(ErrCodeUnrenderable, "a %T has no SQL literal", v)
	}
}

func array(items []any) (string, error) {
	rendered := make([]string, len(items))
	for i, item := range items {
		literal, err := Literal(item)
		if err != nil {
			return "", err
		}
		rendered[i] = literal
	}
	return "[" + strings.Join(rendered, ", ") + "]", nil
}

// BacktickIdentifiers rewrites each backtick identifier of sql, as a builder shared with ClickHouse
// writes it (backslash escapes, \x24 for a dollar), as a double-quoted one. Strings, quoted
// identifiers and comments are left as they are.
func BacktickIdentifiers(sql string) (string, error) {
	var out strings.Builder
	out.Grow(len(sql))
	for i := 0; i < len(sql); i++ {
		c := sql[i]
		switch {
		case c == '\'' || c == '"':
			end, err := quotedEnd(sql, i, c)
			if err != nil {
				return "", err
			}
			out.WriteString(sql[i:end])
			i = end - 1
		case c == '-' && strings.HasPrefix(sql[i:], "--"):
			end := strings.IndexByte(sql[i:], '\n')
			if end < 0 {
				end = len(sql) - i
			}
			out.WriteString(sql[i : i+end])
			i += end - 1
		case c == '/' && strings.HasPrefix(sql[i:], "/*"):
			end := strings.Index(sql[i+2:], "*/")
			if end < 0 {
				return "", errors.NewInvalidInputf(ErrCodeUnrenderable, "an unterminated comment")
			}
			out.WriteString(sql[i : i+2+end+2])
			i += 2 + end + 1
		case c == '`':
			name, end, err := backtickName(sql, i)
			if err != nil {
				return "", err
			}
			quoted, err := Ident(name)
			if err != nil {
				return "", err
			}
			out.WriteString(quoted)
			i = end - 1
		default:
			out.WriteByte(c)
		}
	}
	return out.String(), nil
}

func backtickName(sql string, start int) (string, int, error) {
	var name strings.Builder
	for i := start + 1; i < len(sql); i++ {
		switch c := sql[i]; {
		case c == '`':
			return name.String(), i + 1, nil
		case c == '\\' && strings.HasPrefix(sql[i:], `\x24`):
			name.WriteByte('$')
			i += 3
		case c == '\\' && i+1 < len(sql):
			name.WriteByte(sql[i+1])
			i++
		default:
			name.WriteByte(c)
		}
	}
	return "", 0, errors.NewInvalidInputf(ErrCodeUnrenderable, "an unterminated identifier")
}
