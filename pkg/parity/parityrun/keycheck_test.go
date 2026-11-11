package parityrun

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTheRunKeyCheckIsBoundToItsRun(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte("fusescope-parity/run-key-check/v1\x00run-1"))
	want := hex.EncodeToString(mac.Sum(nil))

	assert.Equal(t, want, RunKeyCheck(key, "run-1"), "computed apart from the code")
	assert.NotEqual(t, RunKeyCheck(key, "run-1"), RunKeyCheck(key, "run-2"), "bound to the run")
	assert.True(t, VerifyRunKey(key, "run-1", want))
	assert.False(t, VerifyRunKey([]byte("another key of thirty-two bytes!"), "run-1", want))
	assert.False(t, VerifyRunKey(key, "run-2", want))
	assert.False(t, VerifyRunKey(key, "run-1", "not hex"))
}

func TestTheHeaderCarriesTheRunKeyCheck(t *testing.T) {
	r, keys, _, dir := round(t, &store{p99: 5}, &store{p99: 5})
	_, err := r.Run(t.Context())
	assert.NoError(t, err)
	_, records := lines(t, dir)
	assert.Equal(t, RunKeyCheck(keys.keys[0], records[0]["run_id"].(string)), records[0]["run_key_check"])
}
