package querybuildertypesv5

import "github.com/huandu/go-sqlbuilder"

// Dialect is the SQL a statement builder emits where query engines differ.
type Dialect interface {
	// Flavor binds the builder's placeholders.
	Flavor() sqlbuilder.Flavor
	// TimeBucket floors column to a multiple of seconds since the epoch.
	TimeBucket(column string, seconds int64) string
	// ToText casts expr to a string.
	ToText(expr string) string
	// InSubquery tests lhs against the rows of subquery, a parenthesised
	// SELECT or a CTE name.
	InSubquery(lhs, subquery string) string
	// TimestampRange bounds the span start to [start, end) nanoseconds.
	TimestampRange(sb *sqlbuilder.SelectBuilder, start, end uint64) []string
	// MultiIf reads the value after the first true condition of pairs,
	// condition then value, else otherwise.
	MultiIf(pairs []string, otherwise string) string
	// Regexp matches read against pattern, a bound value.
	Regexp(read, pattern string) string
	// FloatOrNull casts expr to a float, NULL when it does not parse.
	FloatOrNull(expr string) string
	// ExactFloatOrNull casts expr to a float, NULL when the value would change.
	ExactFloatOrNull(expr string) string
	// BoolOrNull casts expr to a bool, NULL when it does not convert.
	BoolOrNull(expr string) string
	// Float casts expr to a float; a read already cast stays bare.
	Float(expr string) string
	// GroupsIn keeps the rows whose groups are among the rows of cte:
	// exprs are the group expressions, aliases their select aliases, the
	// columns of cte.
	GroupsIn(exprs, aliases []string, cte string) string
	// Bind is the statement as the engine takes it: sql with its args
	// bound, or with the args rendered into it.
	Bind(sql string, args []any) (string, []any, error)
}
