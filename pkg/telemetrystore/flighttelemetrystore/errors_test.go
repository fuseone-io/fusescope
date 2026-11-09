package flighttelemetrystore

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// lateContext has passed its deadline before its own timer has marked it done, as when the
// gRPC deadline timer fires first.
type lateContext struct {
	context.Context
	deadline time.Time
}

func (c lateContext) Deadline() (time.Time, bool) { return c.deadline, true }

func TestADeadlineTheCallReachedFirstIsTheCallersDeadline(t *testing.T) {
	ctx := lateContext{Context: context.Background(), deadline: time.Now().Add(-time.Millisecond)}
	err := castError(ctx, status.Error(codes.DeadlineExceeded, "context deadline exceeded"))
	assert.ErrorIs(t, err, context.DeadlineExceeded)
}

func TestAnEngineTimeoutBeforeTheCallersDeadlineIsTheEngines(t *testing.T) {
	ctx := lateContext{Context: context.Background(), deadline: time.Now().Add(time.Hour)}
	err := castError(ctx, status.Error(codes.DeadlineExceeded, "query timeout"))
	assert.NotErrorIs(t, err, context.DeadlineExceeded)
	assert.ErrorContains(t, err, "fusescope-engine refused the call")
}
