package implwatchdog

import (
	"context"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/anomaly/anomalyquerier"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/lease"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/modules/watchdog"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/featuretypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	leaseName     = "watchdog/scheduler"
	leaseDuration = time.Minute
	cycleInterval = 5 * time.Minute
	// retentionInterval spaces the deletions of expired issues.
	retentionInterval = time.Hour
	retentionTimeout  = time.Minute
)

type service struct {
	settings      factory.ScopedProviderSettings
	providers     factory.ProviderSettings
	flagger       flagger.Flagger
	runner        *lease.Runner
	module        watchdog.Module
	orgGetter     organization.Getter
	newSession    func() evaluateFunc
	retryInterval time.Duration
	stopC         chan struct{}
}

// NewService runs Watchdog cycles in the one backend holding the
// watchdog/scheduler lease, while the watchdog feature is enabled.
func NewService(providerSettings factory.ProviderSettings, flagger flagger.Flagger, sqlStore sqlstore.SQLStore, telemetryStore telemetrystore.TelemetryStore, orgGetter organization.Getter, evaluator *anomalyquerier.Evaluator, module watchdog.Module, maxSeries int) (watchdog.Service, error) {
	runner, err := lease.New(providerSettings, sqlStore, leaseDuration)
	if err != nil {
		return nil, err
	}
	org, err := newOrgEvaluator(providerSettings, evaluator, newTelemetryExceptionReader(telemetryStore), module, maxSeries)
	if err != nil {
		return nil, err
	}
	return newService(providerSettings, flagger, runner, module, orgGetter, org.newSession), nil
}

// newService builds a scheduler on newSession's evaluation for each lease
// session.
func newService(providerSettings factory.ProviderSettings, flagger flagger.Flagger, runner *lease.Runner, module watchdog.Module, orgGetter organization.Getter, newSession func() evaluateFunc) *service {
	return &service{
		settings:      factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/watchdog/implwatchdog"),
		providers:     providerSettings,
		flagger:       flagger,
		runner:        runner,
		module:        module,
		orgGetter:     orgGetter,
		newSession:    newSession,
		retryInterval: leaseDuration,
		stopC:         make(chan struct{}),
	}
}

// Start tries to take the lease every retryInterval and, once it holds it,
// leads until the lease is lost, the feature is disabled or the service
// stops.
func (service *service) Start(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		select {
		case <-service.stopC:
			cancel()
		case <-ctx.Done():
		}
	}()

	ticker := time.NewTicker(service.retryInterval)
	defer ticker.Stop()
	for {
		if service.enabled(ctx) {
			err := service.runner.Run(ctx, leaseName, service.lead)
			if err != nil && ctx.Err() == nil && !errors.Asc(err, lease.ErrCodeHeld) {
				service.settings.Logger().WarnContext(ctx, "watchdog scheduler stopped leading", errors.Attr(err))
			}
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (service *service) Stop(_ context.Context) error {
	close(service.stopC)
	return nil
}

func (service *service) lead(ctx context.Context, held lease.Lease) error {
	scheduler, err := newScheduler(service.providers, service.orgGetter, service.newSession())
	if err != nil {
		return err
	}
	service.settings.Logger().InfoContext(ctx, "watchdog scheduler leading", slog.Int64("epoch", held.Epoch))

	ticker := time.NewTicker(cycleInterval)
	defer ticker.Stop()
	var lastRetention time.Time
	for {
		if !service.enabled(ctx) {
			return nil
		}
		now := time.Now()
		report := scheduler.runCycle(ctx, now)
		service.settings.Logger().InfoContext(ctx, "watchdog cycle finished", slog.Int(orgEvaluated, report[orgEvaluated]), slog.Int(orgSkippedDeadline, report[orgSkippedDeadline]), slog.Int(orgError, report[orgError]))
		if now.Sub(lastRetention) >= retentionInterval {
			service.deleteExpiredIssues(ctx, now)
			lastRetention = now
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (service *service) deleteExpiredIssues(ctx context.Context, now time.Time) {
	ctx, cancel := context.WithTimeout(ctx, retentionTimeout)
	defer cancel()
	if _, err := service.module.DeleteExpiredIssues(ctx, now); err != nil {
		service.settings.Logger().WarnContext(ctx, "couldn't delete expired watchdog issues", errors.Attr(err))
	}
}

func (service *service) enabled(ctx context.Context) bool {
	return service.flagger.BooleanOrEmpty(ctx, flagger.FeatureWatchdog, featuretypes.NewFlaggerEvaluationContext(valuer.UUID{}))
}
