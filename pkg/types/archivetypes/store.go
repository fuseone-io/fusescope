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

	// AbandonAttempt fails with ErrCodeAttemptNotPending unless the attempt is pending.
	AbandonAttempt(ctx context.Context, id valuer.UUID) error

	// Publish commits publication if lease is still valid at its epoch and is the attempt's
	// (ErrCodeLeaseLost otherwise), and its attempt is pending (ErrCodeAttemptAlreadyPublished
	// when it is published already). A part name published before fails with
	// ErrCodePartAlreadyPublished. A part of the partition that another part, new or
	// published, contains at the same or a later data version becomes superseded, as do
	// objects left with no published part.
	Publish(ctx context.Context, lease *Lease, publication *Publication) error

	// ListPublishedParts returns the published parts of a table's partition on one shard,
	// dropped from ClickHouse or not.
	ListPublishedParts(ctx context.Context, table string, shard int, partitionID string) ([]*ArchivedPart, error)

	// ListActiveObjects returns the objects holding a table's published parts.
	ListActiveObjects(ctx context.Context, table string) ([]*Object, error)

	// IndexSnapshot returns a table's active objects with the number of commits they reflect,
	// read together.
	IndexSnapshot(ctx context.Context, table string) (*IndexSnapshot, error)

	CreateRehydration(ctx context.Context, rehydration *Rehydration) error

	// GetRehydration returns an error with ErrCodeRehydrationNotFound when id doesn't exist.
	GetRehydration(ctx context.Context, id valuer.UUID) (*Rehydration, error)

	// NextRehydration returns the signal's oldest restoration still pending or loading, or an
	// error with ErrCodeRehydrationNotFound when there is none.
	NextRehydration(ctx context.Context, signal string) (*Rehydration, error)

	// UpdateRehydration writes the restoration's status, totals, DDL and failure.
	UpdateRehydration(ctx context.Context, rehydration *Rehydration) error

	// ListRestorableParts returns the published parts of table on day (YYYY-MM-DD) held by
	// active objects, with their objects and attempts.
	ListRestorableParts(ctx context.Context, table string, day string) ([]RestorablePart, error)
}
