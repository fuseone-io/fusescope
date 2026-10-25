package sqlmigration

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"github.com/oklog/ulid/v2"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect"
	"github.com/uptrace/bun/migrate"
)

type enablePublicDashboardAccess struct{}

func NewEnablePublicDashboardAccessFactory() factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("enable_public_dashboard_access"), func(context.Context, factory.ProviderSettings, Config) (SQLMigration, error) {
		return &enablePublicDashboardAccess{}, nil
	})
}

func (m *enablePublicDashboardAccess) Register(migrations *migrate.Migrations) error {
	return migrations.Register(m.Up, m.Down)
}

func (m *enablePublicDashboardAccess) Up(ctx context.Context, db *bun.DB) error {
	return db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		var storeID string
		if err := tx.NewSelect().Table("store").Column("id").Where("name = ?", "signoz").Limit(1).Scan(ctx, &storeID); err != nil {
			return err
		}
		var orgIDs []string
		if err := tx.NewSelect().Table("organizations").Column("id").Scan(ctx, &orgIDs); err != nil {
			return err
		}
		for _, orgID := range orgIDs {
			roleID := "organization/" + orgID + "/role/" + coretypes.SigNozAnonymousRoleName
			grants := []publicDashboardGrant{
				{objectType: "role", objectID: roleID, relation: "assignee", subjectType: "anonymous", subjectID: "organization/" + orgID + "/anonymous/" + coretypes.AnonymousUser.StringValue()},
				{objectType: "metaresource", objectID: "organization/" + orgID + "/public-dashboard/*", relation: "read", subjectType: "role", subjectID: roleID, subjectRelation: "assignee"},
			}
			for _, grant := range grants {
				if err := insertPublicDashboardGrant(ctx, tx, db.Dialect().Name() == dialect.PG, storeID, grant); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

type publicDashboardGrant struct{ objectType, objectID, relation, subjectType, subjectID, subjectRelation string }

func insertPublicDashboardGrant(ctx context.Context, tx bun.Tx, isPG bool, storeID string, grant publicDashboardGrant) error {
	now := time.Now().UTC()
	id := ulid.MustNew(ulid.Timestamp(now), ulid.DefaultEntropy()).String()
	row := map[string]any{"store": storeID, "object_type": grant.objectType, "object_id": grant.objectID, "relation": grant.relation, "ulid": id, "inserted_at": now}
	userType := "user"
	if grant.subjectRelation != "" {
		userType = "userset"
	}
	if isPG {
		user := grant.subjectType + ":" + grant.subjectID
		if grant.subjectRelation != "" {
			user += "#" + grant.subjectRelation
		}
		row["_user"] = user
	} else {
		row["user_object_type"] = grant.subjectType
		row["user_object_id"] = grant.subjectID
		row["user_relation"] = grant.subjectRelation
	}
	row["user_type"] = userType
	result, err := tx.NewInsert().Model(&row).TableExpr("tuple").On("CONFLICT DO NOTHING").Exec(ctx)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil || n == 0 {
		return err
	}
	delete(row, "user_type")
	row["operation"] = 0
	_, err = tx.NewInsert().Model(&row).TableExpr("changelog").On("CONFLICT DO NOTHING").Exec(ctx)
	return err
}

func (m *enablePublicDashboardAccess) Down(context.Context, *bun.DB) error { return nil }
