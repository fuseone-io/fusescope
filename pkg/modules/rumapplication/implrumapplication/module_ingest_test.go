package implrumapplication

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModuleIngestPolicyContent(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	otherOrg := valuer.GenerateUUID()

	web, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop-web","platform":"web","environment":"production","allowedOrigins":["https://shop.example.com","https://*.cdn.example.com"],"piiPolicy":{"dropQuery":true,"queryAllowlist":["page"],"urlAllowlist":[]}}`))
	require.NoError(t, err)
	android, err := module.Create(ctx, otherOrg, "admin@example.com", newTestPostable(t, `{"name":"shop-android","platform":"android","environment":"staging","allowedPackageNames":["com.example.shop"]}`))
	require.NoError(t, err)

	rotated, err := module.RotateKey(ctx, orgID, web.ID, web.Key.ID, rumtypes.KeyOverlapOneHour)
	require.NoError(t, err)
	require.NoError(t, module.RevokeKey(ctx, otherOrg, android.ID, android.Key.ID))
	replacement, err := module.CreateKey(ctx, otherOrg, android.ID)
	require.NoError(t, err)

	content, err := module.IngestPolicyContent(ctx, time.Now())
	require.NoError(t, err)

	apps := map[string]ingestpolicy.RUMApplication{}
	for _, app := range content.Applications {
		apps[app.ID] = app
	}
	require.Len(t, apps, 2)
	assert.Zero(t, content.Skipped)

	assert.Equal(t, ingestpolicy.RUMApplication{
		ID: web.ID.StringValue(), OrgID: orgID.StringValue(), Name: "shop-web", Environment: "production", Platform: ingestpolicy.PlatformWeb,
		AllowedOrigins: []string{"https://shop.example.com", "https://*.cdn.example.com"}, AllowedPackageNames: []string{},
		PIIPolicy: ingestpolicy.PIIPolicy{DropQuery: true, QueryAllowlist: []string{"page"}, URLAllowlist: []string{}},
	}, apps[web.ID.StringValue()])
	assert.Equal(t, ingestpolicy.PlatformAndroid, apps[android.ID.StringValue()].Platform)
	assert.Equal(t, []string{"com.example.shop"}, apps[android.ID.StringValue()].AllowedPackageNames)

	keys := map[string]ingestpolicy.Key{}
	for _, key := range content.Keys {
		keys[key.ID] = key
	}
	require.Len(t, keys, 3, "usable keys only: the rotated pair and the android replacement")
	assert.NotContains(t, keys, android.Key.ID.StringValue(), "a revoked key is never published")
	old := keys[web.Key.ID.StringValue()]
	require.NotNil(t, old.ExpiresAt, "the rotated key carries the end of its overlap")
	_, err = time.Parse(time.RFC3339, *old.ExpiresAt)
	require.NoError(t, err)
	assert.Nil(t, keys[rotated.ID.StringValue()].ExpiresAt)
	fresh := keys[replacement.ID.StringValue()]
	androidID := android.ID.StringValue()
	assert.Equal(t, ingestpolicy.Key{
		ID: replacement.ID.StringValue(), SHA256: rumtypes.HashKey(replacement.Key), OrgID: otherOrg.StringValue(),
		Kind: ingestpolicy.KindPublic, Signals: []string{"traces", "logs"}, ApplicationID: &androidID,
	}, fresh)

	for i := 1; i < len(content.Applications); i++ {
		assert.Less(t, content.Applications[i-1].ID, content.Applications[i].ID, "ordered, so equal content encodes equally")
	}
	for i := 1; i < len(content.Keys); i++ {
		assert.Less(t, content.Keys[i-1].ID, content.Keys[i].ID)
	}

	policy := &ingestpolicy.Policy{SchemaVersion: 1, Version: 1, IssuedAt: "2026-11-03T12:00:00Z", Keys: content.Keys, RUMApplications: content.Applications}
	data, err := json.Marshal(policy)
	require.NoError(t, err)
	_, err = ingestpolicy.Parse(data)
	require.NoError(t, err, "the collector accepts it")
	require.NoError(t, ingestpolicy.Validate(policy))
	assert.NotContains(t, string(data), web.Key.Key, "verifiers only, never a key")
	assert.NotContains(t, string(data), replacement.Key)
}

// An application the collector would reject is left out with its keys, so
// it cannot hold back every other change, a revocation included.
func TestModuleIngestPolicyContentSkipsInvalid(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	good, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"good","platform":"web","environment":"production","allowedOrigins":["https://good.example.com"]}`))
	require.NoError(t, err)
	bad, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"bad","platform":"web","environment":"production"}`))
	require.NoError(t, err)

	storable, err := module.store.GetApplication(ctx, orgID, bad.ID)
	require.NoError(t, err)
	storable.Environment = strings.Repeat("e", 65) // over the collector's 64 bytes
	require.NoError(t, module.store.UpdateApplication(ctx, storable))

	content, err := module.IngestPolicyContent(ctx, time.Now())
	require.NoError(t, err)
	require.Len(t, content.Applications, 1)
	assert.Equal(t, good.ID.StringValue(), content.Applications[0].ID)
	require.Len(t, content.Keys, 1)
	assert.Equal(t, good.Key.ID.StringValue(), content.Keys[0].ID)
	assert.Equal(t, 1, content.Skipped)
}

func TestModuleOnChange(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	calls := 0
	module.OnChange(func() { calls++ })

	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	assert.Equal(t, 1, calls)
	require.NoError(t, module.RevokeKey(ctx, orgID, created.ID, created.Key.ID))
	assert.Equal(t, 2, calls, "a revocation reaches the publisher at once")
}

func generation(t *testing.T, module *module) int64 {
	t.Helper()
	row := new(ingesttypes.StorableRevision)
	err := module.store.(*store).sqlstore.BunDB().NewSelect().Model(row).Where("id = ?", ingesttypes.RevisionID).Scan(context.Background())
	if err != nil {
		return 0
	}
	return row.Generation
}

// Every change of the content is recorded in its own transaction, so a
// replica that stops after the commit cannot lose it.
func TestModuleRecordsIngestPolicyChanges(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)

	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	assert.Equal(t, int64(1), generation(t, module))

	_, err = module.Update(ctx, orgID, created.ID, &rumtypes.UpdatableApplication{Name: "shop", Environment: "staging", AllowedOrigins: []string{}, AllowedPackageNames: []string{}, TracePropagationURLs: []string{}, SampleRate: 1, PIIPolicy: rumtypes.NewDefaultPIIPolicy()})
	require.NoError(t, err)
	assert.Equal(t, int64(2), generation(t, module))

	_, err = module.CreateKey(ctx, orgID, created.ID)
	require.Error(t, err, "a usable key exists")
	assert.Equal(t, int64(2), generation(t, module), "a failed change records nothing")

	rotated, err := module.RotateKey(ctx, orgID, created.ID, created.Key.ID, rumtypes.KeyOverlapOneHour)
	require.NoError(t, err)
	assert.Equal(t, int64(3), generation(t, module))
	require.NoError(t, module.RevokeKey(ctx, orgID, created.ID, rotated.ID))
	assert.Equal(t, int64(4), generation(t, module))
	require.NoError(t, module.Delete(ctx, orgID, created.ID))
	assert.Equal(t, int64(5), generation(t, module))
}

// A deployment holds at most MaxApplications applications, so the policy at
// capacity still publishes and the next creation is refused instead.
func TestModuleApplicationLimit(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	db := module.store.(*store).sqlstore.BunDB()

	now := time.Now()
	applications := make([]*rumtypes.StorableApplication, 0, ingestpolicy.MaxApplications)
	keys := make([]*rumtypes.ApplicationKey, 0, ingestpolicy.MaxApplications)
	for i := range ingestpolicy.MaxApplications {
		application := rumtypes.NewApplication(orgID, "admin@example.com", newTestPostable(t, fmt.Sprintf(`{"name":"app-%d","platform":"web","environment":"production","allowedOrigins":["https://app-%d.example.com"]}`, i, i)))
		storable, err := rumtypes.NewStorableApplication(application)
		require.NoError(t, err)
		applications = append(applications, storable)
		key, _, err := rumtypes.NewApplicationKey(orgID, application.ID, now)
		require.NoError(t, err)
		keys = append(keys, key)
	}
	_, err := db.NewInsert().Model(&applications).Exec(ctx)
	require.NoError(t, err)
	_, err = db.NewInsert().Model(&keys).Exec(ctx)
	require.NoError(t, err)

	_, err = module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"one-too-many","platform":"web","environment":"production"}`))
	require.Error(t, err)
	assert.True(t, errors.Asc(err, rumtypes.ErrCodeApplicationLimit), "application 10 001 is refused: %v", err)

	content, err := module.IngestPolicyContent(ctx, now)
	require.NoError(t, err)
	require.Len(t, content.Applications, ingestpolicy.MaxApplications)
	policy := &ingestpolicy.Policy{SchemaVersion: 1, Version: 1, IssuedAt: "2026-11-03T12:00:00Z", Keys: content.Keys, RUMApplications: content.Applications}
	require.NoError(t, ingestpolicy.Validate(policy), "the policy at capacity is still publishable")

	require.NoError(t, module.Delete(ctx, orgID, applications[0].ID))
	_, err = module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"fits-again","platform":"web","environment":"production"}`))
	require.NoError(t, err)
}

func TestValidateForIngest(t *testing.T) {
	application := rumtypes.NewApplication(valuer.GenerateUUID(), "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, validateForIngest(application))
	application.Environment = strings.Repeat("e", 65)
	err := validateForIngest(application)
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
}

// Keys past their overlap are not loaded at all, so rotations that pile up
// expired keys do not grow what a revision reads.
func TestModuleIngestPolicyContentAt(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"shop","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	rotated, err := module.RotateKey(ctx, orgID, created.ID, created.Key.ID, rumtypes.KeyOverlapOneHour)
	require.NoError(t, err)

	content, err := module.IngestPolicyContent(ctx, time.Now())
	require.NoError(t, err)
	assert.Len(t, content.Keys, 2)
	content, err = module.IngestPolicyContent(ctx, time.Now().Add(2*time.Hour))
	require.NoError(t, err)
	require.Len(t, content.Keys, 1, "the expired key is left out at a later time")
	assert.Equal(t, rotated.ID.StringValue(), content.Keys[0].ID)
}
