package archivetypes

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

var ErrCodeLeaseHeld = errors.MustNewCode("archive_lease_held")

// Lease makes one backend the archive executor of a signal. Epoch grows each time the lease
// changes hands, and fences commits (ADR 0002 §3).
type Lease struct {
	bun.BaseModel `bun:"table:archive_lease,alias:archive_lease"`

	types.Identifiable
	types.TimeAuditable
	Signal    string    `bun:"signal"`
	Holder    string    `bun:"holder"`
	Epoch     int64     `bun:"epoch"`
	ExpiresAt time.Time `bun:"expires_at"`
}

func NewLease(signal string, holder string, expiresAt time.Time) *Lease {
	now := time.Now()
	return &Lease{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		Signal:        signal,
		Holder:        holder,
		Epoch:         1,
		ExpiresAt:     expiresAt.UTC(),
	}
}
