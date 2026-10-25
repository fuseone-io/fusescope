package archive

import (
	"context"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/config"
	"github.com/fuseone-io/fusescope/pkg/config/envprovider"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewWithEnvProvider(t *testing.T) {
	t.Setenv("SIGNOZ_ARCHIVE_LOGS_ENABLED", "true")
	t.Setenv("SIGNOZ_ARCHIVE_LOGS_NAMED__COLLECTION", "archive_s3")
	t.Setenv("SIGNOZ_ARCHIVE_LOGS_PREFIX", "fusescope/prod")
	t.Setenv("SIGNOZ_ARCHIVE_LOGS_BACKSTOP__DAYS", "10")
	t.Setenv("SIGNOZ_ARCHIVE_LIMITS_CONCURRENCY", "2")
	t.Setenv("SIGNOZ_ARCHIVE_LIMITS_QUERY__TIMEOUT", "30m")

	conf, err := config.New(
		context.Background(),
		config.ResolverConfig{
			Uris:              []string{"env:"},
			ProviderFactories: []config.ProviderFactory{envprovider.NewFactory()},
		},
		[]factory.ConfigFactory{NewConfigFactory()},
	)
	require.NoError(t, err)

	actual := Config{}
	require.NoError(t, conf.Unmarshal("archive", &actual))

	assert.True(t, actual.Logs.Enabled)
	assert.Equal(t, "archive_s3", actual.Logs.NamedCollection)
	assert.Equal(t, "fusescope/prod", actual.Logs.Prefix)
	assert.Equal(t, 10, actual.Logs.BackstopDays)
	assert.Equal(t, 2, actual.Limits.Concurrency)
	assert.Equal(t, 30*time.Minute, actual.Limits.QueryTimeout)
	assert.Equal(t, uint64(1_000_000), actual.Logs.LateMinRows)
	assert.True(t, actual.Logs.Compaction.Enabled)
	assert.NoError(t, actual.Validate())
}

func TestNewConfigIsDisabled(t *testing.T) {
	config := newConfig().(*Config)

	assert.False(t, config.Logs.Enabled)
	assert.False(t, config.Traces.Enabled)
	assert.False(t, config.Metrics.Enabled)
	assert.Equal(t, 7, config.Logs.BackstopDays)
	assert.Equal(t, 24*time.Hour, config.Logs.LateMaxHold)
	assert.Equal(t, 16, config.Logs.Compaction.MinObjects)
	assert.Equal(t, int64(64<<20), config.Logs.Compaction.MinBytes)
	assert.Equal(t, 30, config.GCSupersededDays)
	assert.NoError(t, config.Validate())
}

func TestConfigValidate(t *testing.T) {
	valid := func() Config {
		config := *newConfig().(*Config)
		config.Logs.Enabled = true
		config.Logs.NamedCollection = "archive_s3"
		config.Logs.Prefix = "fusescope"
		return config
	}

	testCases := []struct {
		name    string
		mutate  func(*Config)
		wantErr bool
	}{
		{name: "LogsEnabled_Valid", mutate: func(*Config) {}},
		{name: "LogsEnabled_NoNamedCollection", mutate: func(c *Config) { c.Logs.NamedCollection = "" }, wantErr: true},
		{name: "LogsEnabled_NoPrefix", mutate: func(c *Config) { c.Logs.Prefix = "" }, wantErr: true},
		{name: "Backstop_TwoDays_Valid", mutate: func(c *Config) { c.Logs.BackstopDays = 2; c.Logs.LateMaxHold = 12 * time.Hour }},
		{name: "Backstop_ThirtyDays_Valid", mutate: func(c *Config) { c.Logs.BackstopDays = 30 }},
		{name: "NamedCollection_NotAnIdentifier", mutate: func(c *Config) { c.Logs.NamedCollection = "s3; DROP" }, wantErr: true},
		{name: "NamedCollection_Underscored_Valid", mutate: func(c *Config) { c.Logs.NamedCollection = "_archive_s3_2" }},
		{name: "Prefix_LeadingSlash", mutate: func(c *Config) { c.Logs.Prefix = "/fusescope" }, wantErr: true},
		{name: "Prefix_ParentSegment", mutate: func(c *Config) { c.Logs.Prefix = "fusescope/../other" }, wantErr: true},
		{name: "Prefix_Nested_Valid", mutate: func(c *Config) { c.Logs.Prefix = "fusescope/prod..v2/logs" }},
		{name: "Prefix_Partitioned_Valid", mutate: func(c *Config) { c.Logs.Prefix = "fuse_scope/env=prod/v-2" }},
		{name: "Prefix_GlobStar", mutate: func(c *Config) { c.Logs.Prefix = "fusescope/*" }, wantErr: true},
		{name: "Prefix_GlobQuestionMark", mutate: func(c *Config) { c.Logs.Prefix = "fusescope?" }, wantErr: true},
		{name: "Prefix_GlobBraces", mutate: func(c *Config) { c.Logs.Prefix = "{prod,dev}" }, wantErr: true},
		{name: "Prefix_EmptySegment", mutate: func(c *Config) { c.Logs.Prefix = "fusescope//prod" }, wantErr: true},
		{name: "Prefix_TrailingSlash", mutate: func(c *Config) { c.Logs.Prefix = "fusescope/" }, wantErr: true},
		{name: "Prefix_Space", mutate: func(c *Config) { c.Logs.Prefix = "fuse scope" }, wantErr: true},
		{name: "Backstop_BelowTwoDays", mutate: func(c *Config) { c.Logs.BackstopDays = 1 }, wantErr: true},
		{name: "Backstop_AboveThirtyDays", mutate: func(c *Config) { c.Logs.BackstopDays = 31 }, wantErr: true},
		{name: "Backstop_BelowTwiceInterval", mutate: func(c *Config) { c.Interval = 36 * time.Hour; c.Logs.BackstopDays = 2 }, wantErr: true},
		{name: "LateMaxHold_NotBelowHalfBackstop", mutate: func(c *Config) { c.Logs.BackstopDays = 2; c.Logs.LateMaxHold = 24 * time.Hour }, wantErr: true},
		{name: "LateMaxHold_Zero", mutate: func(c *Config) { c.Logs.LateMaxHold = 0 }, wantErr: true},
		{name: "Interval_Zero", mutate: func(c *Config) { c.Interval = 0 }, wantErr: true},
		{name: "Limits_ZeroConcurrency", mutate: func(c *Config) { c.Limits.Concurrency = 0 }, wantErr: true},
		{name: "Limits_ZeroThreads", mutate: func(c *Config) { c.Limits.MaxThreads = 0 }, wantErr: true},
		{name: "Limits_ZeroRowGroup", mutate: func(c *Config) { c.Limits.RowGroupRows = 0 }, wantErr: true},
		{name: "Limits_ZeroQueryTimeout", mutate: func(c *Config) { c.Limits.QueryTimeout = 0 }, wantErr: true},
		{name: "Limits_QueryTimeoutNotBelowBackstop", mutate: func(c *Config) { c.Limits.QueryTimeout = 7 * 24 * time.Hour }, wantErr: true},
		{name: "Limits_NegativeMemory", mutate: func(c *Config) { c.Limits.MaxMemoryUsage = -1 }, wantErr: true},
		{name: "Compaction_OneObject", mutate: func(c *Config) { c.Logs.Compaction.MinObjects = 1 }, wantErr: true},
		{name: "GCSuperseded_Negative", mutate: func(c *Config) { c.GCSupersededDays = -1 }, wantErr: true},
		{name: "TracesEnabled_NotYetSupported", mutate: func(c *Config) { c.Traces = c.Logs }, wantErr: true},
		{name: "MetricsEnabled_NotYetSupported", mutate: func(c *Config) { c.Metrics = c.Logs }, wantErr: true},
		{name: "LogsDisabled_InvalidFieldsIgnored", mutate: func(c *Config) { c.Logs.Enabled = false; c.Logs.Prefix = ""; c.Logs.BackstopDays = 0 }},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			config := valid()
			testCase.mutate(&config)
			if testCase.wantErr {
				assert.Error(t, config.Validate())
				return
			}
			assert.NoError(t, config.Validate())
		})
	}
}
