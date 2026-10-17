package authdomain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
)

func oidcDomainConfig(name string, clientSecret string) DomainConfig {
	return DomainConfig{
		Name: name,
		Config: map[string]any{
			"kind": "oidc",
			"spec": map[string]any{"issuer": "https://login.microsoftonline.com/tenant/v2.0", "clientId": "fusescope", "clientSecret": clientSecret},
		},
		RoleMapping: map[string]any{"defaultRole": "VIEWER", "groupMappings": map[string]any{"fusescope-admins": "ADMIN"}},
	}
}

func TestConfigManagedDomains(t *testing.T) {
	t.Setenv("FUSESCOPE_TEST_SSO_SECRET", "from-env")

	disabled := false
	config := Config{ReconcileInterval: time.Minute, Domains: []DomainConfig{
		oidcDomainConfig("acme.test", "${FUSESCOPE_TEST_SSO_SECRET}"),
		func() DomainConfig {
			domain := oidcDomainConfig("other.test", "pa$$word")
			domain.Org = "Other Org"
			domain.Enabled = &disabled
			return domain
		}(),
	}}

	require.NoError(t, config.Validate())

	domains, err := config.ManagedDomains()
	require.NoError(t, err)
	require.Len(t, domains, 2)

	assert.Equal(t, "acme.test", domains[0].Postable.Name)
	assert.Empty(t, domains[0].Org)
	assert.True(t, domains[0].Postable.Enabled, "enabled defaults to true")
	oidcConfig, err := domains[0].Postable.Config.OIDCConfig()
	require.NoError(t, err)
	assert.Equal(t, "from-env", oidcConfig.ClientSecret)
	assert.Equal(t, authtypes.NormalizeRoleName("ADMIN"), domains[0].Postable.RoleMapping.GroupMappings["fusescope-admins"])

	assert.Equal(t, "Other Org", domains[1].Org)
	assert.False(t, domains[1].Postable.Enabled)
	oidcConfig, err = domains[1].Postable.Config.OIDCConfig()
	require.NoError(t, err)
	assert.Equal(t, "pa$$word", oidcConfig.ClientSecret, "only ${NAME} references are expanded")
}

func TestConfigValidate(t *testing.T) {
	testCases := []struct {
		name    string
		domains []DomainConfig
	}{
		{name: "MissingEnvironmentVariable", domains: []DomainConfig{oidcDomainConfig("acme.test", "${FUSESCOPE_TEST_SSO_UNSET}")}},
		{name: "InvalidDomainName", domains: []DomainConfig{oidcDomainConfig("not a domain", "secret")}},
		{name: "MissingClientSecret", domains: []DomainConfig{oidcDomainConfig("acme.test", "")}},
		{name: "UnknownKind", domains: []DomainConfig{{Name: "acme.test", Config: map[string]any{"kind": "kerberos", "spec": map[string]any{}}}}},
		{name: "MissingConfig", domains: []DomainConfig{{Name: "acme.test"}}},
		{name: "DuplicateName", domains: []DomainConfig{oidcDomainConfig("acme.test", "a"), oidcDomainConfig("ACME.test", "b")}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Error(t, Config{ReconcileInterval: time.Minute, Domains: testCase.domains}.Validate())
		})
	}
}

func TestConfigWithoutDomainsIsValid(t *testing.T) {
	require.NoError(t, Config{ReconcileInterval: time.Minute}.Validate())

	domains, err := Config{}.ManagedDomains()
	require.NoError(t, err)
	assert.Empty(t, domains)
}

func TestConfigReconcileInterval(t *testing.T) {
	assert.Equal(t, time.Minute, newConfig().(Config).ReconcileInterval)
	assert.Error(t, Config{ReconcileInterval: 0}.Validate())
	assert.Error(t, Config{ReconcileInterval: -time.Second}.Validate())
}
