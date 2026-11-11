package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
)

func settingsWithDSNFile(dsnFile, extra string) string {
	return `version: 1
engine:
  provider: flight
  flight:
    endpoint: engine:8815
    tls: {cert_file: /certs/tls.crt, key_file: /certs/tls.key, ca_file: /certs/ca.crt, server_name: engine}
    jwt: {key_file: /jwt/key.pem}
clickhouse:
  provider: clickhouse
credentials: {clickhouse_dsn_file: ` + dsnFile + `}
pushgateway: {url: "https://pushgateway:9091", token_file: /push/token}
` + extra
}

const tenantsYAML = `version: 1
tenants:
  - org: 0190f3a1-7b2c-7d4e-9f00-112233445566
    dual_write_epoch: 2026-10-01T00:00:00Z
    retention: {clickhouse: 720h, engine: 720h}
    collector_instances: [c-0]
`

func write(t *testing.T, dir, name, body string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	require.NoError(t, os.WriteFile(path, []byte(body), 0o600))
	return path
}

func TestRunAndInvestigateReadTheDSNFileWithTheSettings(t *testing.T) {
	dir := t.TempDir()
	tenants := write(t, dir, "tenants.yaml", tenantsYAML)
	dsn := write(t, dir, "dsn", "tcp://parity:pw@clickhouse:9000\n")
	settings, _, err := load(write(t, dir, "settings.yaml", settingsWithDSNFile(dsn, "")), tenants)
	require.NoError(t, err)
	assert.Equal(t, "tcp://parity:pw@clickhouse:9000", settings.ClickHouse.Clickhouse.DSN)

	_, _, err = load(write(t, dir, "missing.yaml", settingsWithDSNFile(filepath.Join(dir, "absent"), "")), tenants)
	require.Error(t, err)
	assert.True(t, errors.Asc(err, parityrun.ErrCodeCredentials), "%v", err)

	var out, errOut bytes.Buffer
	err = run([]string{"run", "-settings", filepath.Join(dir, "missing.yaml"), "-tenants", tenants, "-reports", dir}, &out, &errOut)
	require.Error(t, err)
	assert.True(t, errors.Asc(err, parityrun.ErrCodeCredentials), "a round stops at the DSN file, before any graph or port is built: %v", err)
}

func TestTheCleanupNeedsNoneOfTheRoundsCredentials(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KUBERNETES_SERVICE_HOST", "127.0.0.1")
	t.Setenv("KUBERNETES_SERVICE_PORT", "1")
	token := write(t, dir, "token", "cleanup-token")
	ca := write(t, dir, "ca.crt", "not a certificate")
	body := strings.NewReplacer("provider: flight", "provider: nothing", "https://pushgateway", "http://pushgateway").Replace(settingsWithDSNFile(filepath.Join(dir, "absent"), "bucket: {name: ''}\nsecret: {namespace: parity-run-keys, token_file: "+token+", ca_file: "+ca+"}\n"))
	var out, errOut bytes.Buffer
	err := run([]string{"cleanup", "-settings", write(t, dir, "settings.yaml", body)}, &out, &errOut)
	require.Error(t, err, "the API server is not there")
	assert.False(t, errors.Asc(err, parityrun.ErrCodeSettings), "the settings are the cleanup's: %v", err)
	assert.False(t, errors.Asc(err, parityrun.ErrCodeCredentials), "the DSN file is never read: %v", err)
	assert.True(t, errors.Asc(err, parityrun.ErrCodeRunKey) || errors.Asc(err, parityrun.ErrCodeCleanup), "it reached the run keys: %v", err)
}
