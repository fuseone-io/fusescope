package parityrun

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

const inlineDSNLine = `  clickhouse: {dsn: "tcp://parity:secret@clickhouse:9000"}
`

func withDSNFile(path string) string {
	return strings.Replace(settingsYAML, inlineDSNLine, "", 1) + "credentials: {clickhouse_dsn_file: " + path + "}\n"
}

func TestTheClickHouseDSNComesFromExactlyOneSource(t *testing.T) {
	s, err := ParseSettings(strings.NewReader(withDSNFile("/run/parity/clickhouse/dsn")))
	require.NoError(t, err, "a file in place of the inline DSN")
	assert.Equal(t, "/run/parity/clickhouse/dsn", s.Credentials.ClickHouseDSNFile)
	assert.Empty(t, s.ClickHouse.Clickhouse.DSN, "the file is not read while parsing")

	cases := map[string]string{
		"both":          settingsYAML + "credentials: {clickhouse_dsn_file: /run/parity/clickhouse/dsn}\n",
		"neither":       strings.Replace(settingsYAML, inlineDSNLine, "", 1),
		"a relative":    withDSNFile("clickhouse/dsn"),
		"an empty path": withDSNFile("''"),
	}
	for name, body := range cases {
		_, err := ParseSettings(strings.NewReader(body))
		require.Error(t, err, name)
		assert.True(t, errors.Asc(err, ErrCodeSettings), "%s: %v", name, err)
	}
}

func TestTheClickHouseDSNFileIsReadWhole(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "dsn")
	require.NoError(t, os.WriteFile(path, []byte("tcp://parity:from-file@clickhouse:9000\n"), 0o600))
	s, err := ParseSettings(strings.NewReader(withDSNFile(path)))
	require.NoError(t, err)
	s, err = s.LoadCredentials()
	require.NoError(t, err)
	assert.Equal(t, "tcp://parity:from-file@clickhouse:9000", s.ClickHouse.Clickhouse.DSN, "the trailing newline a Secret holds is dropped")
}

func TestAnInlineDSNNeedsNoFile(t *testing.T) {
	s, err := ParseSettings(strings.NewReader(settingsYAML))
	require.NoError(t, err)
	s, err = s.LoadCredentials()
	require.NoError(t, err)
	assert.Equal(t, "tcp://parity:secret@clickhouse:9000", s.ClickHouse.Clickhouse.DSN)
}

func TestABadDSNFileIsRefusedWithoutItsContent(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) string {
		path := filepath.Join(dir, name)
		require.NoError(t, os.WriteFile(path, []byte(body), 0o600))
		return path
	}
	cases := map[string]string{
		"missing":  filepath.Join(dir, "absent"),
		"empty":    write("empty", " \n"),
		"too long": write("long", "tcp://parity:leaked-password@clickhouse:9000/?"+strings.Repeat("x", maxDSNBytes)),
		"a dir":    dir,
	}
	for name, path := range cases {
		s, err := ParseSettings(strings.NewReader(withDSNFile(path)))
		require.NoError(t, err, name)
		_, err = s.LoadCredentials()
		require.Error(t, err, name)
		assert.True(t, errors.Asc(err, ErrCodeCredentials), "%s: %v", name, err)
		assert.NotContains(t, err.Error(), "leaked-password", name)
	}
}

func TestTheCleanupReadsOnlyItsSection(t *testing.T) {
	broken := strings.NewReplacer(
		"provider: flight", "provider: nothing",
		"https://pushgateway", "http://pushgateway",
	).Replace(withDSNFile("/nonexistent/clickhouse/dsn")) + "bucket: {name: ''}\nhealth: {url: 'http://nowhere'}\n"
	s, err := ParseCleanupSettings(strings.NewReader(broken + "secret: {namespace: parity-run-keys}\n"))
	require.NoError(t, err, "the engine, the DSN file, the bucket, the health and the Pushgateway are not the cleanup's")
	assert.Equal(t, "parity-run-keys", s.Namespace)
	assert.Equal(t, "/var/run/secrets/kubernetes.io/serviceaccount/token", s.TokenFile)
	assert.Equal(t, "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt", s.CAFile)
	assert.Equal(t, 90*24*time.Hour, s.Expiry)
}

func TestTheCleanupsSectionIsChecked(t *testing.T) {
	const ok = "version: 1\nsecret: {namespace: parity-run-keys}\n"
	cases := map[string]string{
		"another document":  ok + "---\nversion: 1\n",
		"another version":   strings.Replace(ok, "version: 1", "version: 2", 1),
		"no version":        "secret: {namespace: parity-run-keys}\n",
		"no namespace":      "version: 1\nsecret: {}\n",
		"a bad namespace":   "version: 1\nsecret: {namespace: Parity_Keys}\n",
		"a relative token":  "version: 1\nsecret: {namespace: parity-run-keys, token_file: token}\n",
		"a relative CA":     "version: 1\nsecret: {namespace: parity-run-keys, ca_file: ca.crt}\n",
		"no expiry":         "version: 1\nsecret: {namespace: parity-run-keys, expiry: 0s}\n",
		"a section of junk": "version: 1\nsecret: [1, 2]\n",
	}
	for name, body := range cases {
		_, err := ParseCleanupSettings(strings.NewReader(body))
		require.Error(t, err, name)
		assert.True(t, errors.Asc(err, ErrCodeSettings), "%s: %v", name, err)
	}
}
