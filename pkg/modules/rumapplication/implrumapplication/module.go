package implrumapplication

import (
	"context"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication/browsersdk"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type module struct {
	store        rumtypes.Store
	telemetry    *telemetryReader
	symbolicator rumapplication.Symbolicator
	storage      rumapplication.SourceMapStorage
	promoter     *fieldPromoter
	settings     factory.ScopedProviderSettings
	config       rumapplication.Config

	listenersMu sync.Mutex
	listeners   []func()

	// ingestMaxSize is the ingest policy's cap, ingestpolicy.MaxSize.
	ingestMaxSize int
}

func NewModule(store rumtypes.Store, telemetryStore telemetrystore.TelemetryStore, providerSettings factory.ProviderSettings, config rumapplication.Config) rumapplication.Module {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/rumapplication/implrumapplication")
	storage := NewFileSourceMapStorage(config.SourceMaps.Dir)
	return &module{
		store:        store,
		telemetry:    newTelemetryReader(telemetryStore),
		symbolicator: NewSymbolicator(store, storage, settings.Logger(), config),
		storage:      storage,
		promoter:     newFieldPromoter(telemetryStore, providerSettings),
		settings:     settings,
		config:       config,

		ingestMaxSize: ingestpolicy.MaxSize,
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
	if err := validateForIngest(application); err != nil {
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
		// The touch serialises creations, so the count holds until commit.
		if err := module.store.TouchIngestPolicy(ctx); err != nil {
			return err
		}
		count, err := module.store.CountApplications(ctx)
		if err != nil {
			return err
		}
		if count >= ingestpolicy.MaxApplications {
			return errors.Newf(errors.TypeForbidden, rumtypes.ErrCodeApplicationLimit, "a deployment holds at most %d rum applications", ingestpolicy.MaxApplications)
		}
		if err := module.checkIngestBudget(ctx, ingestChange{application: application, keysOf: application.ID, usable: 1}); err != nil {
			return err
		}
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
	if err := validateForIngest(application); err != nil {
		return nil, err
	}

	storable, err := rumtypes.NewStorableApplication(application)
	if err != nil {
		return nil, err
	}

	err = module.store.RunInTx(ctx, func(ctx context.Context) error {
		if err := module.store.TouchIngestPolicy(ctx); err != nil {
			return err
		}
		if err := module.checkIngestBudget(ctx, ingestChange{application: application}); err != nil {
			return err
		}
		return module.store.UpdateApplication(ctx, storable)
	})
	if err != nil {
		return nil, err
	}

	module.changed()
	return application, nil
}

func (module *module) Delete(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error {
	sourceMaps, err := module.store.ListSourceMaps(ctx, orgID, id)
	if err != nil {
		return err
	}
	err = module.store.RunInTx(ctx, func(ctx context.Context) error {
		if err := module.store.TouchIngestPolicy(ctx); err != nil {
			return err
		}
		return module.store.DeleteApplication(ctx, orgID, id)
	})
	if err != nil {
		return err
	}
	module.deleteSourceMapContent(ctx, sourceMaps)
	for _, file := range sourceMaps {
		module.symbolicator.Forget(id, file.Release)
	}

	module.changed()
	return nil
}

func (module *module) Status(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (*rumtypes.GettableApplicationStatus, error) {
	application, err := module.Get(ctx, orgID, id)
	if err != nil {
		return nil, err
	}

	counts, reportedSDK, rejections, err := module.reportedStatus(ctx, id)
	if err != nil {
		return nil, err
	}
	sdk := rumtypes.SeenSDK{}
	if reportedSDK != nil {
		sdk = *reportedSDK
	}

	return &rumtypes.GettableApplicationStatus{
		FirstSeenAt:   application.FirstSeenAt,
		WindowSeconds: int64(rumtypes.StatusWindow.Seconds()),
		Counts:        counts,
		SDK:           sdk,
		SupportedSDKs: rumtypes.NewSupportedSDKs(),
		BrowserBundle: rumtypes.BundledSDK{
			Name:      rumtypes.SDKBrowserName,
			Version:   browsersdk.Version(),
			Integrity: browsersdk.Integrity(),
			Path:      browsersdk.ScriptPath(browsersdk.Version()),
		},
		Rejections: rejections,
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

// changed notifies the listeners after a write.
func (module *module) changed() {
	module.listenersMu.Lock()
	listeners := module.listeners
	module.listenersMu.Unlock()
	for _, listener := range listeners {
		listener()
	}
}

func (module *module) OnChange(f func()) {
	module.listenersMu.Lock()
	defer module.listenersMu.Unlock()
	module.listeners = append(module.listeners, f)
}
