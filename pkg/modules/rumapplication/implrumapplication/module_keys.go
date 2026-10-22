package implrumapplication

import (
	"context"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func (module *module) ListKeys(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*rumtypes.GettableApplicationKey, error) {
	if _, err := module.store.GetApplication(ctx, orgID, applicationID); err != nil {
		return nil, err
	}

	keys, err := module.store.ListKeys(ctx, orgID, applicationID)
	if err != nil {
		return nil, err
	}
	return rumtypes.NewGettableApplicationKeys(keys, time.Now()), nil
}

func (module *module) CreateKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) (*rumtypes.GettableCreatedApplicationKey, error) {
	now := time.Now()
	key, plaintext, err := rumtypes.NewApplicationKey(orgID, applicationID, now)
	if err != nil {
		return nil, err
	}

	err = module.store.RunInTx(ctx, func(ctx context.Context) error {
		if _, err := module.store.GetApplication(ctx, orgID, applicationID); err != nil {
			return err
		}

		keys, err := module.store.ListKeys(ctx, orgID, applicationID)
		if err != nil {
			return err
		}
		for _, existing := range keys {
			if existing.IsUsableAt(now) {
				return errors.Newf(errors.TypeAlreadyExists, rumtypes.ErrCodeKeyConflict, "rum application %s already has a key, rotate it instead", applicationID.StringValue())
			}
		}

		return module.store.CreateKey(ctx, key)
	})
	if err != nil {
		return nil, err
	}

	module.changed()
	return rumtypes.NewGettableCreatedApplicationKey(key, plaintext, now), nil
}

func (module *module) RotateKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, keyID valuer.UUID, overlap rumtypes.KeyOverlap) (*rumtypes.GettableCreatedApplicationKey, error) {
	now := time.Now()
	next, plaintext, err := rumtypes.NewApplicationKey(orgID, applicationID, now)
	if err != nil {
		return nil, err
	}

	err = module.store.RunInTx(ctx, func(ctx context.Context) error {
		current, err := module.store.GetKey(ctx, orgID, applicationID, keyID)
		if err != nil {
			return err
		}

		keys, err := module.store.ListKeys(ctx, orgID, applicationID)
		if err != nil {
			return err
		}
		for _, existing := range keys {
			if existing.StatusAt(now) == rumtypes.KeyStatusExpiring {
				return errors.Newf(errors.TypeAlreadyExists, rumtypes.ErrCodeKeyConflict, "a rotation is in progress until %s; revoke the expiring key to end it", existing.ExpiresAt.UTC().Format(time.RFC3339))
			}
		}

		if err := current.Expire(now, overlap); err != nil {
			return err
		}
		if err := module.store.UpdateKey(ctx, current); err != nil {
			return err
		}
		return module.store.CreateKey(ctx, next)
	})
	if err != nil {
		return nil, err
	}

	module.changed()
	return rumtypes.NewGettableCreatedApplicationKey(next, plaintext, now), nil
}

func (module *module) RevokeKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, keyID valuer.UUID) error {
	key, err := module.store.GetKey(ctx, orgID, applicationID, keyID)
	if err != nil {
		return err
	}

	key.Revoke(time.Now())
	if err := module.store.UpdateKey(ctx, key); err != nil {
		return err
	}

	module.changed()
	return nil
}

func (module *module) Authenticate(ctx context.Context, plaintext string) (*rumtypes.Application, valuer.UUID, error) {
	if !rumtypes.IsWellFormedKey(plaintext) {
		return nil, valuer.UUID{}, errors.NewUnauthenticatedf(rumtypes.ErrCodeKeyInvalid, "invalid rum application key")
	}

	now := time.Now()
	hash := rumtypes.HashKey(plaintext)
	entry, ok := module.keys.Get(hash, now)
	if !ok {
		application, key, err := module.lookupKey(ctx, hash)
		if err != nil {
			return nil, valuer.UUID{}, err
		}
		module.keys.Set(hash, application, key, now)
		entry = keyCacheEntry{application: application, key: key}
	}

	if entry.key == nil {
		return nil, valuer.UUID{}, errors.NewUnauthenticatedf(rumtypes.ErrCodeKeyInvalid, "invalid rum application key")
	}
	if !entry.key.IsUsableAt(now) {
		return entry.application, entry.key.ID, errors.NewUnauthenticatedf(rumtypes.ErrCodeKeyInvalid, "rum application key is %s", entry.key.StatusAt(now).StringValue())
	}
	return entry.application, entry.key.ID, nil
}

func (module *module) ObserveIngest(application *rumtypes.Application, keyID valuer.UUID, batch *rumtypes.IngestBatch) {
	module.monitor.ObserveIngest(application.ID, keyID, batch, application.FirstSeenAt != nil, time.Now())
}

func (module *module) ObserveRejection(applicationID valuer.UUID, reason rumtypes.RejectionReason, origin string) {
	module.monitor.ObserveRejection(applicationID, reason, origin, time.Now())
}

func (module *module) FlushUsage(ctx context.Context) error {
	keysUsed, firstSeen := module.monitor.TakeUsage()

	var flushErr error
	for keyID, usedAt := range keysUsed {
		if err := module.store.SetKeyLastUsedAt(ctx, keyID, usedAt); err != nil {
			flushErr = err
		}
	}
	for applicationID, seenAt := range firstSeen {
		if err := module.store.SetFirstSeenAt(ctx, applicationID, seenAt); err != nil {
			module.monitor.RestoreFirstSeen(applicationID, seenAt)
			flushErr = err
		}
	}

	if len(firstSeen) > 0 {
		module.keys.Clear()
	}
	if flushErr != nil {
		module.settings.Logger().WarnContext(ctx, "failed to flush rum usage", slog.Int("keys", len(keysUsed)), slog.Int("applications", len(firstSeen)), errors.Attr(flushErr))
	}
	return flushErr
}

// lookupKey returns a nil key, without error, for a hash that was never issued.
func (module *module) lookupKey(ctx context.Context, hash string) (*rumtypes.Application, *rumtypes.ApplicationKey, error) {
	key, err := module.store.GetKeyByHash(ctx, hash)
	if err != nil {
		if errors.Ast(err, errors.TypeNotFound) {
			return nil, nil, nil
		}
		return nil, nil, err
	}

	storable, err := module.store.GetApplicationByID(ctx, key.ApplicationID)
	if err != nil {
		if errors.Ast(err, errors.TypeNotFound) {
			return nil, nil, nil
		}
		return nil, nil, err
	}

	application, err := rumtypes.NewApplicationFromStorable(storable)
	if err != nil {
		return nil, nil, err
	}
	return application, key, nil
}
