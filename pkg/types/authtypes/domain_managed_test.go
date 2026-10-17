package authtypes

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func newTestPostableAuthDomain(t *testing.T, issuer string) *PostableAuthDomain {
	t.Helper()

	var postable PostableAuthDomain
	require.NoError(t, json.Unmarshal([]byte(`{
		"name": "acme.test",
		"enabled": true,
		"config": {"kind": "oidc", "spec": {"issuer": "`+issuer+`", "clientId": "id", "clientSecret": "secret"}},
		"roleMapping": {"defaultRole": "VIEWER"}
	}`), &postable))

	return &postable
}

func TestNewManagedAuthDomain(t *testing.T) {
	orgID := valuer.GenerateUUID()

	domain, err := NewManagedAuthDomain(newTestPostableAuthDomain(t, "https://idp.acme.test"), orgID)
	require.NoError(t, err)

	assert.True(t, domain.IsManaged())
	assert.Equal(t, "acme.test", domain.StorableAuthDomain().Name)
	assert.Equal(t, orgID, domain.StorableAuthDomain().OrgID)

	reloaded, err := NewAuthDomainFromStorableAuthDomain(domain.StorableAuthDomain())
	require.NoError(t, err)
	assert.True(t, reloaded.IsManaged(), "the managed marker must survive storage")
}

func TestAuthDomainCreatedFromAPIIsNotManaged(t *testing.T) {
	domain, err := NewAuthDomainFromPostableAuthDomain(newTestPostableAuthDomain(t, "https://idp.acme.test"), valuer.GenerateUUID())
	require.NoError(t, err)

	assert.False(t, domain.IsManaged())
	assert.NotContains(t, domain.StorableAuthDomain().Data, "managedBy")
}

func TestReplaceManaged(t *testing.T) {
	testCases := []struct {
		name            string
		existingManaged bool
		issuer          string
		expectedChanged bool
	}{
		{name: "ManagedUnchanged_NoChange", existingManaged: true, issuer: "https://idp.acme.test", expectedChanged: false},
		{name: "ManagedConfigChanged_Changed", existingManaged: true, issuer: "https://new-idp.acme.test", expectedChanged: true},
		{name: "UnmanagedAdopted_Changed", existingManaged: false, issuer: "https://idp.acme.test", expectedChanged: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			orgID := valuer.GenerateUUID()
			var existing *AuthDomain
			var err error
			if testCase.existingManaged {
				existing, err = NewManagedAuthDomain(newTestPostableAuthDomain(t, "https://idp.acme.test"), orgID)
			} else {
				existing, err = NewAuthDomainFromPostableAuthDomain(newTestPostableAuthDomain(t, "https://idp.acme.test"), orgID)
			}
			require.NoError(t, err)
			id := existing.StorableAuthDomain().ID

			changed, err := existing.ReplaceManaged(newTestPostableAuthDomain(t, testCase.issuer))
			require.NoError(t, err)

			assert.Equal(t, testCase.expectedChanged, changed)
			assert.True(t, existing.IsManaged())
			assert.Equal(t, id, existing.StorableAuthDomain().ID)

			oidcConfig, err := existing.Config().OIDCConfig()
			require.NoError(t, err)
			assert.Equal(t, testCase.issuer, oidcConfig.Issuer)
		})
	}
}

func TestGettableAuthDomainExposesManagedBy(t *testing.T) {
	domain, err := NewManagedAuthDomain(newTestPostableAuthDomain(t, "https://idp.acme.test"), valuer.GenerateUUID())
	require.NoError(t, err)

	data, err := json.Marshal(NewGettableAuthDomainFromAuthDomain(domain, &AuthNProviderInfo{}))
	require.NoError(t, err)

	assert.Contains(t, string(data), `"managedBy":"config"`)
}
