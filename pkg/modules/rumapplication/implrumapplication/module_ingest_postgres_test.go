package implrumapplication

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uptrace/bun"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/sqlmigration"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/postgressqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore/postgressqlstoretest"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// The ingest policy's queries on PostgreSQL: key expiry compared in SQL,
// and the change record bumped in each change's transaction.
func TestModuleIngestPolicyOnPostgres(t *testing.T) {
	ctx := context.Background()
	sqlStore := postgressqlstoretest.New(t)
	orgID := valuer.GenerateUUID()
	for _, sql := range []string{`CREATE TABLE organizations (id TEXT PRIMARY KEY)`, `INSERT INTO organizations (id) VALUES ('` + orgID.StringValue() + `')`} {
		_, err := sqlStore.BunDB().ExecContext(ctx, sql)
		require.NoError(t, err)
	}
	// The real migrations, so the columns are PostgreSQL's as deployed.
	schema, err := postgressqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, sqlStore)
	require.NoError(t, err)
	for _, migrationFactory := range []factory.ProviderFactory[sqlmigration.SQLMigration, sqlmigration.Config]{
		sqlmigration.NewAddRUMApplicationsFactory(sqlStore, schema),
		sqlmigration.NewAddRUMSourceMapsFactory(sqlStore, schema),
		sqlmigration.NewAddRUMSourceMapKindFactory(schema),
		sqlmigration.NewAddIngestPolicyRevisionFactory(schema),
	} {
		migration, err := migrationFactory.New(ctx, factorytest.NewSettings(), sqlmigration.Config{})
		require.NoError(t, err)
		require.NoError(t, migration.(interface {
			Up(context.Context, *bun.DB) error
		}).Up(ctx, sqlStore.BunDB()))
	}

	telemetryStore := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherEqual)
	for _, statement := range promotionStatements(telemetryStore.Cluster()) {
		telemetryStore.Mock().ExpectExec(statement).WillReturnError(nil)
	}
	config := rumapplication.NewConfigFactory().New().(*rumapplication.Config)
	config.SourceMaps.Dir = t.TempDir()
	module := NewModule(NewStore(sqlStore), telemetryStore, factorytest.NewSettings(), *config).(*module)

	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	rotated, err := module.RotateKey(ctx, orgID, created.ID, created.Key.ID, rumtypes.KeyOverlapOneHour)
	require.NoError(t, err)

	content, err := module.IngestPolicyContent(ctx, time.Now())
	require.NoError(t, err)
	assert.Len(t, content.Keys, 2)
	content, err = module.IngestPolicyContent(ctx, time.Now().Add(2*time.Hour))
	require.NoError(t, err)
	require.Len(t, content.Keys, 1, "expiry compared in SQL")
	assert.Equal(t, rotated.ID.StringValue(), content.Keys[0].ID)

	require.NoError(t, module.RevokeKey(ctx, orgID, created.ID, rotated.ID))
	row := new(ingesttypes.StorableRevision)
	require.NoError(t, sqlStore.BunDB().NewSelect().Model(row).Where("id = ?", ingesttypes.RevisionID).Scan(ctx))
	assert.Equal(t, int64(3), row.Generation, "create, rotate and revoke recorded")
}
