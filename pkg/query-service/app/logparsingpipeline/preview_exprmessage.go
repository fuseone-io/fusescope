package logparsingpipeline

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// exprMatchesHeader is the first line of the error a `matches` raises in an
// operator's `if` on a value that is not a string, as this module's expr
// flavour (github.com/SigNoz/expr, go.mod's replace) words it.
var exprMatchesHeader = regexp.MustCompile(`^running if expr: interface conversion: interface \{\} is (.+), not string \(1:([1-9][0-9]*)\)$`)

// normalizeExprMessage gives a failed `matches` the collector's wording.
//
// The collector builds the library with expr-lang/expr, which says
// "not []uint8" where SigNoz/expr says "not string". That is the expr drift
// approved in collector ADR 0012, decision 4 (scripts/logspipelinecompat/
// approved.txt). The rewrite applies only when the error is exactly that
// one, on one line of expression:
//   - its header names a type other than []uint8 (a byte slice matches in the
//     collector, so it has no text to align with);
//   - the expression line is followed by the cursor line, and nothing else;
//   - the cursor sits at the header's column, counted in runes as expr
//     counts it;
//   - the expression has the `matches` operator there.
//
// It then changes "not string" to "not []uint8" in the header and leaves the
// expression and the cursor byte for byte. Any other message is returned as
// it is.
func normalizeExprMessage(msg string) string {
	header, rest, ok := strings.Cut(msg, "\n")
	if !ok {
		return msg
	}
	m := exprMatchesHeader.FindStringSubmatch(header)
	if m == nil || m[1] == "[]uint8" {
		return msg
	}
	column, err := strconv.Atoi(m[2])
	if err != nil {
		return msg
	}
	exprLine, cursorLine, ok := strings.Cut(rest, "\n")
	if !ok || strings.Contains(cursorLine, "\n") {
		return msg
	}
	expr, ok := strings.CutPrefix(exprLine, " | ")
	if !ok || cursorLine != " | "+strings.Repeat(".", column-1)+"^" {
		return msg
	}
	if !matchesAt(expr, column-1) {
		return msg
	}
	return strings.Replace(header, ", not string (", ", not []uint8 (", 1) + "\n" + rest
}

// matchesAt reports whether expr has the operator `matches` at rune index i,
// as a word of its own.
func matchesAt(expr string, i int) bool {
	runes := []rune(expr)
	const op = "matches"
	n := utf8.RuneCountInString(op)
	if i < 0 || i+n > len(runes) || string(runes[i:i+n]) != op {
		return false
	}
	word := func(r rune) bool { return r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r) }
	if i > 0 && word(runes[i-1]) {
		return false
	}
	return i+n == len(runes) || !word(runes[i+n])
}
