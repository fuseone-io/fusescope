package implrumapplication

import (
	"context"
	"encoding/json"
	"path/filepath"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication/browsersdk"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestModule(t *testing.T) (*module, valuer.UUID) {
	t.Helper()
	module, orgID, _ := newTestModuleWithMock(t, false)
	return module, orgID
}

// newTestModuleWithMock also returns the ClickHouse mock, which expects the
// promotion statements first; with matchRegexp, later expectations are regexps.
func newTestModuleWithMock(t *testing.T, matchRegexp bool) (*module, valuer.UUID, cmock.ClickConnMockCommon) {
	t.Helper()
	return newTestModuleWithConfig(t, matchRegexp, func(*rumapplication.Config) {})
}

func newTestModuleWithConfig(t *testing.T, matchRegexp bool, configure func(*rumapplication.Config)) (*module, valuer.UUID, cmock.ClickConnMockCommon) {
	t.Helper()
	ctx := context.Background()
	sqlStore, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
		Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "rum.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "deferred"},
	})
	require.NoError(t, err)

	for _, model := range []any{(*rumtypes.StorableApplication)(nil), (*rumtypes.ApplicationKey)(nil), (*rumtypes.StorableSourceMap)(nil), (*ingesttypes.StorableRevision)(nil), (*ingesttypes.StorableReportApplication)(nil)} {
		_, err := sqlStore.BunDB().NewCreateTable().Model(model).IfNotExists().Exec(ctx)
		require.NoError(t, err)
	}
	_, err = sqlStore.BunDB().Exec(`CREATE UNIQUE INDEX uq_rum_application_org_id_name ON rum_application (org_id, name)`)
	require.NoError(t, err)
	_, err = sqlStore.BunDB().Exec(`CREATE UNIQUE INDEX uq_rum_source_map ON rum_source_map (application_id, release_name, path)`)
	require.NoError(t, err)

	matcher := sqlmock.QueryMatcherEqual
	if matchRegexp {
		matcher = sqlmock.QueryMatcherRegexp
	}
	telemetryStore := telemetrystoretest.New(telemetrystore.Config{}, matcher)
	for _, statement := range promotionStatements(telemetryStore.Cluster()) {
		if matchRegexp {
			statement = regexp.QuoteMeta(statement)
		}
		telemetryStore.Mock().ExpectExec(statement).WillReturnError(nil)
	}

	config := rumapplication.NewConfigFactory().New().(*rumapplication.Config)
	config.SourceMaps.Dir = filepath.Join(t.TempDir(), "sourcemaps")
	configure(config)
	return NewModule(NewStore(sqlStore), telemetryStore, factorytest.NewSettings(), *config).(*module), valuer.GenerateUUID(), telemetryStore.Mock()
}

// policyKeys returns the ids of the keys the ingest policy publishes.
func policyKeys(t *testing.T, module *module) []valuer.UUID {
	t.Helper()
	content, err := module.IngestPolicyContent(context.Background(), time.Now())
	require.NoError(t, err)
	ids := []valuer.UUID{}
	for _, key := range content.Keys {
		ids = append(ids, valuer.MustNewUUID(key.ID))
	}
	return ids
}

func newTestPostable(t *testing.T, raw string) *rumtypes.PostableApplication {
	t.Helper()
	postable := new(rumtypes.PostableApplication)
	require.NoError(t, json.Unmarshal([]byte(raw), postable))
	return postable
}

func TestModuleCreateIssuesKey(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)

	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production","allowedOrigins":["https://shop.example.com"]}`))
	require.NoError(t, err)
	require.NotNil(t, created.Key)
	assert.Equal(t, rumtypes.KeyStatusActive, created.Key.Status)

	assert.Equal(t, []valuer.UUID{created.Key.ID}, policyKeys(t, module))

	_, err = module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"staging"}`))
	assert.True(t, errors.Ast(err, errors.TypeAlreadyExists))
}

func TestModuleKeyRotation(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	_, err = module.CreateKey(ctx, orgID, created.ID)
	assert.True(t, errors.Ast(err, errors.TypeAlreadyExists), "a second active key needs a rotation")

	rotated, err := module.RotateKey(ctx, orgID, created.ID, created.Key.ID, rumtypes.KeyOverlapOneHour)
	require.NoError(t, err)
	assert.NotEqual(t, created.Key.Key, rotated.Key)

	assert.ElementsMatch(t, []valuer.UUID{created.Key.ID, rotated.ID}, policyKeys(t, module), "both keys work during the overlap")

	keys, err := module.ListKeys(ctx, orgID, created.ID)
	require.NoError(t, err)
	require.Len(t, keys, 2)
	statuses := map[valuer.UUID]rumtypes.KeyStatus{keys[0].ID: keys[0].Status, keys[1].ID: keys[1].Status}
	assert.Equal(t, rumtypes.KeyStatusExpiring, statuses[created.Key.ID])
	assert.Equal(t, rumtypes.KeyStatusActive, statuses[rotated.ID])

	_, err = module.RotateKey(ctx, orgID, created.ID, rotated.ID, rumtypes.KeyOverlapOneDay)
	assert.True(t, errors.Ast(err, errors.TypeAlreadyExists), "one rotation at a time")

	require.NoError(t, module.RevokeKey(ctx, orgID, created.ID, created.Key.ID))
	assert.Equal(t, []valuer.UUID{rotated.ID}, policyKeys(t, module), "revoke ends the overlap early")

	_, err = module.RotateKey(ctx, orgID, created.ID, rotated.ID, rumtypes.KeyOverlapOneDay)
	assert.NoError(t, err)
}

func TestModuleDeleteRemovesKeys(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	require.NoError(t, module.Delete(ctx, orgID, created.ID))

	_, err = module.Get(ctx, orgID, created.ID)
	assert.True(t, errors.Ast(err, errors.TypeNotFound))
	assert.Empty(t, policyKeys(t, module))
}

func TestModuleOrgIsolation(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	otherOrg := valuer.GenerateUUID()
	_, err = module.Get(ctx, otherOrg, created.ID)
	assert.True(t, errors.Ast(err, errors.TypeNotFound))
	assert.True(t, errors.Ast(module.RevokeKey(ctx, otherOrg, created.ID, created.Key.ID), errors.TypeNotFound))
}

func TestModuleStatusBrowserBundle(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	status, err := module.Status(ctx, orgID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, rumtypes.BundledSDK{
		Name:      rumtypes.SDKBrowserName,
		Version:   browsersdk.Version(),
		Integrity: browsersdk.Integrity(),
		Path:      browsersdk.ScriptPath(browsersdk.Version()),
	}, status.BrowserBundle)
}
