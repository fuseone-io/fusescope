package retention

import (
	"math"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

var ErrCodeInvalidConfig = errors.MustNewCode("retention_invalid_config")

// maxDefaultLogsDays is the largest value the logs _retention_days UInt16 column holds.
const maxDefaultLogsDays = math.MaxUint16

type Config struct {
	// Retention, in days, set on every organization whose signal has no retention set yet.
	// 0 keeps the schema default. A retention set in the UI is never overridden.
	Default DefaultConfig `mapstructure:"default"`

	// How often organizations are checked for an unset retention. This also picks up the
	// organization created at first sign-up.
	ReconcileInterval time.Duration `mapstructure:"reconcile_interval"`
}

type DefaultConfig struct {
	Logs    int `mapstructure:"logs"`
	Traces  int `mapstructure:"traces"`
	Metrics int `mapstructure:"metrics"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("retention"), newConfig)
}

func newConfig() factory.Config {
	return &Config{ReconcileInterval: time.Minute}
}

func (c Config) Validate() error {
	if c.Default.Logs < 0 || c.Default.Traces < 0 || c.Default.Metrics < 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "retention.default.logs, retention.default.traces and retention.default.metrics must not be negative")
	}
	if c.Default.Logs > maxDefaultLogsDays {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "retention.default.logs must be at most %d days", maxDefaultLogsDays)
	}
	if c.ReconcileInterval <= 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "retention.reconcile_interval must be positive")
	}
	return nil
}

// Days returns the default retention of the TTL type, 0 when unset.
func (c DefaultConfig) Days(ttlType string) int {
	switch ttlType {
	case retentiontypes.LogsTTL:
		return c.Logs
	case retentiontypes.TraceTTL:
		return c.Traces
	case retentiontypes.MetricsTTL:
		return c.Metrics
	default:
		return 0
	}
}

func (c DefaultConfig) IsSet() bool {
	return c.Logs > 0 || c.Traces > 0 || c.Metrics > 0
}
