package parityrun

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

// runKeyCheckLabel separates the run key check from every other use of the key.
const runKeyCheckLabel = "fusescope-parity/run-key-check/v1\x00"

// RunKeyCheck is the report header's check of a run's key: an HMAC of the run id under the key. It
// lets the investigation refuse a wrong key before any query. It is an offline verifier of the
// key, safe because the key is 256 bits from a CSPRNG.
func RunKeyCheck(key []byte, runID string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(runKeyCheckLabel + runID))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyRunKey tells, in constant time, whether key is the key check was made with for runID.
func VerifyRunKey(key []byte, runID, check string) bool {
	want, err := hex.DecodeString(check)
	if err != nil {
		return false
	}
	got, _ := hex.DecodeString(RunKeyCheck(key, runID))
	return hmac.Equal(got, want)
}
