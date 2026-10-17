package implauthdomain

import (
	"context"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain"
)

type service struct {
	settings   factory.ScopedProviderSettings
	reconciler authdomain.Reconciler
	interval   time.Duration
	stopC      chan struct{}
	healthyC   chan struct{}
	healthy    sync.Once
}

// NewService applies the configuration-managed auth domains at startup and every
// interval, which also covers organizations created after startup. It reports
// healthy after the first attempt: a misconfigured domain is logged, not fatal.
func NewService(providerSettings factory.ProviderSettings, reconciler authdomain.Reconciler, interval time.Duration) factory.ServiceWithHealthy {
	return &service{
		settings:   factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/authdomain/implauthdomain"),
		reconciler: reconciler,
		interval:   interval,
		stopC:      make(chan struct{}),
		healthyC:   make(chan struct{}),
	}
}

func (service *service) Start(ctx context.Context) error {
	ticker := time.NewTicker(service.interval)
	defer ticker.Stop()

	for {
		if err := service.reconciler.Reconcile(ctx); err != nil {
			service.settings.Logger().ErrorContext(ctx, "managed auth domain reconciliation failed", errors.Attr(err))
		}

		service.healthy.Do(func() { close(service.healthyC) })

		select {
		case <-service.stopC:
			return nil
		case <-ticker.C:
		}
	}
}

func (service *service) Healthy() <-chan struct{} {
	return service.healthyC
}

func (service *service) Stop(_ context.Context) error {
	close(service.stopC)
	return nil
}
