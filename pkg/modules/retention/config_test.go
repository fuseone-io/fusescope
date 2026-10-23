package retention

import (
	"context"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/config"
	"github.com/fuseone-io/fusescope/pkg/config/envprovider"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewWithEnvProvider(t *testing.T) {
	t.Setenv("SIGNOZ_RETENTION_DEFAULT_LOGS", "3")
	t.Setenv("SIGNOZ_RETENTION_DEFAULT_TRACES", "7")
	t.Setenv("SIGNOZ_RETENTION_DEFAULT_METRICS", "30")
	t.Setenv("SIGNOZ_RETENTION_RECONCILE__INTERVAL", "5s")

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
	require.NoError(t, conf.Unmarshal("retention", &actual))

	assert.Equal(t, Config{Default: DefaultConfig{Logs: 3, Traces: 7, Metrics: 30}, ReconcileInterval: 5 * time.Second}, actual)
	assert.NoError(t, actual.Validate())
}

func TestNewConfigIsUnset(t *testing.T) {
	config := newConfig().(*Config)

	assert.Equal(t, DefaultConfig{}, config.Default)
	assert.False(t, config.Default.IsSet())
	assert.NoError(t, config.Validate())
}

func TestConfigValidate(t *testing.T) {
	testCases := []struct {
		name    string
		config  Config
		wantErr bool
	}{
		{name: "Unset_Valid", config: Config{ReconcileInterval: time.Minute}},
		{name: "AllSignals_Valid", config: Config{Default: DefaultConfig{Logs: 3, Traces: 3, Metrics: 3}, ReconcileInterval: time.Minute}},
		{name: "LargestLogsDays_Valid", config: Config{Default: DefaultConfig{Logs: 65535}, ReconcileInterval: time.Minute}},
		{name: "NegativeLogs_Invalid", config: Config{Default: DefaultConfig{Logs: -1}, ReconcileInterval: time.Minute}, wantErr: true},
		{name: "NegativeTraces_Invalid", config: Config{Default: DefaultConfig{Traces: -2}, ReconcileInterval: time.Minute}, wantErr: true},
		{name: "NegativeMetrics_Invalid", config: Config{Default: DefaultConfig{Metrics: -3}, ReconcileInterval: time.Minute}, wantErr: true},
		{name: "LogsAboveUInt16_Invalid", config: Config{Default: DefaultConfig{Logs: 65536}, ReconcileInterval: time.Minute}, wantErr: true},
		{name: "ZeroInterval_Invalid", config: Config{Default: DefaultConfig{Traces: 3}}, wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := testCase.config.Validate()
			if testCase.wantErr {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestDefaultConfigDays(t *testing.T) {
	config := DefaultConfig{Logs: 3, Traces: 7, Metrics: 30}

	assert.Equal(t, 3, config.Days(retentiontypes.LogsTTL))
	assert.Equal(t, 7, config.Days(retentiontypes.TraceTTL))
	assert.Equal(t, 30, config.Days(retentiontypes.MetricsTTL))
	assert.Equal(t, 0, config.Days("profiles"))
	assert.True(t, config.IsSet())
	assert.True(t, DefaultConfig{Metrics: 1}.IsSet())
}
