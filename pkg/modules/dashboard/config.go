package dashboard

import (
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/ratelimit"
)

var ErrCodeInvalidConfig = errors.MustNewCode("dashboard_invalid_config")

type Config struct {
	Public PublicConfig `mapstructure:"public"`
}

type PublicConfig struct {
	RateLimit PublicRateLimitConfig `mapstructure:"ratelimit"`
}

// PublicRateLimitConfig bounds anonymous public dashboard requests, in memory and per process.
type PublicRateLimitConfig struct {
	// Token bucket shared by every visitor of one public link.
	Link ratelimit.Limit `mapstructure:"link"`

	// Token bucket per client IP across all public links. The IP is kept in memory only.
	Client ratelimit.Limit `mapstructure:"client"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("dashboard"), newConfig)
}

func newConfig() factory.Config {
	return &Config{
		Public: PublicConfig{
			RateLimit: PublicRateLimitConfig{
				Link:   ratelimit.Limit{Rate: 20, Burst: 200},
				Client: ratelimit.Limit{Rate: 5, Burst: 100},
			},
		},
	}
}

func (c Config) Validate() error {
	for _, limit := range []ratelimit.Limit{c.Public.RateLimit.Link, c.Public.RateLimit.Client} {
		if limit.Rate <= 0 || limit.Burst <= 0 {
			return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "dashboard.public.ratelimit rates and bursts must be positive")
		}
	}
	return nil
}
