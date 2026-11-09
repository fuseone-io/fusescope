// Package datafusionsql renders literals and identifiers for statements sent to fusescope-engine,
// whose DataFusion parser reads the PostgreSQL dialect. Every value from input reaches an engine
// statement through it.
//
// In that dialect a string literal is closed only by a quote not followed by another: a quote is
// written twice and a backslash is an ordinary character, since escape-string literals (the E
// prefix) are never produced. A quoted identifier follows the same rule with double quotes and
// keeps its case. A negative number is parenthesised, so a minus written before it cannot form a
// comment. NUL and invalid UTF-8 are refused rather than rendered.
package datafusionsql

import (
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeUnrenderable = errors.MustNewCode("datafusionsql_unrenderable")

// String renders s as a string literal.
func String(s string) (string, error) {
	if err := check(s); err != nil {
		return "", err
	}
	return "'" + strings.ReplaceAll(s, "'", "''") + "'", nil
}

// Ident renders name as one quoted identifier: a dot inside it does not qualify it.
func Ident(name string) (string, error) {
	if name == "" {
		return "", errors.NewInvalidInputf(ErrCodeUnrenderable, "empty identifier")
	}
	if err := check(name); err != nil {
		return "", err
	}
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`, nil
}

func Int(v int64) string { return signed(strconv.FormatInt(v, 10)) }

func Uint(v uint64) string { return strconv.FormatUint(v, 10) }

// Float renders v in its shortest exact form; NaN and the infinities have no literal.
func Float(v float64) (string, error) {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return "", errors.NewInvalidInputf(ErrCodeUnrenderable, "%v has no SQL literal", v)
	}
	return signed(strconv.FormatFloat(v, 'g', -1, 64)), nil
}

func signed(number string) string {
	if strings.HasPrefix(number, "-") {
		return "(" + number + ")"
	}
	return number
}

func Bool(v bool) string { return strconv.FormatBool(v) }

func check(s string) error {
	if !utf8.ValidString(s) {
		return errors.NewInvalidInputf(ErrCodeUnrenderable, "a value that is not valid UTF-8")
	}
	if strings.IndexByte(s, 0) >= 0 {
		return errors.NewInvalidInputf(ErrCodeUnrenderable, "a value holding a NUL character")
	}
	return nil
}
