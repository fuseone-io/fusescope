package main

import (
	"bytes"
	"crypto/rand"
	"io"
	"os"
	"path/filepath"
	"testing"
	"testing/iotest"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityinvestigate"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAFailureIsPrintedByItsCodeOnly(t *testing.T) {
	err := errors.Newf(errors.TypeInternal, errors.CodeInternal, "SELECT secret FROM tenant")
	assert.Equal(t, "internal/"+errors.CodeInternal.String(), errorCode(err))
}

func TestARunNeedsItsFiles(t *testing.T) {
	var out, errOut bytes.Buffer
	assert.Error(t, run([]string{"compare"}, &out, &errOut), "an unknown command")
	missing := filepath.Join(t.TempDir(), "absent.yaml")
	assert.Error(t, run([]string{"run", "-settings", missing, "-tenants", missing, "-reports", t.TempDir()}, &out, &errOut))

	bad := filepath.Join(t.TempDir(), "settings.yaml")
	require.NoError(t, os.WriteFile(bad, []byte("version: 2\n"), 0o600))
	assert.Error(t, run([]string{"run", "-settings", bad, "-tenants", missing, "-reports", t.TempDir()}, &out, &errOut))
}

func TestAnInvestigationOutsideTheClusterReadsNothing(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	var out, errOut bytes.Buffer
	missing := filepath.Join(t.TempDir(), "absent.yaml")
	err := run([]string{"investigate", "-settings", missing, "-tenants", missing}, &out, &errOut)
	require.Error(t, err)
	assert.True(t, errors.Asc(err, parityinvestigate.ErrCodeEnvironment), "refused by its environment, before the settings are read: %v", err)
}

func TestASecretNeverComesFromStdinStdoutOrStderr(t *testing.T) {
	for _, name := range []string{"0", "1", "2", "-1", "stdin", ""} {
		_, err := secretSource(name)
		assert.Error(t, err, name)
	}
}

func deploymentSettings(t *testing.T) parityrun.Settings {
	t.Helper()
	return parityrun.Settings{
		Bucket:      parityrun.BucketSettings{Name: "parity-staging", KMSKeyID: "arn:aws:kms:us-east-1:1:key/q", MaxQueueBytes: 1 << 20, MaxQueueSpecs: 10},
		Health:      parityrun.HealthSettings{URL: "https://prometheus:9090", TokenFile: "/prom/token", InstanceLabel: "pod", Exporters: []string{"fusescope_clickhouse", "otlp/engine"}},
		Pushgateway: parityrun.PushgatewaySettings{URL: "https://pushgateway:9091", TokenFile: "/push/token"},
	}
}

var oneTenant = parityrun.Tenants{Tenants: []parityrun.Tenant{{Org: valuer.MustNewUUID("0190f3a1-7b2c-7d4e-9f00-112233445566"), CollectorInstances: []string{"c-0"}}}}

func TestTheInvestigationsRoundReadsTheDualWriteHealth(t *testing.T) {
	round, err := investigationRound(parityrun.Round{}, deploymentSettings(t), oneTenant)
	require.NoError(t, err)
	assert.IsType(t, parityrun.PrometheusHealth{}, round.Health, "without it every minute is unobserved and nothing is reproduced")
}

func TestASessionCarriesTheWindowItInvestigates(t *testing.T) {
	w := parity.Window{Start: 1_700_000_000_000_000_000, End: 1_700_003_600_000_000_000}
	s, err := newSession(rand.Reader, parityinvestigate.Operator{Issuer: "https://idp", Subject: "u"}, "run", "org", parity.Settled, w)
	require.NoError(t, err)
	assert.Equal(t, time.Unix(0, w.Start), s.Start)
	assert.Equal(t, time.Unix(0, w.End), s.End)
	assert.Len(t, s.ID, 32)

	_, err = newSession(iotest.ErrReader(io.ErrUnexpectedEOF), parityinvestigate.Operator{}, "run", "org", parity.Settled, w)
	assert.Error(t, err, "no session without its random id")
}

func TestADeploymentIsCheckedBeforeAnyEffect(t *testing.T) {
	dir := t.TempDir()
	assert.NoError(t, checkDeployment(deploymentSettings(t), dir))
	noBucket := deploymentSettings(t)
	noBucket.Bucket.Name = ""
	assert.Error(t, checkDeployment(noBucket, dir))
	noQueue := deploymentSettings(t)
	noQueue.Bucket.MaxQueueSpecs = 0
	assert.Error(t, checkDeployment(noQueue, dir))
	assert.Error(t, checkDeployment(deploymentSettings(t), filepath.Join(dir, "absent")))
	file := filepath.Join(dir, "file")
	require.NoError(t, os.WriteFile(file, nil, 0o600))
	assert.Error(t, checkDeployment(deploymentSettings(t), file), "not a directory")
}
