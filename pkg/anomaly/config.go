package anomaly

import (
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

var ErrCodeInvalidConfig = errors.MustNewCode("anomaly_invalid_config")

// Config bounds anomaly evaluations. The limits are checked once the querier has returned a
// window, so they bound the response, not the memory a ClickHouse query uses on its way.
type Config struct {
	// MaxConcurrent is how many anomaly evaluations run at once in this process. A preview past it
	// is refused; a rule waits for a slot. A session holds one slot while open.
	MaxConcurrent int `mapstructure:"max_concurrent"`
	// MaxSeries bounds the series of each window: the current one and each baseline. In a session
	// it bounds the label sets of each query result.
	MaxSeries int `mapstructure:"max_series"`
	// MaxPoints bounds the points of all five windows together, or of every response of a session.
	MaxPoints int `mapstructure:"max_points"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("anomaly"), newConfig)
}

func newConfig() factory.Config {
	return &Config{MaxConcurrent: 4, MaxSeries: 1000, MaxPoints: 2_000_000}
}

func (c Config) Validate() error {
	if c.MaxConcurrent < 1 || c.MaxSeries < 1 || c.MaxPoints < 1 {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "anomaly.max_concurrent, max_series and max_points must be positive")
	}
	return nil
}
