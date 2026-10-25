package archivetypes

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Store interface {
	// GetSignal returns an error of type TypeNotFound when the signal has no archive state.
	GetSignal(ctx context.Context, signal string) (*Signal, error)

	// SetBackstop records days as the signal's backstop, not yet applied.
	SetBackstop(ctx context.Context, signal string, days int) error

	MarkBackstopApplied(ctx context.Context, signal string, appliedAt time.Time) error

	// AcquireLease takes or renews the signal's lease for holder until expiresAt. A lease
	// that changes hands, or that its holder lets expire, gets a new epoch. It returns an
	// error with ErrCodeLeaseHeld while another holder's lease is valid.
	AcquireLease(ctx context.Context, signal string, holder string, expiresAt time.Time) (*Lease, error)

	CreateAttempt(ctx context.Context, attempt *Attempt) error

	AbandonAttempt(ctx context.Context, id valuer.UUID) error

	// Publish commits publication if lease is still valid at its epoch (ErrCodeLeaseLost
	// otherwise) and its attempt is pending. Published parts of the partition contained in
	// a newly published one become superseded, as do objects left with no published part.
	Publish(ctx context.Context, lease *Lease, publication *Publication) error

	// ListPublishedParts returns the published parts of a table's partition on one shard,
	// dropped from ClickHouse or not.
	ListPublishedParts(ctx context.Context, table string, shard int, partitionID string) ([]*ArchivedPart, error)

	// ListActiveObjects returns the objects holding a table's published parts.
	ListActiveObjects(ctx context.Context, table string) ([]*Object, error)
}
