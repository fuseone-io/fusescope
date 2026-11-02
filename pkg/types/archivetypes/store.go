package archivetypes

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Store interface {
	BackstopProgress

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
	// (ErrCodeLeaseLost otherwise), and its attempt is pending. A retry of a published attempt
	// with the same manifest commits nothing and succeeds; with another manifest it fails with
	// ErrCodeAttemptAlreadyPublished. A part name published before fails with
	// ErrCodePartAlreadyPublished. A part of the partition that another part, new or
	// published, contains at the same or a later data version becomes superseded, as do
	// objects left with no published part. It returns the table's commit sequence after
	// the commit.
	Publish(ctx context.Context, lease *Lease, publication *Publication) (int64, error)

	// ListPublishedParts returns the published parts of a table's partition on one shard,
	// dropped from ClickHouse or not.
	ListPublishedParts(ctx context.Context, table string, shard int, partitionID string) ([]*ArchivedPart, error)

	// ListActiveObjects returns the objects holding a table's published parts.
	ListActiveObjects(ctx context.Context, table string) ([]*Object, error)

	// IndexSnapshot returns a table's active objects with the commit sequence they reflect,
	// read in one snapshot.
	IndexSnapshot(ctx context.Context, table string) (*IndexSnapshot, error)
}
