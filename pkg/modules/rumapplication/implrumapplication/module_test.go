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

	for _, model := range []any{(*rumtypes.StorableApplication)(nil), (*rumtypes.ApplicationKey)(nil), (*rumtypes.StorableSourceMap)(nil)} {
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

func newTestPostable(t *testing.T, raw string) *rumtypes.PostableApplication {
	t.Helper()
	postable := new(rumtypes.PostableApplication)
	require.NoError(t, json.Unmarshal([]byte(raw), postable))
	return postable
}

func TestModuleCreateIssuesKeyAndAuthenticates(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)

	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production","allowedOrigins":["https://shop.example.com"]}`))
	require.NoError(t, err)
	require.NotNil(t, created.Key)
	assert.Equal(t, rumtypes.KeyStatusActive, created.Key.Status)

	application, keyID, err := module.Authenticate(ctx, created.Key.Key)
	require.NoError(t, err)
	assert.Equal(t, created.ID, application.ID)
	assert.Equal(t, created.Key.ID, keyID)

	_, err = module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"staging"}`))
	assert.True(t, errors.Ast(err, errors.TypeAlreadyExists))
}

func TestModuleAuthenticateRejects(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	require.NoError(t, module.RevokeKey(ctx, orgID, created.ID, created.Key.ID))

	testCases := []struct {
		name        string
		key         string
		application bool
	}{
		{name: "Malformed_NoApplication", key: "not-a-key"},
		{name: "Unknown_NoApplication", key: rumtypes.KeyPrefix + "unknownunknownunknownunknownunkn"},
		{name: "Revoked_ApplicationResolved", key: created.Key.Key, application: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			application, _, err := module.Authenticate(ctx, testCase.key)
			require.Error(t, err)
			assert.True(t, errors.Ast(err, errors.TypeUnauthenticated))
			assert.Equal(t, testCase.application, application != nil)
		})
	}
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

	for _, plaintext := range []string{created.Key.Key, rotated.Key} {
		_, _, err := module.Authenticate(ctx, plaintext)
		assert.NoError(t, err, "both keys work during the overlap")
	}

	keys, err := module.ListKeys(ctx, orgID, created.ID)
	require.NoError(t, err)
	require.Len(t, keys, 2)
	statuses := map[valuer.UUID]rumtypes.KeyStatus{keys[0].ID: keys[0].Status, keys[1].ID: keys[1].Status}
	assert.Equal(t, rumtypes.KeyStatusExpiring, statuses[created.Key.ID])
	assert.Equal(t, rumtypes.KeyStatusActive, statuses[rotated.ID])

	_, err = module.RotateKey(ctx, orgID, created.ID, rotated.ID, rumtypes.KeyOverlapOneDay)
	assert.True(t, errors.Ast(err, errors.TypeAlreadyExists), "one rotation at a time")

	require.NoError(t, module.RevokeKey(ctx, orgID, created.ID, created.Key.ID))
	_, _, err = module.Authenticate(ctx, created.Key.Key)
	assert.True(t, errors.Ast(err, errors.TypeUnauthenticated), "revoke ends the overlap early")

	_, err = module.RotateKey(ctx, orgID, created.ID, rotated.ID, rumtypes.KeyOverlapOneDay)
	assert.NoError(t, err)
}

func TestModuleUpdateClearsCache(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production","allowedOrigins":["https://a.example.com"]}`))
	require.NoError(t, err)

	_, _, err = module.Authenticate(ctx, created.Key.Key)
	require.NoError(t, err)

	updatable := new(rumtypes.UpdatableApplication)
	require.NoError(t, json.Unmarshal([]byte(`{"name":"web","environment":"production","allowedOrigins":["https://b.example.com"]}`), updatable))
	_, err = module.Update(ctx, orgID, created.ID, updatable)
	require.NoError(t, err)

	application, _, err := module.Authenticate(ctx, created.Key.Key)
	require.NoError(t, err)
	assert.Equal(t, []string{"https://b.example.com"}, application.AllowedOrigins)
}

func TestModuleDeleteRemovesKeys(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	require.NoError(t, module.Delete(ctx, orgID, created.ID))

	_, err = module.Get(ctx, orgID, created.ID)
	assert.True(t, errors.Ast(err, errors.TypeNotFound))
	_, _, err = module.Authenticate(ctx, created.Key.Key)
	assert.True(t, errors.Ast(err, errors.TypeUnauthenticated))
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

func TestModuleFlushUsage(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	application, keyID, err := module.Authenticate(ctx, created.Key.Key)
	require.NoError(t, err)
	module.ObserveIngest(application, keyID, &rumtypes.IngestBatch{SessionIDs: []string{"s"}})

	status, err := module.Status(ctx, orgID, created.ID)
	require.NoError(t, err)
	assert.NotNil(t, status.FirstSeenAt)
	assert.Equal(t, int64(1), status.Counts.Sessions)

	require.NoError(t, module.FlushUsage(ctx))

	stored, err := module.Get(ctx, orgID, created.ID)
	require.NoError(t, err)
	assert.NotNil(t, stored.FirstSeenAt)

	keys, err := module.ListKeys(ctx, orgID, created.ID)
	require.NoError(t, err)
	require.Len(t, keys, 1)
	assert.NotNil(t, keys[0].LastUsedAt)
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
