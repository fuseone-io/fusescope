package archivetypes

import (
	"context"
	"time"
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
}
