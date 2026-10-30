package archive

import (
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

var (
	ErrCodeInvalidConfig = errors.MustNewCode("archive_invalid_config")

	namedCollectionRegexp = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	// s3() reads *, ? and {…} in a path as globs.
	prefixRegexp = regexp.MustCompile(`^[A-Za-z0-9._=-]+(/[A-Za-z0-9._=-]+)*$`)
)

const (
	minBackstopDays = 2
	maxBackstopDays = 30
)

type Config struct {
	// How often the export cycle runs.
	Interval time.Duration `mapstructure:"interval"`

	// Applied to every export and restore query.
	Limits LimitsConfig `mapstructure:"limits"`

	// Superseded objects are deleted after this many days, except on Object Lock buckets.
	// 0 keeps them.
	GCSupersededDays int `mapstructure:"gc_superseded_days"`

	Logs    SignalConfig `mapstructure:"logs"`
	Traces  SignalConfig `mapstructure:"traces"`
	Metrics SignalConfig `mapstructure:"metrics"`
}

type LimitsConfig struct {
	// Archive queries running at once, across the cycle.
	Concurrency int `mapstructure:"concurrency"`

	// Per query, in bytes. 0 leaves the server default.
	MaxMemoryUsage int64 `mapstructure:"max_memory_usage"`

	// Per query; also max_insert_threads on restore.
	MaxThreads int `mapstructure:"max_threads"`

	RowGroupRows int `mapstructure:"row_group_rows"`

	// Per query, as max_execution_time and a client deadline. Below the export cycle's
	// deadline, a quarter of backstop_days.
	QueryTimeout time.Duration `mapstructure:"query_timeout"`

	// Added to query_timeout for each started GiB of a part's bytes_on_disk when it is
	// exported, up to the export cycle's deadline.
	QueryTimeoutPerGiB time.Duration `mapstructure:"query_timeout_per_gib"`
}

type SignalConfig struct {
	Enabled bool `mapstructure:"enabled"`

	// ClickHouse named collection holding the bucket endpoint and credentials.
	NamedCollection string `mapstructure:"named_collection"`

	Prefix string `mapstructure:"prefix"`

	// Days past retention that unarchived data is kept, counted from ingestion.
	BackstopDays int `mapstructure:"backstop_days"`

	// Parts landing in an archived partition are exported once they total LateMinRows, or
	// LateMaxHold after first seen.
	LateMinRows uint64        `mapstructure:"late_min_rows"`
	LateMaxHold time.Duration `mapstructure:"late_max_hold"`

	Compaction CompactionConfig `mapstructure:"compaction"`
}

type CompactionConfig struct {
	Enabled bool `mapstructure:"enabled"`

	// A partition is compacted when it has more objects than MinObjects, or a mean object
	// size below MinBytes.
	MinObjects int   `mapstructure:"min_objects"`
	MinBytes   int64 `mapstructure:"min_bytes"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("archive"), newConfig)
}

func newConfig() factory.Config {
	return &Config{
		Interval:         time.Hour,
		Limits:           LimitsConfig{Concurrency: 1, MaxMemoryUsage: 2 << 30, MaxThreads: 4, RowGroupRows: 100_000, QueryTimeout: time.Hour, QueryTimeoutPerGiB: 2 * time.Minute},
		GCSupersededDays: 30,
		Logs:             newSignalConfig(),
		Traces:           newSignalConfig(),
		Metrics:          newSignalConfig(),
	}
}

func (c Config) Validate() error {
	if c.Interval <= 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "archive.interval must be positive")
	}
	if c.Limits.Concurrency < 1 || c.Limits.MaxThreads < 1 || c.Limits.RowGroupRows < 1 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "archive.limits.concurrency, archive.limits.max_threads and archive.limits.row_group_rows must be positive")
	}
	if c.Limits.MaxMemoryUsage < 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "archive.limits.max_memory_usage must not be negative")
	}
	if c.Limits.QueryTimeout <= 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "archive.limits.query_timeout must be positive")
	}
	if c.Limits.QueryTimeoutPerGiB < 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "archive.limits.query_timeout_per_gib must not be negative")
	}
	if c.GCSupersededDays < 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "archive.gc_superseded_days must not be negative")
	}
	if c.Traces.Enabled || c.Metrics.Enabled {
		return errors.New(errors.TypeUnsupported, ErrCodeInvalidConfig, "only archive.logs can be enabled for now")
	}

	if err := c.Logs.validate("archive.logs", c.Interval); err != nil {
		return err
	}
	if c.Logs.Enabled && c.Limits.QueryTimeout >= c.Logs.CycleTimeout() {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "archive.limits.query_timeout must be below a quarter of archive.logs.backstop_days")
	}

	return nil
}

// CycleTimeout bounds an export cycle well within the backstop, so a stuck one can't keep
// the lease while the backstop runs out.
func (c SignalConfig) CycleTimeout() time.Duration {
	return time.Duration(c.BackstopDays) * 24 * time.Hour / 4
}

func newSignalConfig() SignalConfig {
	return SignalConfig{
		BackstopDays: 7,
		LateMinRows:  1_000_000,
		LateMaxHold:  24 * time.Hour,
		Compaction:   CompactionConfig{Enabled: true, MinObjects: 16, MinBytes: 64 << 20},
	}
}

func (c SignalConfig) validate(key string, interval time.Duration) error {
	if !c.Enabled {
		return nil
	}
	if c.NamedCollection == "" || c.Prefix == "" {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "%s.named_collection and %s.prefix are required", key, key)
	}
	if !namedCollectionRegexp.MatchString(c.NamedCollection) {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "%s.named_collection must be a ClickHouse identifier", key)
	}
	if !prefixRegexp.MatchString(c.Prefix) || slices.Contains(strings.Split(c.Prefix, "/"), "..") {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "%s.prefix must be /-separated segments of A-Z, a-z, 0-9, '.', '_', '=' and '-', with no .. segment", key)
	}

	backstop := time.Duration(c.BackstopDays) * 24 * time.Hour
	if c.BackstopDays < minBackstopDays || c.BackstopDays > maxBackstopDays || backstop < 2*interval {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "%s.backstop_days must be %d–%d and at least twice archive.interval", key, minBackstopDays, maxBackstopDays)
	}
	if c.LateMaxHold <= 0 || c.LateMaxHold >= backstop/2 {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "%s.late_max_hold must be positive and below half of %s.backstop_days", key, key)
	}
	if c.Compaction.MinObjects < 2 || c.Compaction.MinBytes < 0 {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "%s.compaction.min_objects must be at least 2 and min_bytes not negative", key)
	}

	return nil
}
