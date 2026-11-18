package onboardingtypes

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRUMEndpointIndependentOfOTLP(t *testing.T) {
	testCases := []struct {
		name, organization, config, expected string
		source                               IngestionSource
	}{
		{name: "Unset_Derived", source: IngestionSourceDerived},
		{name: "Config_RUMListener", config: "https://rum.example.com/rum/v1/", expected: "https://rum.example.com", source: IngestionSourceConfig},
		{name: "Organization_Wins", organization: "https://mobile.example.org/prefix/rum/v1", config: "https://collector.example.net", expected: "https://mobile.example.org/prefix", source: IngestionSourceOrganization},
		{name: "InvalidOverride_UsesConfig", organization: "https://user:secret@wrong.example.com", config: "https://rum.config.io", expected: "https://rum.config.io", source: IngestionSourceConfig},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ingestion := NewIngestion("https://otlp.example.com", nil, nil, "")
			config, err := url.Parse(testCase.config)
			require.NoError(t, err)
			ingestion.SetRUMEndpoint(testCase.organization, config)
			assert.Equal(t, testCase.expected, ingestion.RUMEndpoint)
			assert.Equal(t, testCase.source, ingestion.RUMSource)
			assert.Equal(t, testCase.source == IngestionSourceDerived, ingestion.RUMDerived)
			assert.Equal(t, "https://otlp.example.com", ingestion.OTLPHTTPEndpoint)
		})
	}
}

func TestNormalizeRUMURL(t *testing.T) {
	testCases := []struct {
		name, input, expected string
		valid                 bool
	}{
		{name: "Clear", input: " ", valid: true},
		{name: "BasePath", input: " https://rum.acme.io/observe/rum/v1/ ", expected: "https://rum.acme.io/observe", valid: true},
		{name: "Credentials_Rejected", input: "https://admin:secret@rum.acme.io"},
		{name: "Query_Rejected", input: "https://rum.acme.io?token=secret"},
		{name: "InvalidScheme_Rejected", input: "file:///tmp/rum"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			actual, err := NormalizeRUMURL(testCase.input)
			if !testCase.valid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, actual)
		})
	}
}
