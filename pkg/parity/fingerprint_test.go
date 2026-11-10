package parity

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAValueReadsAsItsFingerprintTypeAndLength(t *testing.T) {
	f := fingerprinter(t, "0123456789abcdef0123456789abcdef")
	got := f.Value("eng-cart")
	assert.Equal(t, "string", got.Type)
	assert.Equal(t, 8, got.Length)
	assert.Len(t, got.MAC, 64, "the whole HMAC-SHA-256, hex")
	assert.NotContains(t, got.MAC, "eng-cart")
	assert.Equal(t, got, f.Value("eng-cart"), "the same value, the same fingerprint")
	assert.NotEqual(t, got.MAC, f.Value("eng-carts").MAC)
}

func TestTheFingerprintDependsOnTheRunKey(t *testing.T) {
	a := fingerprinter(t, "0123456789abcdef0123456789abcdef")
	b := fingerprinter(t, "fedcba9876543210fedcba9876543210")
	assert.NotEqual(t, a.Value("eng-cart").MAC, b.Value("eng-cart").MAC)
}

func TestValuesOfDifferentTypesNeverShareAFingerprint(t *testing.T) {
	f := fingerprinter(t, "0123456789abcdef0123456789abcdef")
	cases := []any{nil, "", "1", float64(1), int64(1), uint64(1), true, []any{}, map[string]any{}}
	seen := map[string]any{}
	for _, v := range cases {
		mac := f.Value(v).MAC
		other, dup := seen[mac]
		require.False(t, dup, "%#v and %#v", v, other)
		seen[mac] = v
	}
	assert.Equal(t, "null", f.Value(nil).Type)
	assert.Equal(t, 0, f.Value("").Length, "an empty string is not a null")
	assert.Equal(t, 2, f.Value([]any{1, 2}).Length)
}

func TestADynamicPathSegmentReadsAsAShortFingerprint(t *testing.T) {
	f := fingerprinter(t, "0123456789abcdef0123456789abcdef")
	segment := f.Segment("eng-cart")
	assert.True(t, strings.HasPrefix(segment, "h:"), segment)
	assert.Len(t, segment, 2+16)
	assert.NotContains(t, segment, "eng-cart")
	assert.Equal(t, segment, f.Segment("eng-cart"))
	assert.Equal(t, "services["+segment+"].numCalls", f.Path("services", Dynamic("eng-cart"), "numCalls"), "fixed segments stay as they are")
}

func TestAShortRunKeyIsRefused(t *testing.T) {
	_, err := NewFingerprinter([]byte("short"))
	assert.Error(t, err)
}

func fingerprinter(t *testing.T, key string) *Fingerprinter {
	f, err := NewFingerprinter([]byte(key))
	require.NoError(t, err)
	return f
}
