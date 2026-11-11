package parityrun

import (
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const settingsYAML = `version: 1
engine:
  provider: flight
  flight:
    endpoint: engine:8815
    tls: {cert_file: /certs/tls.crt, key_file: /certs/tls.key, ca_file: /certs/ca.crt, server_name: engine}
    jwt: {key_file: /jwt/key.pem}
clickhouse:
  provider: clickhouse
  clickhouse: {dsn: "tcp://parity:secret@clickhouse:9000"}
round:
  deadline: 20s
  max_rows: 500
  windowed_above: 20
pushgateway:
  url: https://pushgateway:9091
  token_file: /push/token
`

func TestParitySettingsReadOverTheBackendsDefaults(t *testing.T) {
	s, err := ParseSettings(strings.NewReader(settingsYAML))
	require.NoError(t, err)
	assert.Equal(t, "engine:8815", s.Engine.Flight.Endpoint)
	assert.Equal(t, "fusescope-backend", s.Engine.Flight.JWT.Issuer, "the backend's default issuer")
	assert.Positive(t, s.Engine.Flight.JWT.TTL)
	assert.Equal(t, "clickhouse", s.ClickHouse.Provider)
	assert.Equal(t, 20*time.Second, s.Round.Deadline)
	assert.Equal(t, int64(500), s.Round.Limits.MaxRows)
	assert.Equal(t, int64(20), s.Round.Limits.WindowedAbove)
	assert.Equal(t, 2, s.Round.Concurrency, "the design's default")
	assert.Equal(t, "https://pushgateway:9091", s.Pushgateway.URL)
	assert.Positive(t, s.TraceDetail.Waterfall.MaxLimitToSelectAllSpans)
}

func TestParitySettingsAreRefusedWhole(t *testing.T) {
	cases := map[string]string{
		"another version":      strings.Replace(settingsYAML, "version: 1", "version: 2", 1),
		"an unknown section":   settingsYAML + "extra: {}\n",
		"engine on clickhouse": strings.Replace(settingsYAML, "provider: flight", "provider: clickhouse", 1),
		"no engine endpoint":   strings.Replace(settingsYAML, "endpoint: engine:8815", "endpoint: ''", 1),
		"no clickhouse dsn":    strings.Replace(settingsYAML, `dsn: "tcp://parity:secret@clickhouse:9000"`, `dsn: ""`, 1),
		"a plain pushgateway":  strings.Replace(settingsYAML, "https://pushgateway", "http://pushgateway", 1),
		"no concurrency":       strings.Replace(settingsYAML, "  deadline: 20s\n", "  deadline: 20s\n  concurrency: 0\n", 1),
		"another document":     settingsYAML + "---\nversion: 1\n",
		"limits out of order":  strings.Replace(settingsYAML, "windowed_above: 20", "windowed_above: 600", 1),
	}
	for name, body := range cases {
		_, err := ParseSettings(strings.NewReader(body))
		assert.Error(t, err, name)
	}
}

func TestASecondSettingsDocumentIsASettingsError(t *testing.T) {
	_, err := ParseSettings(strings.NewReader(settingsYAML + "---\nversion: 1\n"))
	require.Error(t, err)
	assert.True(t, errors.Asc(err, ErrCodeSettings), "%v", err)
}
