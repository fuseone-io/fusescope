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

// runUnderLease runs fn while holder keeps the lease name, renewed every quarter of its
// duration; fn's context is cancelled once the lease is lost. Nothing runs while another
// backend holds it. The lease is released, by letting it expire, once fn returns.
func runUnderLease(ctx context.Context, store archivetypes.Store, logger *slog.Logger, name string, holder string, duration time.Duration, fn func(ctx context.Context, lease *archivetypes.Lease) error) error {
	lease, err := store.AcquireLease(ctx, name, holder, time.Now().Add(duration))
	if err != nil {
		if errors.Asc(err, archivetypes.ErrCodeLeaseHeld) {
			logger.DebugContext(ctx, "archive lease held by another backend", slog.String("lease", name))
			return nil
		}
		return err
	}

	leaseCtx, cancel := context.WithCancel(ctx)
	renewed := make(chan struct{})
	go func() {
		defer close(renewed)
		renewLease(leaseCtx, cancel, store, logger, name, holder, duration, lease.ExpiresAt)
	}()

	err = fn(leaseCtx, lease)
	cancel()
	<-renewed

	if _, releaseErr := store.AcquireLease(context.WithoutCancel(ctx), name, holder, time.Now()); releaseErr != nil && !errors.Asc(releaseErr, archivetypes.ErrCodeLeaseHeld) {
		logger.WarnContext(ctx, "archive lease not released, it expires on its own", slog.String("lease", name), errors.Attr(releaseErr))
	}
	return err
}

// renewLease gives the lease up once another holder has it, or once it would expire before
// the next renewal. A renewal failing in between is retried.
func renewLease(ctx context.Context, cancel context.CancelFunc, store archivetypes.Store, logger *slog.Logger, name string, holder string, duration time.Duration, expiresAt time.Time) {
	interval := duration / 4
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		renewedUntil := time.Now().Add(duration)
		_, err := store.AcquireLease(ctx, name, holder, renewedUntil)
		if err == nil {
			expiresAt = renewedUntil
			continue
		}
		if ctx.Err() != nil {
			return
		}
		if !errors.Asc(err, archivetypes.ErrCodeLeaseHeld) && time.Now().Add(interval).Before(expiresAt) {
			logger.WarnContext(ctx, "archive lease not renewed, retrying", slog.String("lease", name), slog.Time("expires_at", expiresAt), errors.Attr(err))
			continue
		}

		logger.WarnContext(ctx, "archive lease lost, stopping", slog.String("lease", name), errors.Attr(err))
		cancel()
		return
	}
}
