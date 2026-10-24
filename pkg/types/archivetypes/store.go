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
}
