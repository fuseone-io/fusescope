package rumapplication

import (
	"net"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

var ErrCodeInvalidConfig = errors.MustNewCode("rum_invalid_config")

type Config struct {
	SourceMaps SourceMapsConfig `mapstructure:"sourcemaps"`

	IngestPolicy IngestPolicyConfig `mapstructure:"ingest_policy"`
}

// IngestPolicyConfig is the policy published to the ingress collectors
// over OpAMP (ADR 0010 §3).
type IngestPolicyConfig struct {
	// File of the tokens, one per line, that ingress collectors present as
	// `Authorization: Bearer` on the OpAMP connection with TLS. Unset, no
	// policy is published and no ingest report is read.
	TokenFile string `mapstructure:"token_file"`

	// Address of the OpAMP listener with TLS that ingress collectors connect
	// to. Tokens are read only there, never on the plaintext OpAMP port.
	Listen string `mapstructure:"listen"`

	TLS IngestTLSConfig `mapstructure:"tls"`
}

// IngestTLSConfig is the TLS 1.3 of the ingress OpAMP listener. The
// certificate is read again when its files change.
type IngestTLSConfig struct {
	CertFile string `mapstructure:"cert_file"`
	KeyFile  string `mapstructure:"key_file"`
	// CA of the client certificates required from collectors; unset, none
	// is asked for.
	ClientCAFile string `mapstructure:"client_ca_file"`
}

type SourceMapsConfig struct {
	// Directory the uploaded maps are stored in; created on the first upload.
	Dir string `mapstructure:"dir"`

	// Largest accepted map, in bytes.
	MaxFileSize int64 `mapstructure:"max_file_size"`

	MaxFilesPerRelease int `mapstructure:"max_files_per_release"`

	// Bytes of maps one application holds.
	Quota int64 `mapstructure:"quota"`

	// Memory, in bytes, of the decoded maps kept for symbolication.
	CacheSize int64 `mapstructure:"cache_size"`

	// Original source lines returned on each side of a symbolicated frame.
	ContextLines int `mapstructure:"context_lines"`

	// How often the maps past their application's retention are deleted.
	CleanupInterval time.Duration `mapstructure:"cleanup_interval"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("rum"), newConfig)
}

func newConfig() factory.Config {
	return &Config{
		IngestPolicy: IngestPolicyConfig{Listen: "0.0.0.0:4321"},
		SourceMaps: SourceMapsConfig{
			Dir:                "/var/lib/signoz/sourcemaps",
			MaxFileSize:        50 << 20,
			MaxFilesPerRelease: 1000,
			Quota:              2 << 30,
			CacheSize:          256 << 20,
			ContextLines:       5,
			CleanupInterval:    time.Hour,
		},
	}
}

func (c Config) Validate() error {
	if err := c.IngestPolicy.validate(); err != nil {
		return err
	}
	maps := c.SourceMaps
	if maps.Dir == "" || maps.MaxFileSize <= 0 || maps.MaxFilesPerRelease <= 0 || maps.Quota <= 0 || maps.CacheSize <= 0 || maps.ContextLines < 0 || maps.CleanupInterval <= 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "rum.sourcemaps.dir must be set, its sizes, max_files_per_release and cleanup_interval positive and context_lines not negative")
	}
	return nil
}

// plaintextOpAMPPort is the port of the OpAMP listener without TLS.
const plaintextOpAMPPort = "4320"

func (c IngestPolicyConfig) validate() error {
	if c.TokenFile == "" {
		return nil
	}
	if c.TLS.CertFile == "" || c.TLS.KeyFile == "" {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "rum.ingest_policy.token_file needs rum.ingest_policy.tls.cert_file and key_file: ingest tokens are read only over TLS")
	}
	_, port, err := net.SplitHostPort(c.Listen)
	if err != nil || port == "" {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "rum.ingest_policy.listen must be a host:port, got %q", c.Listen)
	}
	if port == plaintextOpAMPPort {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "rum.ingest_policy.listen must not use port 4320, the plaintext OpAMP listener")
	}
	return nil
}
