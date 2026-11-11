package parityinvestigate

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func pipeWith(t *testing.T, content string) *os.File {
	t.Helper()
	r, w, err := os.Pipe()
	require.NoError(t, err)
	go func() {
		_, _ = w.WriteString(content)
		_ = w.Close()
	}()
	t.Cleanup(func() { _ = r.Close() })
	return r
}

func TestASecretIsReadWholeFromAPipe(t *testing.T) {
	got, err := ReadSecret(pipeWith(t, "eyJ.token.sig\n"), 64)
	require.NoError(t, err)
	assert.Equal(t, "eyJ.token.sig", string(got), "one trailing newline is not part of the value")

	got, err = ReadSecret(pipeWith(t, "raw"), 64)
	require.NoError(t, err)
	assert.Equal(t, "raw", string(got))
}

func TestASecretIsRefusedOnAnyDoubtAndNeverEchoedInTheError(t *testing.T) {
	cases := map[string]string{
		"empty":            "",
		"only a newline":   "\n",
		"over the limit":   strings.Repeat("x", 65),
		"two values":       "zq1-first\nzq1-second\n",
		"a value and more": "zq2-secret\n\n",
	}
	for name, content := range cases {
		_, err := ReadSecret(pipeWith(t, content), 64)
		require.Error(t, err, name)
		if content != "" && strings.TrimSpace(content) != "" {
			assert.NotContains(t, err.Error(), strings.TrimSpace(strings.Split(content, "\n")[0]), "%s: the error carries no content", name)
		}
	}
}

func TestASecretBufferCanBeWiped(t *testing.T) {
	got, err := ReadSecret(pipeWith(t, "s3cret"), 64)
	require.NoError(t, err)
	Wipe(got)
	assert.Equal(t, make([]byte, len(got)), got)
}
