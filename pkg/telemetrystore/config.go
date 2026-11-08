package telemetrystore

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
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
}

type FlightTLSConfig struct {
	// CertFile and KeyFile are the backend's client identity, issued by a CA of the engine's
	// tls.public_client_ca; both are read again when they change.
	CertFile string `mapstructure:"cert_file"`
	KeyFile  string `mapstructure:"key_file"`

	// CAFile, when set, is the only trust for the engine's certificate in place of the system's.
	CAFile string `mapstructure:"ca_file"`

	ServerName string `mapstructure:"server_name"`
}

type FlightJWTConfig struct {
	// KeyFile holds the Ed25519 private key, PKCS#8 PEM, whose public half is in the engine's
	// auth.jwt_keys under KeyID.
	KeyFile string `mapstructure:"key_file"`
	KeyID   string `mapstructure:"kid"`

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
	case flight.JWT.KeyFile == "" || flight.JWT.KeyID == "":
		return invalid("telemetrystore.flight.jwt.key_file and kid are required to sign tenant tokens")
	case flight.JWT.Issuer == "" || flight.JWT.Audience == "":
		return invalid("telemetrystore.flight.jwt.issuer and audience must not be empty")
	case flight.JWT.TTL <= 0 || flight.JWT.TTL > MaxFlightTokenTTL:
		return invalid("telemetrystore.flight.jwt.ttl must be above 0 and at most %s", MaxFlightTokenTTL)
	case flight.MaxMessageBytes <= 0:
		return invalid("telemetrystore.flight.max_message_bytes must be positive")
	case c.Clickhouse.DSN == "":
		return invalid("telemetrystore.clickhouse.dsn is required by the flight provider while callers of ClickhouseDB remain")
	}
	return nil
}
