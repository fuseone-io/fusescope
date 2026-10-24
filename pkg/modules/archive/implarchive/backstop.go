package implarchive

import (
	"context"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/archive"
	"github.com/fuseone-io/fusescope/pkg/modules/retention"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

type backstopService struct {
	settings factory.ScopedProviderSettings
	setter   retention.BackstopSetter
	store    archivetypes.Store
	config   archive.Config
	stopC    chan struct{}
	healthyC chan struct{}
}

// NewBackstopService gives the logs TTL the archive backstop (ADR 0002 §5) at startup and
// retries every archive interval until it is applied. The backstop is recorded before the
// TTL is rewritten, so a retention change made meanwhile already carries it.
func NewBackstopService(providerSettings factory.ProviderSettings, setter retention.BackstopSetter, store archivetypes.Store, config archive.Config) factory.ServiceWithHealthy {
	return &backstopService{
		settings: factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/archive/implarchive"),
		setter:   setter,
		store:    store,
		config:   config,
		stopC:    make(chan struct{}),
		healthyC: make(chan struct{}),
	}
}

func (service *backstopService) Start(ctx context.Context) error {
	close(service.healthyC)

	if !service.config.Logs.Enabled {
		select {
		case <-service.stopC:
		case <-ctx.Done():
		}
		return nil
	}

	ticker := time.NewTicker(service.config.Interval)
	defer ticker.Stop()

	for {
		if err := service.reconcile(ctx); err != nil {
			service.settings.Logger().WarnContext(ctx, "archive backstop not applied, retrying", slog.Duration("interval", service.config.Interval), errors.Attr(err))
		}

		select {
		case <-service.stopC:
			return nil
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (service *backstopService) Healthy() <-chan struct{} {
	return service.healthyC
}

func (service *backstopService) Stop(_ context.Context) error {
	close(service.stopC)
	return nil
}

func (service *backstopService) reconcile(ctx context.Context) error {
	if !service.config.Logs.Enabled {
		return nil
	}

	signal := retentiontypes.LogsTTL
	days := service.config.Logs.BackstopDays

	state, err := service.store.GetSignal(ctx, signal)
	if err != nil && !errors.Ast(err, errors.TypeNotFound) {
		return err
	}
	if !state.BackstopPending(days) {
		return nil
	}

	if err := service.store.SetBackstop(ctx, signal, days); err != nil {
		return err
	}
	if err := service.setter.ApplyArchiveBackstop(ctx, signal, days); err != nil {
		return err
	}
	if err := service.store.MarkBackstopApplied(ctx, signal, time.Now()); err != nil {
		return err
	}

	service.settings.Logger().InfoContext(ctx, "archive backstop applied", slog.String("signal", signal), slog.Int("backstop_days", days))
	return nil
}
