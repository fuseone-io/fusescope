package implretention

import (
	"context"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/modules/retention"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

type defaultsService struct {
	settings  factory.ScopedProviderSettings
	setter    retention.TTLSetter
	orgGetter organization.Getter
	config    retention.Config
	stopC     chan struct{}
	healthyC  chan struct{}
}

// NewDefaultsService sets the configured default retention of every signal that no
// organization has set a retention on yet, at startup and every reconcile interval. The
// ClickHouse tables are shared, so it is recorded once, on the first owned organization.
// It reports healthy at once so a slow ClickHouse never delays startup; failures are
// retried on the next interval.
func NewDefaultsService(providerSettings factory.ProviderSettings, setter retention.TTLSetter, orgGetter organization.Getter, config retention.Config) factory.ServiceWithHealthy {
	return &defaultsService{
		settings:  factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/retention/implretention"),
		setter:    setter,
		orgGetter: orgGetter,
		config:    config,
		stopC:     make(chan struct{}),
		healthyC:  make(chan struct{}),
	}
}

func (service *defaultsService) Start(ctx context.Context) error {
	close(service.healthyC)

	if !service.config.Default.IsSet() {
		select {
		case <-service.stopC:
		case <-ctx.Done():
		}
		return nil
	}

	ticker := time.NewTicker(service.config.ReconcileInterval)
	defer ticker.Stop()

	for {
		if err := service.reconcile(ctx); err != nil {
			service.settings.Logger().WarnContext(ctx, "default retention not applied, retrying", slog.Duration("interval", service.config.ReconcileInterval), errors.Attr(err))
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

func (service *defaultsService) Healthy() <-chan struct{} {
	return service.healthyC
}

func (service *defaultsService) Stop(_ context.Context) error {
	close(service.stopC)
	return nil
}

func (service *defaultsService) reconcile(ctx context.Context) error {
	var errs []error
	var orgs []*types.Organization
	for _, ttlType := range retentiontypes.TTLTypes {
		days := service.config.Default.Days(ttlType)
		if days == 0 {
			continue
		}

		hasTTLSetting, err := service.setter.HasTTLSetting(ctx, ttlType)
		if err != nil {
			errs = append(errs, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't check the %s retention", ttlType))
			continue
		}

		if !retentiontypes.ShouldApplyDefaultRetention(days, hasTTLSetting) {
			continue
		}

		if orgs == nil {
			if orgs, err = service.orgGetter.ListByOwnedKeyRange(ctx); err != nil {
				return errors.Join(append(errs, err)...)
			}
		}

		if len(orgs) == 0 {
			break
		}

		if err := service.setter.SetDefaultTTL(ctx, orgs[0].ID, ttlType, days); err != nil {
			errs = append(errs, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't set the default %s retention", ttlType))
			continue
		}

		service.settings.Logger().InfoContext(ctx, "default retention set", slog.String("signal", ttlType), slog.Int("days", days), slog.String("org_id", orgs[0].ID.StringValue()))
	}

	return errors.Join(errs...)
}
