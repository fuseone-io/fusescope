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
}
