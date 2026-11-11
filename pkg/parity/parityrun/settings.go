package parityrun

import (
	"io"
	"time"

	"github.com/fuseone-io/fusescope/pkg/config"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

var ErrCodeSettings = errors.MustNewCode("parity_settings")

// settingsVersion is the one version of the parity's settings file this parity reads.
const settingsVersion = 1

// settingsSections are the sections of the settings file; any other is refused.
var settingsSections = map[string]bool{
	"version": true, "engine": true, "clickhouse": true, "querier": true, "traces": true, "round": true, "pushgateway": true,
	"bucket": true, "secret": true, "health": true, "investigate": true, "credentials": true,
}

// Settings are the parity's own: its two stores, decoded as the backend decodes them and over the
// backend's defaults, the modules' configurations, the round's bounds, the Pushgateway and the
// files its credentials are read from.
type Settings struct {
	Engine      telemetrystore.Config
	ClickHouse  telemetrystore.Config
	Querier     querier.Config
	TraceDetail tracedetail.Config
	Round       Config
	Pushgateway PushgatewaySettings
	Bucket      BucketSettings
	Secret      SecretSettings
	Health      HealthSettings
	Investigate InvestigateSettings
	Credentials CredentialsSettings
}

// BucketSettings name the staging bucket and the requeue's KMS key and bounds.
type BucketSettings struct {
	Name          string `mapstructure:"name"`
	KMSKeyID      string `mapstructure:"kms_key_id"`
	MaxQueueBytes int64  `mapstructure:"max_queue_bytes"`
	MaxQueueSpecs int    `mapstructure:"max_queue_specs"`
}

// SecretSettings name where run keys are written; the token and CA default to the pod's own.
type SecretSettings struct {
	Namespace string        `mapstructure:"namespace"`
	TokenFile string        `mapstructure:"token_file"`
	CAFile    string        `mapstructure:"ca_file"`
	Expiry    time.Duration `mapstructure:"expiry"`
}

// HealthSettings name the staging Prometheus the dual-write health is read from.
type HealthSettings struct {
	URL           string   `mapstructure:"url"`
	TokenFile     string   `mapstructure:"token_file"`
	InstanceLabel string   `mapstructure:"instance_label"`
	Exporters     []string `mapstructure:"exporters"`
}

// InvestigateSettings are the company IdP operators prove who they are with, and the audit
// pipeline every investigation reports to.
type InvestigateSettings struct {
	Issuer         string        `mapstructure:"issuer"`
	Audience       string        `mapstructure:"audience"`
	GroupsClaim    string        `mapstructure:"groups_claim"`
	Group          string        `mapstructure:"group"`
	MaxAge         time.Duration `mapstructure:"max_age"`
	ClockSkew      time.Duration `mapstructure:"clock_skew"`
	AuditEndpoint  string        `mapstructure:"audit_endpoint"`
	AuditTokenFile string        `mapstructure:"audit_token_file"`
}

// PushgatewaySettings name where a round's metrics are pushed and the token file to push with.
type PushgatewaySettings struct {
	URL       string `mapstructure:"url"`
	TokenFile string `mapstructure:"token_file"`
}

type roundSettings struct {
	Deadline        time.Duration `mapstructure:"deadline"`
	RetryWait       time.Duration `mapstructure:"retry_wait"`
	Budget          time.Duration `mapstructure:"budget"`
	Concurrency     int           `mapstructure:"concurrency"`
	MaxPairs        int           `mapstructure:"max_pairs"`
	MaxRows         int64         `mapstructure:"max_rows"`
	WindowedAbove   int64         `mapstructure:"windowed_above"`
	OperationsLimit int           `mapstructure:"operations_limit"`
	ListLimit       int           `mapstructure:"list_limit"`
}

// ParseSettings reads and checks the whole settings file.
//
// # Errors
//
// A file of another version or with an unknown section, an engine that is not the flight provider,
// a ClickHouse DSN without exactly one source, bounds that are not positive, or a Pushgateway not over https.
func ParseSettings(r io.Reader) (Settings, error) {
	invalid := func(format string, args ...any) (Settings, error) {
		return Settings{}, errors.Newf(errors.TypeInvalidInput, ErrCodeSettings, format, args...)
	}
	raw, err := decodeSettingsDocument(r)
	if err != nil {
		return Settings{}, err
	}
	for section := range raw {
		if !settingsSections[section] {
			return invalid("the settings file has an unknown section %q", section)
		}
	}
	conf, err := config.NewConfFromMap(raw)
	if err != nil {
		return invalid("the settings file does not load: %v", err)
	}
	s := Settings{
		Engine:      telemetrystore.NewConfigFactory().New().(telemetrystore.Config),
		ClickHouse:  telemetrystore.NewConfigFactory().New().(telemetrystore.Config),
		Querier:     querier.NewConfigFactory().New().(querier.Config),
		TraceDetail: tracedetail.NewConfigFactory().New().(tracedetail.Config),
		Round:       DefaultConfig(),
		Bucket:      BucketSettings{MaxQueueBytes: 8 << 20, MaxQueueSpecs: 10_000},
		Secret:      defaultSecretSettings(),
		Health:      HealthSettings{InstanceLabel: "pod"},
		Investigate: InvestigateSettings{GroupsClaim: "groups", MaxAge: 10 * time.Minute, ClockSkew: 30 * time.Second},
	}
	round := roundSettingsOf(s.Round)
	for path, target := range map[string]any{"engine": &s.Engine, "clickhouse": &s.ClickHouse, "querier": &s.Querier, "traces": &s.TraceDetail, "round": &round, "pushgateway": &s.Pushgateway,
		"bucket": &s.Bucket, "secret": &s.Secret, "health": &s.Health, "investigate": &s.Investigate, "credentials": &s.Credentials} {
		if err := conf.Unmarshal(path, target); err != nil {
			return invalid("the %s settings do not decode: %v", path, err)
		}
	}
	s.Round = round.apply(s.Round)
	if s, err = s.dsnSource(inlineDSN(raw)); err != nil {
		return Settings{}, err
	}
	if err := s.validate(); err != nil {
		return Settings{}, err
	}
	return s, nil
}

func defaultSecretSettings() SecretSettings {
	return SecretSettings{
		TokenFile: "/var/run/secrets/kubernetes.io/serviceaccount/token",
		CAFile:    "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt",
		Expiry:    90 * 24 * time.Hour,
	}
}

func roundSettingsOf(c Config) roundSettings {
	return roundSettings{
		Deadline: c.Deadline, RetryWait: c.RetryWait, Budget: c.Budget, Concurrency: c.Concurrency, MaxPairs: c.MaxPairs,
		MaxRows: c.Limits.MaxRows, WindowedAbove: c.Limits.WindowedAbove, OperationsLimit: c.OperationsLimit, ListLimit: c.ListLimit,
	}
}

func (r roundSettings) apply(c Config) Config {
	c.Deadline, c.RetryWait, c.Budget, c.Concurrency, c.MaxPairs = r.Deadline, r.RetryWait, r.Budget, r.Concurrency, r.MaxPairs
	c.Limits = parity.TraceLimits{MaxRows: r.MaxRows, WindowedAbove: r.WindowedAbove}
	c.OperationsLimit, c.ListLimit = r.OperationsLimit, r.ListLimit
	return c
}

func (s Settings) validate() error {
	invalid := func(format string, args ...any) error {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeSettings, format, args...)
	}
	if s.Engine.Provider != "flight" {
		return invalid("the engine graph runs over the flight provider, not %q", s.Engine.Provider)
	}
	if err := s.Engine.ValidateFlight(); err != nil {
		return err
	}
	if s.ClickHouse.Provider != "clickhouse" {
		return invalid("the ClickHouse graph needs the clickhouse provider")
	}

	r := s.Round
	if r.Deadline <= 0 || r.Budget <= 0 || r.PushTimeout <= 0 || r.RetryWait < 0 || r.Concurrency <= 0 || r.MaxPairs <= 0 || r.ListLimit <= 0 || r.OperationsLimit < 1 || r.OperationsLimit > 5000 {
		return invalid("the round's bounds must be positive, and its operations limit at most 5000")
	}
	if r.Limits.WindowedAbove < 0 || r.Limits.WindowedAbove >= r.Limits.MaxRows {
		return invalid("the round's limits need 0 <= windowed_above < max_rows")
	}
	if _, err := parity.NewSampler(0, parity.Window{Start: 0, End: 1}, r.Sample); err != nil {
		return err
	}
	_, err := NewPushgateway(s.Pushgateway.URL, s.Pushgateway.TokenFile, nil)
	return err
}
