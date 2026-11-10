package flighttelemetrystore

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	ErrCodeEngine = errors.MustNewCode("telemetrystore_engine")
	// ErrCodeTooManyRows is an answer past the engine's query.max_rows.
	ErrCodeTooManyRows = errors.MustNewCode("telemetrystore_too_many_rows")
)

// The engine's stable discriminator: a google.rpc.ErrorInfo in the status details, never the text.
const (
	engineDomain      = "fusescope-engine"
	tooManyRowsReason = "TOO_MANY_ROWS"
)

// castError keeps a context error as it is, so callers that test for a deadline find it, and
// gives an engine status the error type its code means. The gRPC deadline timer can fire before
// the context's own, so a DeadlineExceeded once the caller's deadline has passed is the caller's. The engine's message is not carried: it
// may name SQL, columns or paths, and the error can reach the API.
func castError(ctx context.Context, err error) error {
	if err == nil {
		return nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return ctxErr
	}
	st, ok := status.FromError(err)
	if !ok {
		return errors.NewInternalf(ErrCodeEngine, "fusescope-engine is unreachable")
	}
	if deadline, set := ctx.Deadline(); set && st.Code() == codes.DeadlineExceeded && !time.Now().Before(deadline) {
		return context.DeadlineExceeded
	}
	if st.Code() == codes.ResourceExhausted && hasReason(st, tooManyRowsReason) {
		return errors.Newf(errors.TypePayloadTooLarge, ErrCodeTooManyRows, "the answer passes the engine's row cap")
	}
	typ := errors.TypeInternal
	switch st.Code() {
	case codes.InvalidArgument:
		typ = errors.TypeInvalidInput
	case codes.NotFound:
		typ = errors.TypeNotFound
	case codes.Unauthenticated:
		typ = errors.TypeUnauthenticated
	case codes.PermissionDenied:
		typ = errors.TypeForbidden
	case codes.ResourceExhausted:
		typ = errors.TypeTooManyRequests
	case codes.DeadlineExceeded:
		typ = errors.TypeTimeout
	case codes.Canceled:
		typ = errors.TypeCanceled
	case codes.Unimplemented:
		typ = errors.TypeUnsupported
	}
	return errors.Newf(typ, ErrCodeEngine, "fusescope-engine refused the call: %s", st.Code())
}

func hasReason(st *status.Status, reason string) bool {
	for _, detail := range st.Details() {
		if info, ok := detail.(*errdetails.ErrorInfo); ok && info.GetDomain() == engineDomain && info.GetReason() == reason {
			return true
		}
	}
	return false
}
