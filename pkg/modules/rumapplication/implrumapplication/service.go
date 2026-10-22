package implrumapplication

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
)

const promoteRetryInterval = 30 * time.Second

type service struct {
	settings factory.ScopedProviderSettings
	module   rumapplication.Module
	config   rumapplication.Config
	stopC    chan struct{}
}

// NewService promotes the RUM fields at startup when an application exists,
// retrying until ClickHouse accepts, and flushes key and application usage.
func NewService(providerSettings factory.ProviderSettings, module rumapplication.Module, config rumapplication.Config) rumapplication.Service {
	return &service{
		settings: factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/rumapplication/implrumapplication"),
		module:   module,
		config:   config,
		stopC:    make(chan struct{}),
	}
}

func (service *service) Start(ctx context.Context) error {
	if !service.config.Enabled {
		<-service.stopC
		return nil
	}

	flush := time.NewTicker(service.config.UsageFlushInterval)
	defer flush.Stop()
	promote := time.NewTicker(promoteRetryInterval)
	defer promote.Stop()

	promoted := service.promote(ctx)
	for {
		select {
		case <-service.stopC:
			return nil
		case <-flush.C:
			_ = service.module.FlushUsage(ctx)
		case <-promote.C:
			if !promoted {
				promoted = service.promote(ctx)
			}
		}
	}
}

func (service *service) Stop(ctx context.Context) error {
	close(service.stopC)
	if service.config.Enabled {
		_ = service.module.FlushUsage(ctx)
	}
	return nil
}

func (service *service) promote(ctx context.Context) bool {
	exists, err := service.module.HasApplications(ctx)
	if err == nil && !exists {
		return false
	}
	if err == nil {
		err = service.module.PromoteFields(ctx)
	}
	if err != nil {
		service.settings.Logger().WarnContext(ctx, "rum field promotion failed, retrying", errors.Attr(err))
		return false
	}
	return true
}
