package implrumapplication

import (
	"context"
	"time"

	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type store struct {
	sqlstore sqlstore.SQLStore
}

func NewStore(sqlstore sqlstore.SQLStore) rumtypes.Store {
	return &store{sqlstore: sqlstore}
}

func (store *store) CreateApplication(ctx context.Context, application *rumtypes.StorableApplication) error {
	_, err := store.sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(application).
		Exec(ctx)
	if err != nil {
		return store.sqlstore.WrapAlreadyExistsErrf(err, rumtypes.ErrCodeApplicationAlreadyExists, "rum application %q already exists", application.Name)
	}
	return nil
}

func (store *store) GetApplication(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (*rumtypes.StorableApplication, error) {
	application := new(rumtypes.StorableApplication)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(application).
		Where("org_id = ?", orgID).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, rumtypes.ErrCodeApplicationNotFound, "rum application %s not found", id.StringValue())
	}
	return application, nil
}

func (store *store) GetApplicationByID(ctx context.Context, id valuer.UUID) (*rumtypes.StorableApplication, error) {
	application := new(rumtypes.StorableApplication)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(application).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, rumtypes.ErrCodeApplicationNotFound, "rum application %s not found", id.StringValue())
	}
	return application, nil
}

func (store *store) ListApplications(ctx context.Context, orgID valuer.UUID) ([]*rumtypes.StorableApplication, error) {
	applications := make([]*rumtypes.StorableApplication, 0)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&applications).
		Where("org_id = ?", orgID).
		Order("name ASC").
		Scan(ctx)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to list rum applications")
	}
	return applications, nil
}

func (store *store) CountApplications(ctx context.Context) (int, error) {
	count, err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model((*rumtypes.StorableApplication)(nil)).
		Count(ctx)
	if err != nil {
		return 0, errors.WrapInternalf(err, errors.CodeInternal, "failed to count rum applications")
	}
	return int(count), nil
}

func (store *store) ListApplicationsInAllOrgs(ctx context.Context) ([]*rumtypes.StorableApplication, error) {
	applications := make([]*rumtypes.StorableApplication, 0)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&applications).
		Column("id", "org_id", "data").
		Scan(ctx)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to list rum applications")
	}
	return applications, nil
}

func (store *store) ListAllApplications(ctx context.Context, limit int) ([]*rumtypes.StorableApplication, error) {
	applications := make([]*rumtypes.StorableApplication, 0)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&applications).
		Order("id ASC").
		Limit(int64(limit)).
		Scan(ctx)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to list rum applications")
	}
	return applications, nil
}

func (store *store) UpdateApplication(ctx context.Context, application *rumtypes.StorableApplication) error {
	result, err := store.sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(application).
		Column("name", "environment", "data", "updated_at").
		Where("org_id = ?", application.OrgID).
		Where("id = ?", application.ID).
		Exec(ctx)
	if err != nil {
		return store.sqlstore.WrapAlreadyExistsErrf(err, rumtypes.ErrCodeApplicationAlreadyExists, "rum application %q already exists", application.Name)
	}
	if rows, err := result.RowsAffected(); err == nil && rows == 0 {
		return errors.NewNotFoundf(rumtypes.ErrCodeApplicationNotFound, "rum application %s not found", application.ID.StringValue())
	}
	return nil
}

func (store *store) DeleteApplication(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error {
	return store.RunInTx(ctx, func(ctx context.Context) error {
		for _, model := range []any{(*rumtypes.ApplicationKey)(nil), (*rumtypes.StorableSourceMap)(nil)} {
			_, err := store.sqlstore.
				BunDBCtx(ctx).
				NewDelete().
				Model(model).
				Where("org_id = ?", orgID).
				Where("application_id = ?", id).
				Exec(ctx)
			if err != nil {
				return errors.WrapInternalf(err, errors.CodeInternal, "failed to delete rum application keys and source maps")
			}
		}

		result, err := store.sqlstore.
			BunDBCtx(ctx).
			NewDelete().
			Model((*rumtypes.StorableApplication)(nil)).
			Where("org_id = ?", orgID).
			Where("id = ?", id).
			Exec(ctx)
		if err != nil {
			return errors.WrapInternalf(err, errors.CodeInternal, "failed to delete rum application")
		}
		if rows, err := result.RowsAffected(); err == nil && rows == 0 {
			return errors.NewNotFoundf(rumtypes.ErrCodeApplicationNotFound, "rum application %s not found", id.StringValue())
		}
		return nil
	})
}

func (store *store) SetFirstSeenAt(ctx context.Context, id valuer.UUID, seenAt time.Time) error {
	_, err := store.sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model((*rumtypes.StorableApplication)(nil)).
		Set("first_seen_at = ?", seenAt).
		Where("id = ?", id).
		Where("first_seen_at IS NULL").
		Exec(ctx)
	if err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "failed to set rum application first seen time")
	}
	return nil
}

func (store *store) CreateKey(ctx context.Context, key *rumtypes.ApplicationKey) error {
	_, err := store.sqlstore.
		BunDBCtx(ctx).
		NewInsert().
		Model(key).
		Exec(ctx)
	if err != nil {
		return store.sqlstore.WrapAlreadyExistsErrf(err, rumtypes.ErrCodeKeyConflict, "rum application key already exists")
	}
	return nil
}

func (store *store) GetKey(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID, id valuer.UUID) (*rumtypes.ApplicationKey, error) {
	key := new(rumtypes.ApplicationKey)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(key).
		Where("org_id = ?", orgID).
		Where("application_id = ?", applicationID).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, rumtypes.ErrCodeKeyNotFound, "rum application key %s not found", id.StringValue())
	}
	return key, nil
}

func (store *store) GetKeyByHash(ctx context.Context, hash string) (*rumtypes.ApplicationKey, error) {
	key := new(rumtypes.ApplicationKey)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(key).
		Where("key_hash = ?", hash).
		Scan(ctx)
	if err != nil {
		return nil, store.sqlstore.WrapNotFoundErrf(err, rumtypes.ErrCodeKeyNotFound, "rum application key not found")
	}
	return key, nil
}

func (store *store) ListKeys(ctx context.Context, orgID valuer.UUID, applicationID valuer.UUID) ([]*rumtypes.ApplicationKey, error) {
	keys := make([]*rumtypes.ApplicationKey, 0)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&keys).
		Where("org_id = ?", orgID).
		Where("application_id = ?", applicationID).
		Order("created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to list rum application keys")
	}
	return keys, nil
}

func (store *store) ListUsableKeys(ctx context.Context, at time.Time, limit int) ([]*rumtypes.ApplicationKey, error) {
	keys := make([]*rumtypes.ApplicationKey, 0)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model(&keys).
		Where("revoked_at IS NULL").
		WhereGroup(" AND ", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.Where("expires_at IS NULL").WhereOr("expires_at > ?", at.UTC())
		}).
		Order("id ASC").
		Limit(int64(limit)).
		Scan(ctx)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to list rum application keys")
	}
	return keys, nil
}

func (store *store) CountUsableKeys(ctx context.Context, at time.Time) (map[valuer.UUID]rumtypes.KeyCounts, error) {
	rows := make([]struct {
		ApplicationID valuer.UUID `bun:"application_id"`
		Usable        int         `bun:"usable"`
		Expiring      int         `bun:"expiring"`
	}, 0)
	err := store.sqlstore.
		BunDBCtx(ctx).
		NewSelect().
		Model((*rumtypes.ApplicationKey)(nil)).
		Column("application_id").
		ColumnExpr("COUNT(*) AS usable").
		ColumnExpr("SUM(CASE WHEN expires_at IS NULL THEN 0 ELSE 1 END) AS expiring").
		Where("revoked_at IS NULL").
		WhereGroup(" AND ", func(q *bun.SelectQuery) *bun.SelectQuery {
			return q.Where("expires_at IS NULL").WhereOr("expires_at > ?", at.UTC())
		}).
		Group("application_id").
		Scan(ctx, &rows)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to count rum application keys")
	}
	counts := make(map[valuer.UUID]rumtypes.KeyCounts, len(rows))
	for _, row := range rows {
		counts[row.ApplicationID] = rumtypes.KeyCounts{Usable: row.Usable, Expiring: row.Expiring}
	}
	return counts, nil
}

func (store *store) TouchIngestPolicy(ctx context.Context) error {
	if err := ingesttypes.Touch(ctx, store.sqlstore.BunDBCtx(ctx), time.Now()); err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "failed to record the ingest policy change")
	}
	return nil
}

func (store *store) UpdateKey(ctx context.Context, key *rumtypes.ApplicationKey) error {
	_, err := store.sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model(key).
		Column("expires_at", "revoked_at", "updated_at").
		Where("org_id = ?", key.OrgID).
		Where("id = ?", key.ID).
		Exec(ctx)
	if err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "failed to update rum application key")
	}
	return nil
}

func (store *store) SetKeyLastUsedAt(ctx context.Context, id valuer.UUID, usedAt time.Time) error {
	_, err := store.sqlstore.
		BunDBCtx(ctx).
		NewUpdate().
		Model((*rumtypes.ApplicationKey)(nil)).
		Set("last_used_at = ?", usedAt).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "failed to set rum application key last used time")
	}
	return nil
}

func (store *store) RunInTx(ctx context.Context, cb func(ctx context.Context) error) error {
	return store.sqlstore.RunInTxCtx(ctx, nil, cb)
}
