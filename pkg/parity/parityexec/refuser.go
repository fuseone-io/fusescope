// Package parityexec runs the trace views on two independent module graphs, one over ClickHouse and
// one over fusescope-engine, and says what each pair's outcome is.
package parityexec

import (
	"context"
	"sync"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrystoretypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// ErrCodeFallbackAttempted is a ClickHouse call made by the engine graph.
var ErrCodeFallbackAttempted = errors.MustNewCode("parity_fallback_attempted")

type pairKey struct{}

// WithPair names the pair a call belongs to, so a refused call is counted against it.
func WithPair(ctx context.Context, index int) context.Context {
	return context.WithValue(ctx, pairKey{}, index)
}

// Refuser is the ClickHouse of the engine graph: every call is refused and counted against the
// pair its context names. The querier rewraps ClickHouse errors, so the count, not the error, is
// what proves a fallback.
type Refuser struct {
	mu           sync.Mutex
	touches      map[int]int
	unattributed int
}

func NewRefuser() *Refuser {
	return &Refuser{touches: map[int]int{}}
}

func (r *Refuser) refuse(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if index, ok := ctx.Value(pairKey{}).(int); ok {
		r.touches[index]++
	} else {
		r.unattributed++
	}
	return errors.Newf(errors.TypeForbidden, ErrCodeFallbackAttempted, "the engine graph has no ClickHouse")
}

// Touches is how many ClickHouse calls the pair index made.
func (r *Refuser) Touches(index int) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.touches[index]
}

// Unattributed is how many ClickHouse calls named no pair.
func (r *Refuser) Unattributed() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.unattributed
}

func (r *Refuser) ClickhouseDB() clickhouse.Conn { return refusingConn{r} }
func (r *Refuser) Cluster() string               { return "" }

func (r *Refuser) Estimate(ctx context.Context, _ string, _ ...any) ([]telemetrystoretypes.EstimateEntry, error) {
	return nil, r.refuse(ctx)
}

func (r *Refuser) Plan(ctx context.Context, _ string, _ ...any) error { return r.refuse(ctx) }

func (r *Refuser) Indexes(ctx context.Context, _ string, _ ...any) (telemetrystoretypes.Granules, bool, error) {
	return telemetrystoretypes.Granules{}, false, r.refuse(ctx)
}

// Builder is the ClickHouse trace builder of the engine graph's querier: it refuses to build.
func (r *Refuser) Builder() qbtypes.StatementBuilder[qbtypes.TraceAggregation] {
	return refusingBuilder{r}
}

type refusingBuilder struct{ r *Refuser }

func (b refusingBuilder) Build(ctx context.Context, _ valuer.UUID, _, _ uint64, _ qbtypes.RequestType, _ qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation], _ map[string]qbtypes.VariableItem) (*qbtypes.Statement, error) {
	return nil, b.r.refuse(ctx)
}

type refusingConn struct{ r *Refuser }

func (c refusingConn) Contributors() []string { return nil }
func (c refusingConn) ServerVersion() (*driver.ServerVersion, error) {
	return nil, c.r.refuse(context.Background())
}
func (c refusingConn) Select(ctx context.Context, _ any, _ string, _ ...any) error {
	return c.r.refuse(ctx)
}
func (c refusingConn) Query(ctx context.Context, _ string, _ ...any) (driver.Rows, error) {
	return nil, c.r.refuse(ctx)
}
func (c refusingConn) QueryRow(ctx context.Context, _ string, _ ...any) driver.Row {
	return refusedRow{c.r.refuse(ctx)}
}
func (c refusingConn) PrepareBatch(ctx context.Context, _ string, _ ...driver.PrepareBatchOption) (driver.Batch, error) {
	return nil, c.r.refuse(ctx)
}
func (c refusingConn) Exec(ctx context.Context, _ string, _ ...any) error { return c.r.refuse(ctx) }
func (c refusingConn) AsyncInsert(ctx context.Context, _ string, _ bool, _ ...any) error {
	return c.r.refuse(ctx)
}
func (c refusingConn) Ping(ctx context.Context) error { return c.r.refuse(ctx) }
func (c refusingConn) Stats() driver.Stats            { return driver.Stats{} }
func (c refusingConn) Close() error                   { return nil }

type refusedRow struct{ err error }

func (r refusedRow) Err() error           { return r.err }
func (r refusedRow) Scan(...any) error    { return r.err }
func (r refusedRow) ScanStruct(any) error { return r.err }
