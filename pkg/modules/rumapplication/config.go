package rumapplication

import (
	"net/url"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

var ErrCodeInvalidConfig = errors.MustNewCode("rum_invalid_config")

type Config struct {
	// Serves the ingestion gateway under /rum/v1.
	Enabled bool `mapstructure:"enabled"`

	// Base URL of the collector OTLP/HTTP receiver; /v1/traces and /v1/logs are appended.
	CollectorEndpoint string `mapstructure:"collector_endpoint"`

	// Timeout of one forward to the collector.
	ForwardTimeout time.Duration `mapstructure:"forward_timeout"`

	// Largest accepted request body in bytes, applied before and after gzip decoding.
	MaxBodySize int64 `mapstructure:"max_body_size"`

	// How long a key lookup, found or not, is cached.
	KeyCacheTTL time.Duration `mapstructure:"key_cache_ttl"`

	// How often key last-used and application first-seen times are written.
	UsageFlushInterval time.Duration `mapstructure:"usage_flush_interval"`

	RateLimit RateLimitConfig `mapstructure:"ratelimit"`
}

type RateLimitConfig struct {
	// Token bucket shared by every client of one key.
	Key LimitConfig `mapstructure:"key"`

	// Token bucket per key and client IP. The IP is kept in memory only.
	Client LimitConfig `mapstructure:"client"`

	// Use the first X-Forwarded-For address as the client IP. Enable only behind a proxy that sets it.
	TrustForwardedFor bool `mapstructure:"trust_forwarded_for"`
}

type LimitConfig struct {
	// Requests per second.
	Rate float64 `mapstructure:"rate"`

	Burst int `mapstructure:"burst"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("rum"), newConfig)
}

func newConfig() factory.Config {
	return &Config{
		Enabled:            true,
		CollectorEndpoint:  "http://localhost:4318",
		ForwardTimeout:     10 * time.Second,
		MaxBodySize:        4 << 20,
		KeyCacheTTL:        30 * time.Second,
		UsageFlushInterval: time.Minute,
		RateLimit: RateLimitConfig{
			Key:    LimitConfig{Rate: 500, Burst: 1000},
			Client: LimitConfig{Rate: 20, Burst: 60},
		},
	}
}

func (c Config) Validate() error {
	if !c.Enabled {
		return nil
	}

	endpoint, err := url.Parse(c.CollectorEndpoint)
	if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Host == "" {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "rum.collector_endpoint must be an http or https URL, got %q", c.CollectorEndpoint)
	}
	if c.MaxBodySize <= 0 || c.ForwardTimeout <= 0 || c.KeyCacheTTL <= 0 || c.UsageFlushInterval <= 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "rum.max_body_size, rum.forward_timeout, rum.key_cache_ttl and rum.usage_flush_interval must be positive")
	}
	for _, limit := range []LimitConfig{c.RateLimit.Key, c.RateLimit.Client} {
		if limit.Rate <= 0 || limit.Burst <= 0 {
			return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "rum.ratelimit rates and bursts must be positive")
		}
	}
	return nil
}
