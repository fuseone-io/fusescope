package flighttelemetrystore

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var ErrCodeEngine = errors.MustNewCode("telemetrystore_engine")

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
