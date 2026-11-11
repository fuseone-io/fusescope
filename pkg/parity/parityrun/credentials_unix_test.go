//go:build unix

package parityrun

import (
	"path/filepath"
	"strings"
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestADSNFileThatIsAFIFOIsRefusedWithoutBlocking(t *testing.T) {
	path := filepath.Join(t.TempDir(), "dsn")
	require.NoError(t, syscall.Mkfifo(path, 0o600))
	s, err := ParseSettings(strings.NewReader(withDSNFile(path)))
	require.NoError(t, err)
	_, err = s.LoadCredentials()
	assert.Error(t, err)
}
