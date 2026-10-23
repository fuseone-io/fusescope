package implrumapplication

import (
	"context"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type module struct {
	store        rumtypes.Store
	telemetry    *telemetryReader
	symbolicator rumapplication.Symbolicator
	promoter     *fieldPromoter
	keys         *keyCache
	monitor      *monitor
	settings     factory.ScopedProviderSettings
	config       rumapplication.Config
	origins      originCache
}

type originCache struct {
	mu           sync.Mutex
	applications []*rumtypes.Application
	expiresAt    time.Time
}

func NewModule(store rumtypes.Store, telemetryStore telemetrystore.TelemetryStore, providerSettings factory.ProviderSettings, config rumapplication.Config) rumapplication.Module {
	return &module{
		store:        store,
		telemetry:    newTelemetryReader(telemetryStore),
		symbolicator: NewNoopSymbolicator(),
		promoter:     newFieldPromoter(telemetryStore, providerSettings),
		keys:         newKeyCache(config.KeyCacheTTL),
		monitor:      newMonitor(),
		settings:     factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/rumapplication/implrumapplication"),
		config:       config,
	}
}

func (module *module) List(ctx context.Context, orgID valuer.UUID) ([]*rumtypes.Application, error) {
	storables, err := module.store.ListApplications(ctx, orgID)
	if err != nil {
		return nil, err
	}
	return rumtypes.NewApplicationsFromStorables(storables)
}

func (module *module) Get(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (*rumtypes.Application, error) {
	storable, err := module.store.GetApplication(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	return rumtypes.NewApplicationFromStorable(storable)
}

func (module *module) Create(ctx context.Context, orgID valuer.UUID, createdBy string, postable *rumtypes.PostableApplication) (*rumtypes.GettableCreatedApplication, error) {
	application := rumtypes.NewApplication(orgID, createdBy, postable)
	if err := application.Validate(); err != nil {
		return nil, err
	}

	storable, err := rumtypes.NewStorableApplication(application)
	if err != nil {
		return nil, err
	}

	key, plaintext, err := rumtypes.NewApplicationKey(orgID, application.ID, application.CreatedAt)
	if err != nil {
		return nil, err
	}

	err = module.store.RunInTx(ctx, func(ctx context.Context) error {
		if err := module.store.CreateApplication(ctx, storable); err != nil {
			return err
		}
		return module.store.CreateKey(ctx, key)
	})
	if err != nil {
		return nil, err
	}

	module.changed()
	if err := module.PromoteFields(ctx); err != nil {
		module.settings.Logger().WarnContext(ctx, "rum fields not promoted, retrying at next start or application creation", errors.Attr(err))
	}

	return &rumtypes.GettableCreatedApplication{
		Application: *application,
		Key:         rumtypes.NewGettableCreatedApplicationKey(key, plaintext, time.Now()),
	}, nil
}

func (module *module) Update(ctx context.Context, orgID valuer.UUID, id valuer.UUID, updatable *rumtypes.UpdatableApplication) (*rumtypes.Application, error) {
	application, err := module.Get(ctx, orgID, id)
	if err != nil {
		return nil, err
	}

	if err := application.Update(updatable); err != nil {
		return nil, err
	}

	storable, err := rumtypes.NewStorableApplication(application)
	if err != nil {
		return nil, err
	}

	if err := module.store.UpdateApplication(ctx, storable); err != nil {
		return nil, err
	}

	module.changed()
	return application, nil
}

func (module *module) Delete(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error {
	if err := module.store.DeleteApplication(ctx, orgID, id); err != nil {
		return err
	}

	module.monitor.Forget(id)
	module.changed()
	return nil
}

func (module *module) Status(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (*rumtypes.GettableApplicationStatus, error) {
	application, err := module.Get(ctx, orgID, id)
	if err != nil {
		return nil, err
	}

	counts, sdk, rejections, pendingFirstSeen := module.monitor.Snapshot(id, time.Now())
	firstSeen := application.FirstSeenAt
	if firstSeen == nil {
		firstSeen = pendingFirstSeen
	}

	return &rumtypes.GettableApplicationStatus{
		FirstSeenAt:   firstSeen,
		WindowSeconds: int64(rumtypes.StatusWindow.Seconds()),
		Counts:        counts,
		SDK:           sdk,
		SupportedSDKs: rumtypes.NewSupportedSDKs(),
		Rejections:    rejections,
	}, nil
}

func (module *module) PromoteFields(ctx context.Context) error {
	return module.promoter.Promote(ctx)
}

func (module *module) HasApplications(ctx context.Context) (bool, error) {
	count, err := module.store.CountApplications(ctx)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (module *module) ApplicationsAllowingOrigin(ctx context.Context, origin string) []valuer.UUID {
	module.origins.mu.Lock()
	defer module.origins.mu.Unlock()

	now := time.Now()
	if module.origins.applications == nil || !now.Before(module.origins.expiresAt) {
		storables, err := module.store.ListApplicationsInAllOrgs(ctx)
		if err != nil {
			module.settings.Logger().WarnContext(ctx, "failed to list rum applications", errors.Attr(err))
			return nil
		}
		applications, err := rumtypes.NewApplicationsFromStorables(storables)
		if err != nil {
			module.settings.Logger().WarnContext(ctx, "failed to decode rum applications", errors.Attr(err))
			return nil
		}
		module.origins.applications = applications
		module.origins.expiresAt = now.Add(module.config.KeyCacheTTL)
	}

	ids := []valuer.UUID{}
	for _, application := range module.origins.applications {
		if application.AllowsOrigin(origin) {
			ids = append(ids, application.ID)
		}
	}
	return ids
}

// changed drops everything cached from the database after a write.
func (module *module) changed() {
	module.keys.Clear()

	module.origins.mu.Lock()
	module.origins.applications = nil
	module.origins.mu.Unlock()
}
