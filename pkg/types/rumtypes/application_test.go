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

func TestApplicationAllowsPackageName(t *testing.T) {
	testCases := []struct {
		name        string
		allowed     []string
		packageName string
		expected    bool
	}{
		{name: "Exact_Allowed", allowed: []string{"com.example.shop"}, packageName: "com.example.shop", expected: true},
		{name: "OtherPackage_Denied", allowed: []string{"com.example.shop"}, packageName: "com.example.shopping", expected: false},
		{name: "CaseSensitive_Denied", allowed: []string{"com.example.shop"}, packageName: "com.Example.shop", expected: false},
		{name: "Wildcard_Allowed", allowed: []string{"com.example.*"}, packageName: "com.example.shop.debug", expected: true},
		{name: "WildcardApex_Denied", allowed: []string{"com.example.*"}, packageName: "com.example", expected: false},
		{name: "WildcardSuffixTrick_Denied", allowed: []string{"com.example.*"}, packageName: "com.exampleevil.shop", expected: false},
		{name: "Any_Allowed", allowed: []string{"*"}, packageName: "org.anything", expected: true},
		{name: "Missing_Denied", allowed: []string{"*"}, packageName: "", expected: false},
		{name: "None_Denied", allowed: []string{}, packageName: "com.example.shop", expected: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			app := &Application{Platform: PlatformAndroid, AllowedPackageNames: testCase.allowed}
			assert.Equal(t, testCase.expected, app.AllowsPackageName(testCase.packageName))
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
				assert.Equal(t, NewDefaultSourceMapSettings(), postable.SourceMaps)
			},
		},
		{
			name:  "SourceMaps_PartialDefaults",
			input: `{"name":"shop","platform":"web","environment":"production","sourceMaps":{"retention":"30d"}}`,
			check: func(t *testing.T, postable *PostableApplication) {
				assert.Equal(t, SourceMapSettings{Retention: SourceMapRetention30Days, KeepNewestReleases: true}, postable.SourceMaps)
			},
		},
		{name: "SourceMapsUnknownRetention_Rejected", input: `{"name":"a","platform":"web","environment":"p","sourceMaps":{"retention":"7d"}}`, code: ErrCodeApplicationInvalidInput},
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
		{name: "ReservedPlatform_Rejected", input: `{"name":"app","platform":"ios","environment":"production"}`, code: ErrCodeApplicationInvalidInput},
		{
			name:  "Android_Accepted",
			input: `{"name":"shop-android","platform":"android","environment":"production","allowedPackageNames":[" com.example.shop ","com.example.*"]}`,
			check: func(t *testing.T, postable *PostableApplication) {
				assert.Equal(t, PlatformAndroid, postable.Platform)
				assert.Equal(t, []string{"com.example.shop", "com.example.*"}, postable.AllowedPackageNames)
				assert.Equal(t, []string{}, postable.AllowedOrigins)
			},
		},
		{
			name:  "WebWithoutPackageNames_Empty",
			input: `{"name":"shop","platform":"web","environment":"production"}`,
			check: func(t *testing.T, postable *PostableApplication) {
				assert.Equal(t, []string{}, postable.AllowedPackageNames)
			},
		},
		{name: "AndroidWithOrigins_Rejected", input: `{"name":"a","platform":"android","environment":"p","allowedOrigins":["https://a.com"]}`, code: ErrCodeApplicationInvalidInput},
		{name: "WebWithPackageNames_Rejected", input: `{"name":"a","platform":"web","environment":"p","allowedPackageNames":["com.example.shop"]}`, code: ErrCodeApplicationInvalidInput},
		{name: "SingleSegmentPackageName_Rejected", input: `{"name":"a","platform":"android","environment":"p","allowedPackageNames":["shop"]}`, code: ErrCodeApplicationInvalidInput},
		{name: "PackageNameDigitSegment_Rejected", input: `{"name":"a","platform":"android","environment":"p","allowedPackageNames":["com.1shop"]}`, code: ErrCodeApplicationInvalidInput},
		{name: "PackageNameMidWildcard_Rejected", input: `{"name":"a","platform":"android","environment":"p","allowedPackageNames":["com.*.shop"]}`, code: ErrCodeApplicationInvalidInput},
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

func TestStorableApplicationPackageNames(t *testing.T) {
	testCases := []struct {
		name     string
		data     string
		expected []string
	}{
		{name: "Stored", data: `{"allowedPackageNames":["com.example.shop"]}`, expected: []string{"com.example.shop"}},
		{name: "BeforePackageNames_Empty", data: `{"sampleRate":1}`, expected: []string{}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			restored, err := NewApplicationFromStorable(&StorableApplication{Data: testCase.data})
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, restored.AllowedPackageNames)

			storable, err := NewStorableApplication(restored)
			require.NoError(t, err)
			again, err := NewApplicationFromStorable(storable)
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, again.AllowedPackageNames)
		})
	}
}

func TestApplicationUpdatePackageNames(t *testing.T) {
	testCases := []struct {
		name     string
		platform Platform
		input    string
		expected []string
		fails    bool
	}{
		{name: "Android_Replaced", platform: PlatformAndroid, input: `{"name":"shop","environment":"production","allowedPackageNames":["com.example.app"]}`, expected: []string{"com.example.app"}},
		{name: "AndroidOrigins_Rejected", platform: PlatformAndroid, input: `{"name":"shop","environment":"production","allowedOrigins":["https://a.com"]}`, fails: true},
		{name: "WebPackageNames_Rejected", platform: PlatformWeb, input: `{"name":"shop","environment":"production","allowedPackageNames":["com.example.app"]}`, fails: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			app := &Application{Name: "shop", Platform: testCase.platform, Environment: "production", SourceMaps: NewDefaultSourceMapSettings()}
			updatable := new(UpdatableApplication)
			require.NoError(t, json.Unmarshal([]byte(testCase.input), updatable))
			err := app.Update(updatable)
			if testCase.fails {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, app.AllowedPackageNames)
		})
	}
}

func TestStorableApplicationSourceMaps(t *testing.T) {
	testCases := []struct {
		name     string
		data     string
		expected SourceMapSettings
	}{
		{name: "Stored", data: `{"sourceMaps":{"retention":"never","keepNewestReleases":false}}`, expected: SourceMapSettings{Retention: SourceMapRetentionNever}},
		{name: "BeforeSourceMaps_Defaults", data: `{"sampleRate":1}`, expected: NewDefaultSourceMapSettings()},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			restored, err := NewApplicationFromStorable(&StorableApplication{Data: testCase.data})
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, restored.SourceMaps)
		})
	}
}

func TestApplicationUpdateSourceMaps(t *testing.T) {
	never := SourceMapSettings{Retention: SourceMapRetentionNever}
	testCases := []struct {
		name     string
		input    string
		expected SourceMapSettings
	}{
		{name: "Omitted_Kept", input: `{"name":"shop","environment":"production"}`, expected: never},
		{name: "Given_Replaced", input: `{"name":"shop","environment":"production","sourceMaps":{"retention":"1y"}}`, expected: SourceMapSettings{Retention: SourceMapRetentionOneYear, KeepNewestReleases: true}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			app := &Application{Name: "shop", Platform: PlatformWeb, Environment: "production", SourceMaps: never}
			updatable := new(UpdatableApplication)
			require.NoError(t, json.Unmarshal([]byte(testCase.input), updatable))
			require.NoError(t, app.Update(updatable))
			assert.Equal(t, testCase.expected, app.SourceMaps)
		})
	}
}
