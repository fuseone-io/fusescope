package parityrun

import (
	"io"
	"time"

	"gopkg.in/yaml.v3"

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
}

// Settings are the parity's own: its two stores, decoded as the backend decodes them and over the
// backend's defaults, the modules' configurations, the round's bounds and the Pushgateway.
type Settings struct {
	Engine      telemetrystore.Config
	ClickHouse  telemetrystore.Config
	Querier     querier.Config
	TraceDetail tracedetail.Config
	Round       Config
	Pushgateway PushgatewaySettings
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
// a ClickHouse without a DSN, bounds that are not positive, or a Pushgateway not over https.
func ParseSettings(r io.Reader) (Settings, error) {
	invalid := func(format string, args ...any) (Settings, error) {
		return Settings{}, errors.Newf(errors.TypeInvalidInput, ErrCodeSettings, format, args...)
	}
	var raw map[string]any
	dec := yaml.NewDecoder(r)
	if err := dec.Decode(&raw); err != nil {
		return invalid("the settings file does not decode: %v", err)
	}
	if err := oneDocument(dec); err != nil {
		return Settings{}, err
	}
	for section := range raw {
		if !settingsSections[section] {
			return invalid("the settings file has an unknown section %q", section)
		}
	}
	if v, _ := raw["version"].(int); v != settingsVersion {
		return invalid("the settings file is not version %d", settingsVersion)
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
	}
	round := roundSettingsOf(s.Round)
	for path, target := range map[string]any{"engine": &s.Engine, "clickhouse": &s.ClickHouse, "querier": &s.Querier, "traces": &s.TraceDetail, "round": &round, "pushgateway": &s.Pushgateway} {
		if err := conf.Unmarshal(path, target); err != nil {
			return invalid("the %s settings do not decode: %v", path, err)
		}
	}
	s.Round = round.apply(s.Round)
	if err := s.validate(); err != nil {
		return Settings{}, err
	}
	return s, nil
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
	if s.ClickHouse.Provider != "clickhouse" || s.ClickHouse.Clickhouse.DSN == "" {
		return invalid("the ClickHouse graph needs the clickhouse provider and a DSN")
	}
	r := s.Round
	if r.Deadline <= 0 || r.Budget <= 0 || r.RetryWait < 0 || r.Concurrency <= 0 || r.MaxPairs <= 0 || r.ListLimit <= 0 || r.OperationsLimit < 1 || r.OperationsLimit > 5000 {
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
