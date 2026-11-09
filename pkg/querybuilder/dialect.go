package querybuilder

import (
	"fmt"

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
