package onboarding

import (
	"net/url"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

var ErrCodeInvalidConfig = errors.MustNewCode("onboarding_invalid_config")

type Config struct {
	// Base URL of the collector OTLP/HTTP receiver the backend checks it can reach; unset, none is checked.
	CollectorEndpoint string `mapstructure:"collector_endpoint"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("onboarding"), newConfig)
}

func newConfig() factory.Config {
	return &Config{}
}

func (c Config) Validate() error {
	if c.CollectorEndpoint == "" {
		return nil
	}
	endpoint, err := url.Parse(c.CollectorEndpoint)
	if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Host == "" {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "onboarding.collector_endpoint must be an http or https URL, got %q", c.CollectorEndpoint)
	}
	return nil
}
