package implarchive

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const leaseDuration = 2 * time.Minute

func newLeaseHolder() string {
	host, err := os.Hostname()
	if err != nil {
		host = "fusescope"
	}
	return host + "/" + valuer.GenerateUUID().StringValue()
}

// runUnderLease runs fn while holder keeps the signal's lease, renewed every quarter of its
// duration; fn's context is cancelled once the lease is lost. Nothing runs while another
// backend holds it. The lease is released, by letting it expire, once fn returns.
func runUnderLease(ctx context.Context, store archivetypes.Store, logger *slog.Logger, signal string, holder string, fn func(ctx context.Context, lease *archivetypes.Lease) error) error {
	lease, err := store.AcquireLease(ctx, signal, holder, time.Now().Add(leaseDuration))
	if err != nil {
		if errors.Asc(err, archivetypes.ErrCodeLeaseHeld) {
			logger.DebugContext(ctx, "archive lease held by another backend", slog.String("signal", signal))
			return nil
		}
		return err
	}

	leaseCtx, cancel := context.WithCancel(ctx)
	renewed := make(chan struct{})
	go func() {
		defer close(renewed)
		renewLease(leaseCtx, cancel, store, logger, signal, holder)
	}()

	err = fn(leaseCtx, lease)
	cancel()
	<-renewed

	if _, releaseErr := store.AcquireLease(context.WithoutCancel(ctx), signal, holder, time.Now()); releaseErr != nil && !errors.Asc(releaseErr, archivetypes.ErrCodeLeaseHeld) {
		logger.WarnContext(ctx, "archive lease not released, it expires on its own", slog.String("signal", signal), errors.Attr(releaseErr))
	}
	return err
}

func renewLease(ctx context.Context, cancel context.CancelFunc, store archivetypes.Store, logger *slog.Logger, signal string, holder string) {
	ticker := time.NewTicker(leaseDuration / 4)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		if _, err := store.AcquireLease(ctx, signal, holder, time.Now().Add(leaseDuration)); err != nil {
			if ctx.Err() == nil {
				logger.WarnContext(ctx, "archive lease lost, stopping", slog.String("signal", signal), errors.Attr(err))
			}
			cancel()
			return
		}
	}
}
