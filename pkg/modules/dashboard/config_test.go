package dashboard

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/ratelimit"
	"github.com/stretchr/testify/assert"
)

func TestConfigValidate(t *testing.T) {
	testCases := []struct {
		name    string
		mutate  func(*Config)
		wantErr bool
	}{
		{name: "Defaults_Valid", mutate: func(*Config) {}},
		{name: "LinkRateZero_Invalid", mutate: func(c *Config) { c.Public.RateLimit.Link = ratelimit.Limit{Rate: 0, Burst: 1} }, wantErr: true},
		{name: "ClientBurstZero_Invalid", mutate: func(c *Config) { c.Public.RateLimit.Client = ratelimit.Limit{Rate: 1, Burst: 0} }, wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			config := *newConfig().(*Config)
			testCase.mutate(&config)

			err := config.Validate()

			if testCase.wantErr {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
		})
	}
}
