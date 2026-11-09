package querybuilder

import (
	"fmt"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/datafusionsql"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/huandu/go-sqlbuilder"
)

// Target is what a statement builder instance renders for: the dialect,
// the storage that resolves fields to columns, and the table of spans.
// Each instance has its own, so one process can serve some routes from
// one engine and the rest from another.
type Target struct {
	Dialect    qbtypes.Dialect
	Storage    qbtypes.Storage
	SpansTable string
	// ContextColumns are the attribute bags a raw list selects whole.
	ContextColumns []string
	// InlineResource filters resource keys in the main WHERE, with no
	// fingerprint sub-query.
	InlineResource bool
}

// DialectOf is the dialect q renders in; ClickHouse when q names none.
func DialectOf(q qbtypes.QueryInfo) qbtypes.Dialect {
	if q.Dialect == nil {
		return ClickHouse{}
	}
	return q.Dialect
}

// ClickHouse is the dialect of the ClickHouse telemetry store.
type ClickHouse struct{}

var _ qbtypes.Dialect = ClickHouse{}

func (ClickHouse) Flavor() sqlbuilder.Flavor { return sqlbuilder.ClickHouse }

func (ClickHouse) TimeBucket(column string, seconds int64) string {
	return fmt.Sprintf("toStartOfInterval(%s, INTERVAL %d SECOND)", column, seconds)
}

func (ClickHouse) ToText(expr string) string { return fmt.Sprintf("toString(%s)", expr) }

func (ClickHouse) InSubquery(lhs, subquery string) string {
	return fmt.Sprintf("%s GLOBAL IN %s", lhs, subquery)
}

func (ClickHouse) TimestampRange(sb *sqlbuilder.SelectBuilder, start, end uint64) []string {
	return []string{sb.GE("timestamp", fmt.Sprintf("%d", start)), sb.L("timestamp", fmt.Sprintf("%d", end))}
}

func (ClickHouse) MultiIf(pairs []string, otherwise string) string {
	return fmt.Sprintf("multiIf(%s, %s)", strings.Join(pairs, ", "), otherwise)
}

func (ClickHouse) Regexp(read, pattern string) string {
	return fmt.Sprintf("match(%s, %s)", read, pattern)
}

func (ClickHouse) FloatOrNull(expr string) string { return fmt.Sprintf("toFloat64OrNull(%s)", expr) }

func (ClickHouse) ExactFloatOrNull(expr string) string {
	return fmt.Sprintf("accurateCastOrNull(%s, 'Float64')", expr)
}

func (ClickHouse) BoolOrNull(expr string) string {
	return fmt.Sprintf("accurateCastOrNull(%s, 'Bool')", expr)
}

// Float leaves a toFloat64OrNull read bare: the wrapper would hide it from its skip index.
func (ClickHouse) Float(expr string) string {
	if strings.HasPrefix(expr, "toFloat64OrNull(") {
		return expr
	}
	return fmt.Sprintf("toFloat64(%s)", expr)
}

func (ClickHouse) Bind(sql string, args []any) (string, []any, error) { return sql, args, nil }

func (ClickHouse) GroupsIn(_, aliases []string, cte string) string {
	columns := strings.Join(aliases, ", ")
	return fmt.Sprintf("(%s) GLOBAL IN (SELECT %s FROM %s)", columns, columns, cte)
}

// DataFusion is the dialect of fusescope-engine. Placeholders stay ? and
// become literals through datafusionsql.Interpolate before a statement
// leaves, since the engine takes no parameters.
type DataFusion struct{}

var _ qbtypes.Dialect = DataFusion{}

func (DataFusion) Flavor() sqlbuilder.Flavor { return sqlbuilder.ClickHouse }

func (DataFusion) TimeBucket(column string, seconds int64) string {
	return fmt.Sprintf("date_bin(INTERVAL '%d seconds', %s)", seconds, column)
}

func (DataFusion) ToText(expr string) string { return fmt.Sprintf("CAST(%s AS VARCHAR)", expr) }

func (DataFusion) InSubquery(lhs, subquery string) string {
	return fmt.Sprintf("%s IN %s", lhs, subquery)
}

func (DataFusion) TimestampRange(sb *sqlbuilder.SelectBuilder, start, end uint64) []string {
	return []string{
		fmt.Sprintf("timestamp >= to_timestamp_nanos(%s)", sb.Var(start)),
		fmt.Sprintf("timestamp < to_timestamp_nanos(%s)", sb.Var(end)),
	}
}

func (DataFusion) MultiIf(pairs []string, otherwise string) string {
	var b strings.Builder
	b.WriteString("CASE")
	for i := 0; i+1 < len(pairs); i += 2 {
		fmt.Fprintf(&b, " WHEN %s THEN %s", pairs[i], pairs[i+1])
	}
	fmt.Fprintf(&b, " ELSE %s END", otherwise)
	return b.String()
}

func (DataFusion) Regexp(read, pattern string) string {
	return fmt.Sprintf("regexp_like(%s, %s)", read, pattern)
}

func (DataFusion) FloatOrNull(expr string) string { return fmt.Sprintf("TRY_CAST(%s AS DOUBLE)", expr) }

func (DataFusion) ExactFloatOrNull(expr string) string {
	return fmt.Sprintf("TRY_CAST(%s AS DOUBLE)", expr)
}

func (DataFusion) BoolOrNull(expr string) string { return fmt.Sprintf("TRY_CAST(%s AS BOOLEAN)", expr) }

// Float reads NULL where a string does not parse, as an empty derived
// column would otherwise fail the query.
func (DataFusion) Float(expr string) string {
	if strings.HasPrefix(expr, "TRY_CAST(") && strings.HasSuffix(expr, " AS DOUBLE)") {
		return expr
	}
	return fmt.Sprintf("TRY_CAST(%s AS DOUBLE)", expr)
}

// Bind renders the args into sql, since the engine takes no parameters.
func (DataFusion) Bind(sql string, args []any) (string, []any, error) {
	quoted, err := datafusionsql.BacktickIdentifiers(sql)
	if err != nil {
		return "", nil, err
	}
	bound, err := datafusionsql.Interpolate(quoted, args)
	return bound, nil, err
}

// GroupsIn matches the group expressions, since a select alias is not in
// scope in WHERE; a NULL group matches a NULL group, as it groups.
func (DataFusion) GroupsIn(exprs, aliases []string, cte string) string {
	matches := make([]string, len(exprs))
	for i := range exprs {
		matches[i] = fmt.Sprintf("(__groups.%s IS NOT DISTINCT FROM %s)", aliases[i], exprs[i])
	}
	return fmt.Sprintf("EXISTS (SELECT 1 FROM %s __groups WHERE %s)", cte, strings.Join(matches, " AND "))
}
