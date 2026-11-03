package ingest

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	tokenA = "ingest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	tokenB = "ingest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb"
)

func writeTokens(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "tokens")
	require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
	return path
}

func TestLoadTokens(t *testing.T) {
	tokens, err := LoadTokens(writeTokens(t, "# rotation: B replaces A\n"+tokenA+"\n\n  "+tokenB+"  \n"))
	require.NoError(t, err)
	for name, testCase := range map[string]struct {
		header string
		ok     bool
	}{
		"first":          {"Bearer " + tokenA, true},
		"second":         {"Bearer " + tokenB, true},
		"scheme case":    {"bearer " + tokenA, true},
		"unknown":        {"Bearer ingest-token-cccccccccccccccccccccccccccc", false},
		"prefix":         {"Bearer " + tokenA[:20], false},
		"longer":         {"Bearer " + tokenA + "x", false},
		"no scheme":      {tokenA, false},
		"basic":          {"Basic " + tokenA, false},
		"empty":          {"", false},
		"bearer only":    {"Bearer ", false},
		"comment":        {"Bearer # rotation: B replaces A", false},
		"trailing space": {"Bearer " + tokenA + " ", false},
		"over the bound": {"Bearer " + strings.Repeat("a", MaxTokenLength+1), false},
	} {
		t.Run(name, func(t *testing.T) {
			assert.Equal(t, testCase.ok, tokens.Verify(testCase.header))
		})
	}
}

func TestLoadTokensRefuses(t *testing.T) {
	for name, content := range map[string]string{
		"empty":         "",
		"comments only": "# none\n\n",
		"short":         "short-token\n",
		"long":          strings.Repeat("a", MaxTokenLength+1) + "\n",
		"inner space":   "ingest token aaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
		"too large":     strings.Repeat(tokenA+"\n", maxTokenFile/len(tokenA)+1),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := LoadTokens(writeTokens(t, content))
			require.Error(t, err)
			assert.NotContains(t, err.Error(), "aaaa", "a token is never in an error")
		})
	}
	_, err := LoadTokens(filepath.Join(t.TempDir(), "missing"))
	assert.Error(t, err)
}
