package implarchive

import (
	"context"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/archive"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

const maxRestorePollInterval = 10 * time.Second

type restoreService struct {
	settings factory.ScopedProviderSettings
	store    archivetypes.Store
	restorer *restorer
	interval time.Duration
	holder   string
	stopC    chan struct{}
	healthyC chan struct{}
}

// NewRestoreService loads pending restorations of the logs archive, one at a time across
// backends. Restorations are recorded by whoever requests them; this service only loads.
func NewRestoreService(providerSettings factory.ProviderSettings, telemetryStore telemetrystore.TelemetryStore, store archivetypes.Store, config archive.Config) factory.ServiceWithHealthy {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/archive/implarchive")
	return &restoreService{
		settings: settings,
		store:    store,
		restorer: &restorer{telemetryStore: telemetryStore, store: store, limits: config.Limits, logger: settings.Logger()},
		interval: min(config.Interval, maxRestorePollInterval),
		holder:   newLeaseHolder(),
		stopC:    make(chan struct{}),
		healthyC: make(chan struct{}),
	}
}

func (service *restoreService) Start(ctx context.Context) error {
	close(service.healthyC)

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		select {
		case <-service.stopC:
			cancel()
		case <-ctx.Done():
		}
	}()

	ticker := time.NewTicker(service.interval)
	defer ticker.Stop()
	for {
		if err := service.restorePending(ctx); err != nil && ctx.Err() == nil {
			service.settings.Logger().WarnContext(ctx, "archive restorations not loaded, retrying", slog.Duration("interval", service.interval), errors.Attr(err))
		}

		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (service *restoreService) Healthy() <-chan struct{} {
	return service.healthyC
}

func (service *restoreService) Stop(_ context.Context) error {
	close(service.stopC)
	return nil
}

// restorePending reads before taking the lease, so idle backends don't write every tick.
func (service *restoreService) restorePending(ctx context.Context) error {
	signal := retentiontypes.LogsTTL
	if _, err := service.store.NextRehydration(ctx, signal); err != nil {
		if errors.Asc(err, archivetypes.ErrCodeRehydrationNotFound) {
			return nil
		}
		return err
	}

	return runUnderLease(ctx, service.store, service.settings.Logger(), archivetypes.RestoreLease(signal), service.holder, leaseDuration, func(ctx context.Context, _ *archivetypes.Lease) error {
		for ctx.Err() == nil {
			rehydration, err := service.store.NextRehydration(ctx, signal)
			if err != nil {
				if errors.Asc(err, archivetypes.ErrCodeRehydrationNotFound) {
					return nil
				}
				return err
			}
			if err := service.restorer.Restore(ctx, rehydration); err != nil {
				return err
			}
			service.settings.Logger().InfoContext(ctx, "restoration loaded", slog.String("rehydration_id", rehydration.ID.StringValue()), slog.String("status", rehydration.Status), slog.Int64("rows", rehydration.Rows))
		}
		return nil
	})
}
