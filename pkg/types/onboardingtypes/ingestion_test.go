package onboardingtypes

import (
	"net/url"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewIngestion(t *testing.T) {
	mustParse := func(raw string) *url.URL {
		u, err := url.Parse(raw)
		require.NoError(t, err)
		return u
	}
	unset := &url.URL{Host: "<unset>"}

	testCases := []struct {
		name             string
		organizationURL  string
		configURL        *url.URL
		externalURL      *url.URL
		requestHost      string
		expectedSource   IngestionSource
		expectedHTTP     string
		expectedGRPC     string
		expectedInsecure bool
	}{
		{
			name:             "OrganizationURL_WinsOverConfig",
			organizationURL:  "https://otlp.acme.io",
			configURL:        mustParse("https://ingest.config.io"),
			externalURL:      mustParse("https://fusescope.acme.io"),
			expectedSource:   IngestionSourceOrganization,
			expectedHTTP:     "https://otlp.acme.io",
			expectedGRPC:     "otlp.acme.io:443",
			expectedInsecure: false,
		},
		{
			name:             "ConfigURL_WinsOverDerivation",
			configURL:        mustParse("http://collector.internal:4318/"),
			externalURL:      mustParse("https://fusescope.acme.io"),
			expectedSource:   IngestionSourceConfig,
			expectedHTTP:     "http://collector.internal:4318",
			expectedGRPC:     "collector.internal:4317",
			expectedInsecure: true,
		},
		{
			name:             "ConfigURL_CustomPortKeptForGRPC",
			configURL:        mustParse("https://otel.example.org:8443/otlp"),
			expectedSource:   IngestionSourceConfig,
			expectedHTTP:     "https://otel.example.org:8443/otlp",
			expectedGRPC:     "otel.example.org:8443",
			expectedInsecure: false,
		},
		{
			name:             "ConfigURL_PlainHTTPWithoutPort_GRPCOnDefaultPort",
			configURL:        mustParse("http://otel.lan"),
			expectedSource:   IngestionSourceConfig,
			expectedHTTP:     "http://otel.lan",
			expectedGRPC:     "otel.lan:4317",
			expectedInsecure: true,
		},
		{
			name:             "Unset_DerivedFromExternalURL",
			configURL:        unset,
			externalURL:      mustParse("https://fusescope.acme.io:3301/base"),
			requestHost:      "ignored.example.com",
			expectedSource:   IngestionSourceDerived,
			expectedHTTP:     "http://fusescope.acme.io:4318",
			expectedGRPC:     "fusescope.acme.io:4317",
			expectedInsecure: true,
		},
		{
			name:             "UnsetParsedFromEnv_DerivedFromExternalURL",
			configURL:        mustParse("<unset>"),
			externalURL:      mustParse("http://10.0.0.7:8080"),
			expectedSource:   IngestionSourceDerived,
			expectedHTTP:     "http://10.0.0.7:4318",
			expectedGRPC:     "10.0.0.7:4317",
			expectedInsecure: true,
		},
		{
			name:             "UnsetExternalURL_DerivedFromRequestHost",
			configURL:        nil,
			externalURL:      unset,
			requestHost:      "obs.example.net:3301",
			expectedSource:   IngestionSourceDerived,
			expectedHTTP:     "http://obs.example.net:4318",
			expectedGRPC:     "obs.example.net:4317",
			expectedInsecure: true,
		},
		{
			name:             "IPv6RequestHost_Bracketed",
			requestHost:      "[::1]:8080",
			expectedSource:   IngestionSourceDerived,
			expectedHTTP:     "http://[::1]:4318",
			expectedGRPC:     "[::1]:4317",
			expectedInsecure: true,
		},
		{
			name:             "NothingKnown_Localhost",
			expectedSource:   IngestionSourceDerived,
			expectedHTTP:     "http://localhost:4318",
			expectedGRPC:     "localhost:4317",
			expectedInsecure: true,
		},
		{
			name:             "InvalidOrganizationURL_Ignored",
			organizationURL:  "not a url",
			configURL:        mustParse("https://ingest.config.io"),
			expectedSource:   IngestionSourceConfig,
			expectedHTTP:     "https://ingest.config.io",
			expectedGRPC:     "ingest.config.io:443",
			expectedInsecure: false,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ingestion := NewIngestion(testCase.organizationURL, testCase.configURL, testCase.externalURL, testCase.requestHost)

			assert.Equal(t, testCase.expectedSource, ingestion.Source)
			assert.Equal(t, testCase.expectedSource == IngestionSourceDerived, ingestion.Derived)
			assert.Equal(t, testCase.expectedHTTP, ingestion.OTLPHTTPEndpoint)
			assert.Equal(t, testCase.expectedGRPC, ingestion.OTLPGRPCEndpoint)
			assert.Equal(t, testCase.expectedInsecure, ingestion.OTLPGRPCInsecure)
			assert.False(t, ingestion.AuthRequired)
			assert.Nil(t, ingestion.Collector)
		})
	}
}

func TestNewIngestion_ReportsConfiguredValues(t *testing.T) {
	configURL, err := url.Parse("https://ingest.config.io")
	require.NoError(t, err)

	ingestion := NewIngestion("https://otlp.acme.io", configURL, nil, "")
	require.NotNil(t, ingestion.OrganizationURL)
	require.NotNil(t, ingestion.ConfigURL)
	assert.Equal(t, "https://otlp.acme.io", *ingestion.OrganizationURL)
	assert.Equal(t, "https://ingest.config.io", *ingestion.ConfigURL)

	ingestion = NewIngestion("", &url.URL{Host: "<unset>"}, nil, "")
	assert.Nil(t, ingestion.OrganizationURL)
	assert.Nil(t, ingestion.ConfigURL)
}

func TestUpdatableIngestion_Normalize(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected string
		pass     bool
	}{
		{name: "HTTPS", input: "https://otlp.acme.io", expected: "https://otlp.acme.io", pass: true},
		{name: "TrailingSlashAndSpaces_Trimmed", input: "  http://collector:4318/  ", expected: "http://collector:4318", pass: true},
		{name: "PathPrefix_Kept", input: "https://acme.io/otlp/", expected: "https://acme.io/otlp", pass: true},
		{name: "Empty_ClearsOverride", input: "", expected: "", pass: true},
		{name: "Blank_ClearsOverride", input: "   ", expected: "", pass: true},
		{name: "NoScheme_Rejected", input: "otlp.acme.io:4317", pass: false},
		{name: "GRPCScheme_Rejected", input: "grpc://otlp.acme.io:4317", pass: false},
		{name: "NoHost_Rejected", input: "https://", pass: false},
		{name: "UserInfo_Rejected", input: "https://user:secret@otlp.acme.io", pass: false},
		{name: "Query_Rejected", input: "https://otlp.acme.io?key=1", pass: false},
		{name: "Fragment_Rejected", input: "https://otlp.acme.io#x", pass: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			updatable := &UpdatableIngestion{IngestionURL: testCase.input}
			normalized, err := updatable.Normalize()
			if !testCase.pass {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, normalized)
		})
	}
}
