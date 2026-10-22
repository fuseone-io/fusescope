package rumtypes

import (
	"encoding/json"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplicationAllowsOrigin(t *testing.T) {
	testCases := []struct {
		name     string
		allowed  []string
		origin   string
		expected bool
	}{
		{name: "Exact_Allowed", allowed: []string{"https://shop.example.com"}, origin: "https://shop.example.com", expected: true},
		{name: "ExactCaseInsensitive_Allowed", allowed: []string{"https://Shop.Example.com"}, origin: "https://shop.example.com", expected: true},
		{name: "DifferentScheme_Denied", allowed: []string{"https://shop.example.com"}, origin: "http://shop.example.com", expected: false},
		{name: "DifferentPort_Denied", allowed: []string{"https://shop.example.com"}, origin: "https://shop.example.com:8443", expected: false},
		{name: "ExplicitPort_Allowed", allowed: []string{"http://localhost:3000"}, origin: "http://localhost:3000", expected: true},
		{name: "WildcardSubdomain_Allowed", allowed: []string{"https://*.example.com"}, origin: "https://eu.shop.example.com", expected: true},
		{name: "WildcardApex_Denied", allowed: []string{"https://*.example.com"}, origin: "https://example.com", expected: false},
		{name: "WildcardSuffixTrick_Denied", allowed: []string{"https://*.example.com"}, origin: "https://evilexample.com", expected: false},
		{name: "Any_Allowed", allowed: []string{"*"}, origin: "https://anything.test", expected: true},
		{name: "None_Denied", allowed: []string{}, origin: "https://shop.example.com", expected: false},
		{name: "NullOrigin_Denied", allowed: []string{"https://shop.example.com"}, origin: "null", expected: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			app := &Application{AllowedOrigins: testCase.allowed}
			assert.Equal(t, testCase.expected, app.AllowsOrigin(testCase.origin))
		})
	}
}

func TestPostableApplicationUnmarshal(t *testing.T) {
	testCases := []struct {
		name  string
		input string
		code  errors.Code
		check func(t *testing.T, postable *PostableApplication)
	}{
		{
			name:  "Minimal_Defaults",
			input: `{"name":"shop-web","platform":"web","environment":"production"}`,
			check: func(t *testing.T, postable *PostableApplication) {
				assert.Equal(t, 1.0, postable.SampleRate)
				assert.True(t, postable.PIIPolicy.DropQuery)
				assert.Equal(t, []string{}, postable.AllowedOrigins)
				assert.Equal(t, []string{}, postable.TracePropagationURLs)
				assert.Equal(t, []string{}, postable.PIIPolicy.QueryAllowlist)
			},
		},
		{
			name:  "Full_Kept",
			input: `{"name":"shop","platform":"web","environment":"staging","allowedOrigins":["https://*.example.com"],"tracePropagationUrls":["https://api.example.com"],"sampleRate":0.25,"piiPolicy":{"dropQuery":false,"queryAllowlist":["page"],"urlAllowlist":[],"geoLookup":true,"requireConsent":true,"hashUserId":true}}`,
			check: func(t *testing.T, postable *PostableApplication) {
				assert.Equal(t, 0.25, postable.SampleRate)
				assert.False(t, postable.PIIPolicy.DropQuery)
				assert.True(t, postable.PIIPolicy.GeoLookup)
				assert.True(t, postable.PIIPolicy.RequireConsent)
				assert.True(t, postable.PIIPolicy.HashUserID)
				assert.Equal(t, []string{"page"}, postable.PIIPolicy.QueryAllowlist)
			},
		},
		{name: "ReservedPlatform_Rejected", input: `{"name":"app","platform":"android","environment":"production"}`, code: ErrCodeApplicationInvalidInput},
		{name: "UnknownPlatform_Rejected", input: `{"name":"app","platform":"tv","environment":"production"}`, code: ErrCodeApplicationInvalidInput},
		{name: "BlankName_Rejected", input: `{"name":"  ","platform":"web","environment":"production"}`, code: ErrCodeApplicationInvalidInput},
		{name: "SampleRateAboveOne_Rejected", input: `{"name":"a","platform":"web","environment":"p","sampleRate":1.5}`, code: ErrCodeApplicationInvalidInput},
		{name: "OriginWithPath_Rejected", input: `{"name":"a","platform":"web","environment":"p","allowedOrigins":["https://a.com/path"]}`, code: ErrCodeApplicationInvalidInput},
		{name: "OriginWithoutScheme_Rejected", input: `{"name":"a","platform":"web","environment":"p","allowedOrigins":["a.com"]}`, code: ErrCodeApplicationInvalidInput},
		{name: "MidWildcardOrigin_Rejected", input: `{"name":"a","platform":"web","environment":"p","allowedOrigins":["https://a.*.com"]}`, code: ErrCodeApplicationInvalidInput},
		{name: "RelativePropagationURL_Rejected", input: `{"name":"a","platform":"web","environment":"p","tracePropagationUrls":["/api"]}`, code: ErrCodeApplicationInvalidInput},
		{name: "EmptyAllowlistedParam_Rejected", input: `{"name":"a","platform":"web","environment":"p","piiPolicy":{"queryAllowlist":[""]}}`, code: ErrCodeApplicationInvalidInput},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			postable := new(PostableApplication)
			err := json.Unmarshal([]byte(testCase.input), postable)
			if testCase.code != (errors.Code{}) {
				require.Error(t, err)
				_, code, _, _, _, _ := errors.Unwrapb(err)
				assert.Equal(t, testCase.code, code)
				return
			}
			require.NoError(t, err)
			testCase.check(t, postable)
		})
	}
}

func TestStorableApplicationRoundTrip(t *testing.T) {
	postable := new(PostableApplication)
	require.NoError(t, json.Unmarshal([]byte(`{"name":"shop","platform":"web","environment":"production","allowedOrigins":["https://shop.example.com"],"sampleRate":0.5,"piiPolicy":{"queryAllowlist":["page"]}}`), postable))

	orgID := valuer.GenerateUUID()
	app := NewApplication(orgID, "admin@example.com", postable)
	storable, err := NewStorableApplication(app)
	require.NoError(t, err)

	restored, err := NewApplicationFromStorable(storable)
	require.NoError(t, err)

	assert.Equal(t, app.ID, restored.ID)
	assert.Equal(t, orgID, restored.OrgID)
	assert.Equal(t, PlatformWeb, restored.Platform)
	assert.Equal(t, "admin@example.com", restored.CreatedBy)
	assert.Equal(t, []string{"https://shop.example.com"}, restored.AllowedOrigins)
	assert.Equal(t, 0.5, restored.SampleRate)
	assert.Equal(t, []string{"page"}, restored.PIIPolicy.QueryAllowlist)
	assert.True(t, restored.PIIPolicy.DropQuery)
}
