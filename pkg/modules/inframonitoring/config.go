package inframonitoring

import (
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

type Config struct {
	TelemetryStore TelemetryStoreConfig `mapstructure:"telemetrystore"`
}

type TelemetryStoreConfig struct {
	Threads int `mapstructure:"threads"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("inframonitoring"), newConfig)
}

func newConfig() factory.Config {
	return Config{
		TelemetryStore: TelemetryStoreConfig{
			Threads: 8,
		},
	}
}

func (c Config) Validate() error {
	if c.TelemetryStore.Threads <= 0 {
		return errors.NewInvalidInputf(errors.CodeInvalidInput, "inframonitoring.telemetrystore.threads must be positive, got %d", c.TelemetryStore.Threads)
	}
	return nil
}
