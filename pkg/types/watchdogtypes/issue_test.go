package watchdogtypes

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func TestNewFingerprint(t *testing.T) {
	sum := func(key string) string {
		digest := sha256.Sum256([]byte(key))
		return hex.EncodeToString(digest[:])
	}
	testCases := []struct {
		name        string
		detector    Detector
		service     string
		groupID     string
		fingerprint string
	}{
		{name: "ErrorRate", detector: DetectorErrorRate, service: "checkout", fingerprint: sum("error_rate\x00checkout")},
		{name: "LatencyP99", detector: DetectorLatencyP99, service: "cart", fingerprint: sum("latency_p99\x00cart")},
		{name: "ThroughputDrop", detector: DetectorThroughputDrop, service: "frontend", fingerprint: sum("throughput_drop\x00frontend")},
		{name: "NewException_AppendsGroupID", detector: DetectorNewException, service: "payments", groupID: "ab12", fingerprint: sum("new_exception\x00payments\x00ab12")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fingerprint, err := NewFingerprint(testCase.detector, testCase.service, testCase.groupID)
			require.NoError(t, err)
			assert.Equal(t, testCase.fingerprint, fingerprint)
		})
	}
}

func TestNewFingerprint_SeparatorKeepsKeysApart(t *testing.T) {
	a, err := NewFingerprint(DetectorNewException, "a", "b-c")
	require.NoError(t, err)
	b, err := NewFingerprint(DetectorNewException, "a-b", "c")
	require.NoError(t, err)
	assert.NotEqual(t, a, b)
}

func TestNewFingerprint_Invalid(t *testing.T) {
	testCases := []struct {
		name     string
		detector Detector
		service  string
		groupID  string
	}{
		{name: "UnknownDetector", detector: Detector{valuer.NewString("apdex")}, service: "checkout"},
		{name: "EmptyService", detector: DetectorErrorRate},
		{name: "NewException_MissingGroupID", detector: DetectorNewException, service: "payments"},
		{name: "RED_WithGroupID", detector: DetectorLatencyP99, service: "cart", groupID: "ab12"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := NewFingerprint(testCase.detector, testCase.service, testCase.groupID)
			assert.True(t, errors.Ast(err, errors.TypeInvalidInput), "got %v", err)
		})
	}
}

func TestNewDetector(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		detector Detector
		red      bool
	}{
		{name: "ErrorRate", input: "error_rate", detector: DetectorErrorRate, red: true},
		{name: "LatencyP99", input: "latency_p99", detector: DetectorLatencyP99, red: true},
		{name: "ThroughputDrop", input: "throughput_drop", detector: DetectorThroughputDrop, red: true},
		{name: "NewException", input: "new_exception", detector: DetectorNewException},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			detector, err := NewDetector(testCase.input)
			require.NoError(t, err)
			assert.Equal(t, testCase.detector, detector)
			assert.Equal(t, testCase.red, detector.IsRED())

			var decoded Detector
			require.NoError(t, json.Unmarshal([]byte(`"`+testCase.input+`"`), &decoded))
			assert.Equal(t, testCase.detector, decoded)
		})
	}
	assert.Len(t, Detector{}.Enum(), 4)
}

func TestNewDetector_Unknown(t *testing.T) {
	_, err := NewDetector("apdex")
	assert.True(t, errors.Ast(err, errors.TypeInvalidInput), "got %v", err)

	var decoded Detector
	err = json.Unmarshal([]byte(`"apdex"`), &decoded)
	assert.True(t, errors.Ast(err, errors.TypeInvalidInput), "got %v", err)
}

func TestEvidence_RoundTrip(t *testing.T) {
	value, prediction := 0.25, 0.02
	evidence := &Evidence{
		Version: EvidenceVersion,
		Buckets: []EvidenceBucket{
			{Timestamp: time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC), Value: &value, Prediction: &prediction, Lower: &prediction, Upper: &value, Score: &value},
			{Timestamp: time.Date(2026, 11, 18, 12, 5, 0, 0, time.UTC)},
		},
		Score:    6.5,
		Query:    json.RawMessage(`{"signal":"traces"}`),
		Warnings: []string{"partial"},
		GroupID:  "ab12",
	}
	stored, err := evidence.Value()
	require.NoError(t, err)

	var scanned Evidence
	require.NoError(t, scanned.Scan(stored))
	assert.Equal(t, evidence, &scanned)
	require.NoError(t, (&Evidence{}).Scan([]byte(`{"version":1}`)))
}

func TestEvidence_Validate(t *testing.T) {
	testCases := []struct {
		name     string
		evidence Evidence
		valid    bool
	}{
		{name: "CurrentVersion", evidence: Evidence{Version: EvidenceVersion, Buckets: make([]EvidenceBucket, 3)}, valid: true},
		{name: "MissingVersion", evidence: Evidence{}},
		{name: "FutureVersion", evidence: Evidence{Version: EvidenceVersion + 1}},
		{name: "MoreThanTheCurrentBuckets", evidence: Evidence{Version: EvidenceVersion, Buckets: make([]EvidenceBucket, 4)}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := testCase.evidence.Validate()
			if testCase.valid {
				assert.NoError(t, err)
				return
			}
			assert.True(t, errors.Ast(err, errors.TypeInvalidInput), "got %v", err)
		})
	}
}

func TestNewDefaultSetting(t *testing.T) {
	orgID := valuer.GenerateUUID()
	setting := NewDefaultSetting(orgID, DetectorThroughputDrop)
	assert.Equal(t, orgID, setting.OrgID)
	assert.Equal(t, DetectorThroughputDrop, setting.Detector)
	assert.True(t, setting.Enabled)
	assert.False(t, setting.Notify)
	assert.NoError(t, setting.Validate())

	setting.Detector = Detector{valuer.NewString("apdex")}
	assert.True(t, errors.Ast(setting.Validate(), errors.TypeInvalidInput))
}
