package anomaly

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestConfigValidate(t *testing.T) {
	defaults := *newConfig().(*Config)
	assert.Equal(t, Config{MaxConcurrent: 4, MaxSeries: 1000, MaxPoints: 2_000_000}, defaults)
	assert.NoError(t, defaults.Validate())

	testCases := []struct {
		name   string
		mutate func(*Config)
	}{
		{name: "ZeroConcurrent", mutate: func(c *Config) { c.MaxConcurrent = 0 }},
		{name: "NegativeSeries", mutate: func(c *Config) { c.MaxSeries = -1 }},
		{name: "ZeroPoints", mutate: func(c *Config) { c.MaxPoints = 0 }},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			config := defaults
			testCase.mutate(&config)
			assert.Error(t, config.Validate())
		})
	}
}
