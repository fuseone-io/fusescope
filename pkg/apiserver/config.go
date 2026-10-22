package apiserver

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	httpserver "github.com/fuseone-io/fusescope/pkg/http/server"
)

// Config holds the configuration for config.
type Config struct {
	httpserver.Config `mapstructure:",squash" yaml:",squash"`
	Timeout           Timeout `mapstructure:"timeout"`
	Logging           Logging `mapstructure:"logging"`
}

type Timeout struct {
	// The default context timeout that can be overridden by the request
	Default time.Duration `mapstructure:"default"`
	// The maximum allowed context timeout
	Max time.Duration `mapstructure:"max"`
	// The list of routes that are excluded from the timeout
	ExcludedRoutes []string `mapstructure:"excluded_routes"`
}

type Logging struct {
	// The list of routes that are excluded from the logging
	ExcludedRoutes []string `mapstructure:"excluded_routes"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("apiserver"), newConfig)
}

func newConfig() factory.Config {
	return &Config{
		Config: httpserver.Config{
			Address:     "0.0.0.0:8080",
			ReadTimeout: 60 * time.Second,
		},
		Timeout: Timeout{
			Default: 60 * time.Second,
			Max:     600 * time.Second,
			ExcludedRoutes: []string{
				"/api/v1/logs/tail",
				"/api/v3/logs/livetail",
				"/api/v1/export_raw_data",
			},
		},
		Logging: Logging{
			ExcludedRoutes: []string{
				"/api/v1/health",
				"/api/v1/version",
				"/",
				"/rum/v1/traces",
				"/rum/v1/logs",
			},
		},
	}
}

func (c Config) Validate() error {
	if err := c.Config.Validate(); err != nil {
		return err
	}

	if c.Address == "" {
		return errors.NewInvalidInputf(errors.CodeInvalidInput, "apiserver.address is required")
	}

	return nil
}
