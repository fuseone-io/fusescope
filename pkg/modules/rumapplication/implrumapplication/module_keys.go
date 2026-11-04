package implrumapplication

import (
	"context"
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
		if err := module.store.TouchIngestPolicy(ctx); err != nil {
			return err
		}
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
		if err := module.checkIngestBudget(ctx, ingestChange{keysOf: applicationID, usable: 1}); err != nil {
			return err
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
		if err := module.store.TouchIngestPolicy(ctx); err != nil {
			return err
		}
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
		// The current key enters its overlap and a new one is usable.
		if err := module.checkIngestBudget(ctx, ingestChange{keysOf: applicationID, usable: 1, expiring: 1}); err != nil {
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
	// The revocation and its record for the publisher commit together, so
	// every replica sees it at its next poll even if this one stops now.
	err = module.store.RunInTx(ctx, func(ctx context.Context) error {
		if err := module.store.TouchIngestPolicy(ctx); err != nil {
			return err
		}
		return module.store.UpdateKey(ctx, key)
	})
	if err != nil {
		return err
	}

	module.changed()
	return nil
}

func (module *module) FlushUsage(ctx context.Context) error {
	err := module.flushSourceMapUsage(ctx)
	if err != nil {
		module.settings.Logger().WarnContext(ctx, "failed to flush rum source map usage", errors.Attr(err))
	}
	return err
}
