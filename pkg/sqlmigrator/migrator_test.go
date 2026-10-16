package sqlmigrator

import (
	"context"
	"database/sql/driver"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration/sqlmigrationtest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlstoretest"
	"github.com/stretchr/testify/require"
)

func TestMigratorWithSqliteAndNoopMigration(t *testing.T) {
	ctx := context.Background()
	sqlstoreConfig := sqlstore.Config{
		Provider: "sqlite",
	}

	migrationConfig := Config{
		Lock: Lock{
			Timeout:  10 * time.Second,
			Interval: 1 * time.Second,
		},
	}

	providerSettings := instrumentationtest.New().ToProviderSettings()
	sqlstore := sqlstoretest.New(sqlstoreConfig, sqlmock.QueryMatcherRegexp)
	migrator := New(
		ctx,
		providerSettings,
		sqlstore,
		sqlmigration.MustNew(ctx, providerSettings, sqlmigration.Config{}, factory.MustNewNamedMap(sqlmigrationtest.NoopMigrationFactory())),
		migrationConfig,
	)

	sqlstore.Mock().ExpectExec("CREATE TABLE IF NOT EXISTS migration (.+)").WillReturnResult(driver.ResultNoRows)
	sqlstore.Mock().ExpectExec("CREATE TABLE IF NOT EXISTS migration_lock (.+)").WillReturnResult(driver.ResultNoRows)
	sqlstore.Mock().ExpectQuery("INSERT INTO migration_lock (.+)").WillReturnRows(sqlstore.Mock().NewRows([]string{"id"}).AddRow(1))
	sqlstore.Mock().ExpectQuery("(.+) FROM migration").WillReturnRows(sqlstore.Mock().NewRows([]string{"id"}).AddRow(1))
	sqlstore.Mock().ExpectQuery("INSERT INTO migration (.+)").WillReturnRows(sqlstore.Mock().NewRows([]string{"id", "migrated_at"}).AddRow(1, time.Now()))

	err := migrator.Migrate(ctx)
	require.NoError(t, err)
}
