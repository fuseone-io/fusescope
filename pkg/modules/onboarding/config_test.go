package onboarding

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestConfigValidate(t *testing.T) {
	testCases := []struct {
		name     string
		endpoint string
		valid    bool
	}{
		{name: "Unset_Valid", endpoint: "", valid: true},
		{name: "HTTP_Valid", endpoint: "http://otel-collector:4318", valid: true},
		{name: "HTTPS_Valid", endpoint: "https://collector.example.com", valid: true},
		{name: "NoScheme_Invalid", endpoint: "otel-collector:4318"},
		{name: "OtherScheme_Invalid", endpoint: "grpc://otel-collector:4317"},
		{name: "NoHost_Invalid", endpoint: "http://"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			config := newConfig().(*Config)
			config.CollectorEndpoint = testCase.endpoint
			err := config.Validate()
			if testCase.valid {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
	assert.Empty(t, newConfig().(*Config).CollectorEndpoint)
}
