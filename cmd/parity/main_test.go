package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity/parityinvestigate"
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
