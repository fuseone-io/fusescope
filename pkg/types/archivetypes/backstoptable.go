package archivetypes

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

var ErrCodeBackstopTableNotFound = errors.MustNewCode("archive_backstop_table_not_found")

// BackstopTable is how far a backstop of BackstopDays got on one table. ModifiedAt is the
// earliest ClickHouse clock once its MODIFY TTL ran on every host: any MATERIALIZE TTL
// created since materializes the backstop.
type BackstopTable struct {
	bun.BaseModel `bun:"table:archive_backstop_table,alias:archive_backstop_table"`

	types.Identifiable
	types.TimeAuditable
	Signal         string     `bun:"signal"`
	TableName      string     `bun:"table_name"`
	BackstopDays   int        `bun:"backstop_days"`
	ModifiedAt     *time.Time `bun:"modified_at"`
	MaterializedAt *time.Time `bun:"materialized_at"`
}

type BackstopProgress interface {
	// GetBackstopTable returns an error of type TypeNotFound when table has no progress.
	GetBackstopTable(ctx context.Context, signal string, table string) (*BackstopTable, error)

	// SetBackstopTable creates or replaces the progress of its signal and table.
	SetBackstopTable(ctx context.Context, progress *BackstopTable) error
}

func NewBackstopTable(signal string, table string, backstopDays int) *BackstopTable {
	now := time.Now()
	return &BackstopTable{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		Signal:        signal,
		TableName:     table,
		BackstopDays:  backstopDays,
	}
}

// Modified reports whether the TTL of the table already carries a backstop of days.
func (progress *BackstopTable) Modified(days int) bool {
	return progress != nil && progress.BackstopDays == days && progress.ModifiedAt != nil
}

// Done reports whether a backstop of days is materialized on every part of the table.
func (progress *BackstopTable) Done(days int) bool {
	return progress.Modified(days) && progress.MaterializedAt != nil
}
