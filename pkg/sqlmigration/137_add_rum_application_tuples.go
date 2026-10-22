package sqlmigration

import (
	"context"
	"database/sql"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect"
	"github.com/uptrace/bun/migrate"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
)

type addRUMApplicationTuples struct {
	sqlstore sqlstore.SQLStore
}

func NewAddRUMApplicationTuplesFactory(sqlstore sqlstore.SQLStore) factory.ProviderFactory[SQLMigration, Config] {
	return factory.NewProviderFactory(factory.MustNewName("add_rum_application_tuples"), func(ctx context.Context, ps factory.ProviderSettings, c Config) (SQLMigration, error) {
		return &addRUMApplicationTuples{sqlstore: sqlstore}, nil
	})
}

func (migration *addRUMApplicationTuples) Register(migrations *migrate.Migrations) error {
	return migrations.Register(migration.Up, migration.Down)
}

func (migration *addRUMApplicationTuples) Up(ctx context.Context, db *bun.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var storeID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM store WHERE name = ? LIMIT 1`, "signoz").Scan(&storeID)
	if err != nil {
		return err
	}

	var orgIDs []string
	err = tx.NewSelect().
		Table("organizations").
		Column("id").
		Scan(ctx, &orgIDs)
	if err != nil && err != sql.ErrNoRows {
		return err
	}

	isPG := migration.sqlstore.BunDB().Dialect().Name() == dialect.PG

	tuples := []migrationTuple{
		{"signoz-admin", "metaresource", "rum-application", "create"},
		{"signoz-admin", "metaresource", "rum-application", "read"},
		{"signoz-admin", "metaresource", "rum-application", "update"},
		{"signoz-admin", "metaresource", "rum-application", "delete"},
		{"signoz-admin", "metaresource", "rum-application", "list"},
		{"signoz-editor", "metaresource", "rum-application", "create"},
		{"signoz-editor", "metaresource", "rum-application", "read"},
		{"signoz-editor", "metaresource", "rum-application", "update"},
		{"signoz-editor", "metaresource", "rum-application", "delete"},
		{"signoz-editor", "metaresource", "rum-application", "list"},
	}

	for _, orgID := range orgIDs {
		for _, tuple := range tuples {
			entropy := ulid.DefaultEntropy()
			now := time.Now().UTC()
			tupleID := ulid.MustNew(ulid.Timestamp(now), entropy).String()

			objectID := "organization/" + orgID + "/" + tuple.objectName + "/*"
			roleSubject := "organization/" + orgID + "/role/" + tuple.roleName

			if isPG {
				user := "role:" + roleSubject + "#assignee"
				result, err := tx.ExecContext(ctx, `
					INSERT INTO tuple (store, object_type, object_id, relation, _user, user_type, ulid, inserted_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT (store, object_type, object_id, relation, _user) DO NOTHING`,
					storeID, tuple.objectType, objectID, tuple.relation, user, "userset", tupleID, now,
				)
				if err != nil {
					return err
				}
				rowsAffected, err := result.RowsAffected()
				if err != nil {
					return err
				}
				if rowsAffected == 0 {
					continue
				}
				_, err = tx.ExecContext(ctx, `
					INSERT INTO changelog (store, object_type, object_id, relation, _user, operation, ulid, inserted_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT (store, ulid, object_type) DO NOTHING`,
					storeID, tuple.objectType, objectID, tuple.relation, user, 0, tupleID, now,
				)
				if err != nil {
					return err
				}
			} else {
				result, err := tx.ExecContext(ctx, `
					INSERT INTO tuple (store, object_type, object_id, relation, user_object_type, user_object_id, user_relation, user_type, ulid, inserted_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT (store, object_type, object_id, relation, user_object_type, user_object_id, user_relation) DO NOTHING`,
					storeID, tuple.objectType, objectID, tuple.relation, "role", roleSubject, "assignee", "userset", tupleID, now,
				)
				if err != nil {
					return err
				}
				rowsAffected, err := result.RowsAffected()
				if err != nil {
					return err
				}
				if rowsAffected == 0 {
					continue
				}
				_, err = tx.ExecContext(ctx, `
					INSERT INTO changelog (store, object_type, object_id, relation, user_object_type, user_object_id, user_relation, operation, ulid, inserted_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT (store, ulid, object_type) DO NOTHING`,
					storeID, tuple.objectType, objectID, tuple.relation, "role", roleSubject, "assignee", 0, tupleID, now,
				)
				if err != nil {
					return err
				}
			}
		}
	}
	return tx.Commit()
}

func (migration *addRUMApplicationTuples) Down(context.Context, *bun.DB) error {
	return nil
}
