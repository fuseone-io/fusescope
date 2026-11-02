package archivetypes

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

var ErrCodeSignalNotFound = errors.MustNewCode("archive_signal_not_found")

// Signal is the archive state of one signal. BackstopDays is the backstop the live TTL
// carries, or is being given while AppliedAt is nil.
type Signal struct {
	bun.BaseModel `bun:"table:archive_signal,alias:archive_signal"`

	types.Identifiable
	types.TimeAuditable
	Signal       string     `bun:"signal"`
	BackstopDays int        `bun:"backstop_days"`
	AppliedAt    *time.Time `bun:"applied_at"`
	ExtendedAt   *time.Time `bun:"extended_at"`
}

func NewSignal(signal string, backstopDays int) *Signal {
	now := time.Now()
	return &Signal{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		Signal:        signal,
		BackstopDays:  backstopDays,
	}
}

// BackstopPending reports whether the live TTL still has to be given a backstop of days.
func (signal *Signal) BackstopPending(days int) bool {
	return signal == nil || signal.AppliedAt == nil || signal.BackstopDays != days
}
