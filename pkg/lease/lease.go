// Package lease elects one backend of a deployment to run a named piece of
// work, through a lease row kept in the SQL store.
package lease

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const releaseTimeout = 5 * time.Second

var (
	// ErrCodeHeld is returned by Run while another holder has the lease;
	// callers retry later.
	ErrCodeHeld = errors.MustNewCode("lease_held")
	// ErrCodeLost is the cause of a callback context cancelled because the
	// lease was taken, fenced or about to expire.
	ErrCodeLost = errors.MustNewCode("lease_lost")
)

// Lease is a holder's claim at an epoch. The epoch grows with every
// acquisition, so work stamped with it can be fenced once a newer holder
// takes over.
type Lease struct {
	Name   string
	Holder string
	Epoch  int64
}

// Runner runs work under leases it holds for duration, renewed every quarter
// of it. Work stops three quarters of a duration after the last successful
// acquisition or renewal, leaving a margin before the database expiry; the
// epoch stays the definitive fence.
type Runner struct {
	store     *store
	logger    *slog.Logger
	holder    string
	duration  time.Duration
	newTicker func(interval time.Duration) (<-chan time.Time, func())
}

func New(settings factory.ProviderSettings, sqlstore sqlstore.SQLStore, duration time.Duration) (*Runner, error) {
	if duration/4 <= 0 {
		return nil, errors.NewInvalidInputf(errors.CodeInvalidInput, "the lease duration %s is too short to renew", duration)
	}
	scoped := factory.NewScopedProviderSettings(settings, "github.com/fuseone-io/fusescope/pkg/lease")
	return &Runner{
		store:     newStore(sqlstore),
		logger:    scoped.Logger(),
		holder:    newHolder(),
		duration:  duration,
		newTicker: newTicker,
	}, nil
}

// Holder identifies this runner in the lease rows it writes.
func (runner *Runner) Holder() string {
	return runner.holder
}

// Run runs fn while the runner holds the lease name, and returns fn's error,
// or one with ErrCodeHeld when another holder has it. fn's context is
// cancelled, with an ErrCodeLost cause, once the lease is lost or would
// expire before a renewal succeeds. The lease is released once fn returns.
func (runner *Runner) Run(ctx context.Context, name string, fn func(ctx context.Context, lease Lease) error) error {
	acquiring := time.Now()
	lease, err := runner.store.acquire(ctx, name, runner.holder, runner.duration)
	if err != nil {
		return err
	}

	leaseCtx, cancel := context.WithCancelCause(ctx)
	kept := make(chan struct{})
	go func() {
		defer close(kept)
		runner.keep(leaseCtx, cancel, lease, acquiring.Add(runner.window()))
	}()

	err = fn(leaseCtx, lease)
	cancel(context.Canceled)
	<-kept

	releaseCtx, cancelRelease := context.WithTimeout(context.WithoutCancel(ctx), releaseTimeout)
	defer cancelRelease()
	if releaseErr := runner.store.release(releaseCtx, lease); releaseErr != nil {
		runner.logger.WarnContext(ctx, "lease not released, it expires on its own", slog.String("lease", name), slog.Int64("epoch", lease.Epoch), errors.Attr(releaseErr))
	}
	return err
}

// window is how long work may go on after a successful acquisition or renewal.
func (runner *Runner) window() time.Duration {
	return runner.duration * 3 / 4
}

// keep renews the lease until ctx ends. stopAt is a window after the local
// time taken before the last request whose database time set the expiry, so
// it comes a quarter of a duration before that expiry.
func (runner *Runner) keep(ctx context.Context, cancel context.CancelCauseFunc, lease Lease, stopAt time.Time) {
	interval := runner.duration / 4
	ticks, stop := runner.newTicker(interval)
	defer stop()
	expiry := time.NewTimer(time.Until(stopAt))
	defer expiry.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-expiry.C:
			runner.logger.WarnContext(ctx, "lease not renewed within its safety window, stopping", slog.String("lease", lease.Name), slog.Int64("epoch", lease.Epoch))
			cancel(errors.Newf(errors.TypeCanceled, ErrCodeLost, "the lease %s was not renewed in time at epoch %d", lease.Name, lease.Epoch))
			return
		case <-ticks:
		}

		renewing := time.Now()
		renewCtx, cancelRenew := context.WithDeadline(ctx, stopAt)
		err := runner.store.renew(renewCtx, lease, runner.duration)
		cancelRenew()
		switch {
		case err == nil:
			stopAt = renewing.Add(runner.window())
			expiry.Reset(time.Until(stopAt))
		case ctx.Err() != nil:
			return
		case errors.Asc(err, ErrCodeLost):
			runner.logger.WarnContext(ctx, "lease lost, stopping", slog.String("lease", lease.Name), slog.Int64("epoch", lease.Epoch))
			cancel(err)
			return
		case time.Now().Add(interval).Before(stopAt):
			runner.logger.WarnContext(ctx, "lease not renewed, retrying", slog.String("lease", lease.Name), slog.Time("stop_at", stopAt), errors.Attr(err))
		default:
			runner.logger.WarnContext(ctx, "lease not renewed within its safety window, stopping", slog.String("lease", lease.Name), errors.Attr(err))
			cancel(errors.Wrapf(err, errors.TypeCanceled, ErrCodeLost, "the lease %s leaves its safety window before the next renewal", lease.Name))
			return
		}
	}
}

func newHolder() string {
	host, err := os.Hostname()
	if err != nil {
		host = "fusescope"
	}
	return host + "/" + valuer.GenerateUUID().StringValue()
}

func newTicker(interval time.Duration) (<-chan time.Time, func()) {
	ticker := time.NewTicker(interval)
	return ticker.C, ticker.Stop
}
