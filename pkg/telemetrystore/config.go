package telemetrystore

import (
	"slices"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// MaxFlightTokenTTL is the longest a token may live, the engine's auth.jwt_max_ttl_secs default.
const MaxFlightTokenTTL = 300 * time.Second

var ErrCodeInvalidConfig = errors.MustNewCode("telemetrystore_invalid_config")

type Config struct {
	// Provider is the provider to use
	Provider string `mapstructure:"provider"`

	// Connection is the connection configuration
	Connection ConnectionConfig `mapstructure:",squash"`

	// Clickhouse is the clickhouse configuration. Under the flight provider it serves the callers
	// of ClickhouseDB not yet moved to Query and Do, and is required while any remain.
	Clickhouse ClickhouseConfig `mapstructure:"clickhouse"`

	// Flight is the fusescope-engine configuration, read when Provider is flight.
	Flight FlightConfig `mapstructure:"flight"`
}

type FlightConfig struct {
	// Endpoint is the host:port of the engine's Flight SQL listener; the host is the name its
	// certificate carries unless TLS.ServerName overrides it.
	Endpoint string `mapstructure:"endpoint"`

	TLS FlightTLSConfig `mapstructure:"tls"`

	JWT FlightJWTConfig `mapstructure:"jwt"`

	// MaxMessageBytes bounds one message received from the engine, checked before it is decoded.
	MaxMessageBytes int `mapstructure:"max_message_bytes"`

	// Routes are the reads the engine serves: traces_raw, traces_aggregate, trace_detail. None is
	// served unless listed; everything else stays on ClickHouse.
	Routes []string `mapstructure:"routes"`

	// Orgs are the organisations whose routed reads the engine serves; the others stay on
	// ClickHouse. A listed org must have its tenant in the engine.
	Orgs []string `mapstructure:"orgs"`
}

var engineRoutes = map[string]bool{
	string(RouteTracesRaw):       true,
	string(RouteTracesAggregate): true,
	string(RouteTraceDetail):     true,
}

// EngineServes reports whether route reads for org go to the engine.
func (c Config) EngineServes(route Route, org valuer.UUID) bool {
	return c.Provider == "flight" && slices.Contains(c.Flight.Routes, string(route)) && slices.Contains(c.Flight.Orgs, org.StringValue())
}

type FlightTLSConfig struct {
	// CertFile and KeyFile are the backend's client identity, issued by a CA of the engine's
	// tls.public_client_ca; both are read again when they change.
	CertFile string `mapstructure:"cert_file"`
	KeyFile  string `mapstructure:"key_file"`

	// CAFile is the only trust for the engine's certificate, read at start.
	CAFile string `mapstructure:"ca_file"`

	ServerName string `mapstructure:"server_name"`
}

type FlightJWTConfig struct {
	// KeyFile holds the Ed25519 private key, PKCS#8 PEM. Its public half goes in the engine's
	// auth.jwt_keys under the key's RFC 7638 thumbprint, which tokens carry as kid and the
	// provider logs at start and on every rotation, so old and new keys can sit side by side.
	KeyFile string `mapstructure:"key_file"`

	Issuer   string        `mapstructure:"issuer"`
	Audience string        `mapstructure:"audience"`
	TTL      time.Duration `mapstructure:"ttl"`
}

type ConnectionConfig struct {
	// MaxOpenConns is the maximum number of open connections to the database.
	MaxOpenConns int `mapstructure:"max_open_conns"`

	// MaxIdleConns is the maximum number of connections in the idle connection pool.
	MaxIdleConns int `mapstructure:"max_idle_conns"`

	// DialTimeout is the timeout for dialing a new connection.
	DialTimeout time.Duration `mapstructure:"dial_timeout"`
}

type ClickhouseConfig struct {
	// DSN is the database source name.
	DSN string `mapstructure:"dsn"`

	// Cluster is the cluster name to use for clickhouse.
	Cluster string `mapstructure:"cluster"`

	// QuerySettings is the query settings for clickhouse.
	QuerySettings QuerySettings `mapstructure:"settings"`
}

type QuerySettings struct {
	MaxExecutionTime                    int    `mapstructure:"max_execution_time"`
	MaxExecutionTimeLeaf                int    `mapstructure:"max_execution_time_leaf"`
	TimeoutBeforeCheckingExecutionSpeed int    `mapstructure:"timeout_before_checking_execution_speed"`
	MaxBytesToRead                      int    `mapstructure:"max_bytes_to_read"`
	MaxResultRows                       int    `mapstructure:"max_result_rows"`
	IgnoreDataSkippingIndices           string `mapstructure:"ignore_data_skipping_indices"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("telemetrystore"), newConfig)
}

func newConfig() factory.Config {
	return Config{
		Provider: "clickhouse",
		Connection: ConnectionConfig{
			MaxOpenConns: 100,
			MaxIdleConns: 50,
			DialTimeout:  5 * time.Second,
		},
		Clickhouse: ClickhouseConfig{
			DSN:     "tcp://localhost:9000",
			Cluster: "cluster",
		},
		Flight: FlightConfig{
			JWT: FlightJWTConfig{
				Issuer:   "fusescope-backend",
				Audience: "fusescope-engine",
				TTL:      60 * time.Second,
			},
			MaxMessageBytes: 64 << 20,
		},
	}

}

func (c Config) Validate() error {
	switch c.Provider {
	case "clickhouse":
		return nil
	case "flight":
		return c.validateFlight()
	default:
		return errors.NewInvalidInputf(ErrCodeInvalidConfig, "telemetrystore.provider %q: expected clickhouse or flight", c.Provider)
	}
}

func (c Config) validateFlight() error {
	invalid := func(format string, args ...any) error {
		return errors.NewInvalidInputf(ErrCodeInvalidConfig, format, args...)
	}
	flight := c.Flight
	switch {
	case flight.Endpoint == "":
		return invalid("telemetrystore.flight.endpoint is required by the flight provider")
	case flight.TLS.CertFile == "" || flight.TLS.KeyFile == "":
		return invalid("telemetrystore.flight.tls.cert_file and key_file are required: the engine admits only certified clients")
	case flight.TLS.CAFile == "":
		return invalid("telemetrystore.flight.tls.ca_file is required: the engine is trusted through its own CA, not a public one")
	case flight.JWT.KeyFile == "":
		return invalid("telemetrystore.flight.jwt.key_file is required to sign tenant tokens")
	case flight.JWT.Issuer == "" || flight.JWT.Audience == "":
		return invalid("telemetrystore.flight.jwt.issuer and audience must not be empty")
	case flight.JWT.TTL <= 0 || flight.JWT.TTL > MaxFlightTokenTTL:
		return invalid("telemetrystore.flight.jwt.ttl must be above 0 and at most %s", MaxFlightTokenTTL)
	case flight.MaxMessageBytes <= 0:
		return invalid("telemetrystore.flight.max_message_bytes must be positive")
	}
	for _, route := range flight.Routes {
		if !engineRoutes[route] {
			return invalid("telemetrystore.flight.routes: %q is not traces_raw, traces_aggregate or trace_detail", route)
		}
	}
	for _, org := range flight.Orgs {
		if _, err := valuer.NewUUID(org); err != nil {
			return invalid("telemetrystore.flight.orgs: %q is not an organisation id", org)
		}
	}
	if c.Clickhouse.DSN == "" {
		return invalid("telemetrystore.clickhouse.dsn is required by the flight provider while callers of ClickhouseDB remain")
	}
	return nil
}
