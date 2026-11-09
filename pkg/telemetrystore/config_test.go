package telemetrystore

import (
	"context"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"

	"github.com/fuseone-io/fusescope/pkg/config"
	"github.com/fuseone-io/fusescope/pkg/config/envprovider"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewWithEnvProvider(t *testing.T) {
	t.Setenv("SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN", "tcp://localhost:9000")
	t.Setenv("SIGNOZ_TELEMETRYSTORE_MAX__IDLE__CONNS", "60")
	t.Setenv("SIGNOZ_TELEMETRYSTORE_MAX__OPEN__CONNS", "150")
	t.Setenv("SIGNOZ_TELEMETRYSTORE_DIAL__TIMEOUT", "5s")
	t.Setenv("SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DEBUG", "true")

	conf, err := config.New(
		context.Background(),
		config.ResolverConfig{
			Uris: []string{"env:"},
			ProviderFactories: []config.ProviderFactory{
				envprovider.NewFactory(),
			},
		},
		[]factory.ConfigFactory{
			NewConfigFactory(),
		},
	)
	require.NoError(t, err)

	actual := Config{}
	err = conf.Unmarshal("telemetrystore", &actual)
	require.NoError(t, err)

	assert.NoError(t, actual.Validate())

	expected := NewConfigFactory().New().(Config)
	expected.Provider = "clickhouse"
	expected.Connection.MaxOpenConns = 150
	expected.Connection.MaxIdleConns = 60
	expected.Connection.DialTimeout = 5 * time.Second
	expected.Clickhouse.DSN = "tcp://localhost:9000"

	assert.Equal(t, expected, actual)
}

func TestNewWithEnvProviderWithQuerySettings(t *testing.T) {
	t.Setenv("SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_SETTINGS_MAX__EXECUTION__TIME", "10")
	t.Setenv("SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_SETTINGS_MAX__EXECUTION__TIME__LEAF", "10")
	t.Setenv("SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_SETTINGS_TIMEOUT__BEFORE__CHECKING__EXECUTION__SPEED", "10")
	t.Setenv("SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_SETTINGS_MAX__BYTES__TO__READ", "1000000")
	t.Setenv("SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_SETTINGS_MAX__RESULT__ROWS", "10000")

	conf, err := config.New(
		context.Background(),
		config.ResolverConfig{
			Uris: []string{"env:"},
			ProviderFactories: []config.ProviderFactory{
				envprovider.NewFactory(),
			},
		},
		[]factory.ConfigFactory{
			NewConfigFactory(),
		},
	)
	require.NoError(t, err)

	actual := Config{}
	err = conf.Unmarshal("telemetrystore", &actual)

	require.NoError(t, err)

	expected := Config{
		Clickhouse: ClickhouseConfig{
			QuerySettings: QuerySettings{
				MaxExecutionTime:                    10,
				MaxExecutionTimeLeaf:                10,
				TimeoutBeforeCheckingExecutionSpeed: 10,
				MaxBytesToRead:                      1000000,
				MaxResultRows:                       10000,
			},
		},
	}

	assert.Equal(t, expected.Clickhouse.QuerySettings, actual.Clickhouse.QuerySettings)
}

func TestValidateFlight(t *testing.T) {
	flight := func(edit func(*Config)) Config {
		conf := NewConfigFactory().New().(Config)
		conf.Provider = "flight"
		conf.Flight.Endpoint = "engine-querier:8815"
		conf.Flight.TLS.CertFile = "/etc/fusescope/engine/tls.crt"
		conf.Flight.TLS.KeyFile = "/etc/fusescope/engine/tls.key"
		conf.Flight.TLS.CAFile = "/etc/fusescope/engine/ca.crt"
		conf.Flight.JWT.KeyFile = "/etc/fusescope/engine/jwt.key"
		edit(&conf)
		return conf
	}

	testCases := []struct {
		name   string
		config Config
		want   string
	}{
		{name: "Complete_Valid", config: flight(func(*Config) {})},
		{name: "ClickhouseProvider_FlightBlockIgnored", config: func() Config {
			c := flight(func(*Config) {})
			c.Provider = "clickhouse"
			c.Flight = FlightConfig{}
			return c
		}()},
		{name: "NoEndpoint_Refused", config: flight(func(c *Config) { c.Flight.Endpoint = "" }), want: "telemetrystore.flight.endpoint"},
		{name: "NoClientCertificate_Refused", config: flight(func(c *Config) { c.Flight.TLS.CertFile = "" }), want: "telemetrystore.flight.tls"},
		{name: "NoClientKey_Refused", config: flight(func(c *Config) { c.Flight.TLS.KeyFile = "" }), want: "telemetrystore.flight.tls"},
		{name: "NoSigningKey_Refused", config: flight(func(c *Config) { c.Flight.JWT.KeyFile = "" }), want: "telemetrystore.flight.jwt"},
		{name: "NoEngineCA_Refused", config: flight(func(c *Config) { c.Flight.TLS.CAFile = "" }), want: "telemetrystore.flight.tls.ca_file"},
		{name: "TTLAboveEngineMaximum_Refused", config: flight(func(c *Config) { c.Flight.JWT.TTL = 301 * time.Second }), want: "telemetrystore.flight.jwt.ttl"},
		{name: "ZeroTTL_Refused", config: flight(func(c *Config) { c.Flight.JWT.TTL = 0 }), want: "telemetrystore.flight.jwt.ttl"},
		{name: "ZeroMessageBytes_Refused", config: flight(func(c *Config) { c.Flight.MaxMessageBytes = 0 }), want: "telemetrystore.flight.max_message_bytes"},
		{name: "NoClickhouseFallback_Refused", config: flight(func(c *Config) { c.Clickhouse.DSN = "" }), want: "telemetrystore.clickhouse.dsn"},
		{name: "UnknownProvider_Refused", config: flight(func(c *Config) { c.Provider = "duckdb" }), want: "telemetrystore.provider"},
		{name: "KnownRoutesAndOrgs_Valid", config: flight(func(c *Config) {
			c.Flight.Routes = []string{"traces_raw", "traces_aggregate", "trace_detail"}
			c.Flight.Orgs = []string{"0190f3a1-0000-7000-8000-000000000001"}
		})},
		{name: "UnknownRoute_Refused", config: flight(func(c *Config) { c.Flight.Routes = []string{"logs"} }), want: "telemetrystore.flight.routes"},
		{name: "OrgNotAnID_Refused", config: flight(func(c *Config) { c.Flight.Orgs = []string{"acme"} }), want: "telemetrystore.flight.orgs"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := testCase.config.Validate()
			if testCase.want == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), testCase.want)
		})
	}
}

func TestFlightDefaults(t *testing.T) {
	conf := NewConfigFactory().New().(Config)
	assert.Equal(t, "fusescope-engine", conf.Flight.JWT.Audience)
	assert.Equal(t, "fusescope-backend", conf.Flight.JWT.Issuer)
	assert.Equal(t, 60*time.Second, conf.Flight.JWT.TTL)
	assert.Equal(t, 64<<20, conf.Flight.MaxMessageBytes)
}

func TestTheEngineServesOnlyListedRoutesOfListedOrgs(t *testing.T) {
	listed := valuer.MustNewUUID("0190f3a1-0000-7000-8000-000000000001")
	other := valuer.MustNewUUID("0190f3a1-0000-7000-8000-000000000002")
	conf := NewConfigFactory().New().(Config)
	conf.Provider = "flight"
	conf.Flight.Routes = []string{"traces_raw"}
	conf.Flight.Orgs = []string{listed.StringValue()}

	assert.True(t, conf.EngineServes(RouteTracesRaw, listed))
	assert.False(t, conf.EngineServes(RouteTracesAggregate, listed), "a route not listed")
	assert.False(t, conf.EngineServes(RouteTracesRaw, other), "an org not listed")
	conf.Provider = "clickhouse"
	assert.False(t, conf.EngineServes(RouteTracesRaw, listed), "the clickhouse provider serves everything itself")
	conf.Provider = "flight"
	conf.Flight.Routes = nil
	assert.False(t, conf.EngineServes(RouteTracesRaw, listed), "no route, nothing routed")
}
