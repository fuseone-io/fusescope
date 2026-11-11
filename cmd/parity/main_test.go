package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAFailureIsPrintedByItsCodeOnly(t *testing.T) {
	err := errors.Newf(errors.TypeInternal, errors.CodeInternal, "SELECT secret FROM tenant")
	assert.Equal(t, "internal/"+errors.CodeInternal.String(), errorCode(err))
}

func TestARunNeedsItsFiles(t *testing.T) {
	var out, errOut bytes.Buffer
	assert.Error(t, run([]string{"investigate"}, &out, &errOut), "only run is served")
	missing := filepath.Join(t.TempDir(), "absent.yaml")
	assert.Error(t, run([]string{"run", "-settings", missing, "-tenants", missing, "-reports", t.TempDir()}, &out, &errOut))

	bad := filepath.Join(t.TempDir(), "settings.yaml")
	require.NoError(t, os.WriteFile(bad, []byte("version: 2\n"), 0o600))
	assert.Error(t, run([]string{"run", "-settings", bad, "-tenants", missing, "-reports", t.TempDir()}, &out, &errOut))
}
