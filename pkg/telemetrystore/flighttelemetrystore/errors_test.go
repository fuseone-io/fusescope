package flighttelemetrystore

import (
	"context"
	"encoding/hex"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	spb "google.golang.org/genproto/googleapis/rpc/status"
	protobuf "google.golang.org/protobuf/proto"

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

// engineTooManyRows is the grpc-status-details-bin fusescope-engine 0.0.2 sends with a query past a
// query.max_rows of 2: a google.rpc.Status of message "result exceeded 2 rows" holding an
// ErrorInfo of reason TOO_MANY_ROWS.
const engineTooManyRows = "08081216726573756c74206578636565646564203220726f77731a4d0a28747970652e676f6f676c65617069732e636f6d2f676f6f676c652e7270632e4572726f72496e666f12210a0d544f4f5f4d414e595f524f575312106675736573636f70652d656e67696e65"

func statusFromDetails(t *testing.T, hexDetails string) error {
	raw, err := hex.DecodeString(hexDetails)
	require.NoError(t, err)
	var proto spb.Status
	require.NoError(t, protobuf.Unmarshal(raw, &proto))
	return status.ErrorProto(&proto)
}

func TestTheEnginesRowCapIsTooLarge(t *testing.T) {
	refused := statusFromDetails(t, engineTooManyRows)
	assert.Equal(t, "result exceeded 2 rows", status.Convert(refused).Message())
	err := castError(context.Background(), refused)
	assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge), "%v", err)
	assert.True(t, errors.Asc(err, ErrCodeTooManyRows), "%v", err)
}

func TestOtherResourceLimitsStayGeneric(t *testing.T) {
	other, err := status.New(codes.ResourceExhausted, "over budget").WithDetails(&errdetails.ErrorInfo{Reason: "OVER_BUDGET", Domain: engineDomain})
	require.NoError(t, err)
	foreign, err := status.New(codes.ResourceExhausted, "rows").WithDetails(&errdetails.ErrorInfo{Reason: tooManyRowsReason, Domain: "example.com"})
	require.NoError(t, err)
	for _, refused := range []error{
		status.Error(codes.ResourceExhausted, "query would scan 2 bytes, over the budget of 1"),
		other.Err(),
		foreign.Err(),
	} {
		err := castError(context.Background(), refused)
		assert.True(t, errors.Ast(err, errors.TypeTooManyRequests), "%v", err)
		assert.False(t, errors.Asc(err, ErrCodeTooManyRows), "%v", err)
	}
}
