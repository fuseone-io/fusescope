package implrumapplication

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
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
