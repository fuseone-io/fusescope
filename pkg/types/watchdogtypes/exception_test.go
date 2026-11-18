package watchdogtypes

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func TestNewExceptionEvaluation(t *testing.T) {
	orgID := valuer.MustNewUUID("0196e2e4-0000-7000-8000-000000000001")
	firstSeen := testWindow.End.Add(-time.Minute)
	group := ExceptionGroup{GroupID: "0f3c9a", Service: "payments", Type: "TimeoutError", FirstSeen: firstSeen.In(time.FixedZone("BRT", -3*3600))}
	now := testWindow.End.Add(time.Minute)

	evaluation := NewExceptionEvaluation(orgID, testWindow, group, now)
	change, err := ApplyEvaluation(nil, evaluation)
	require.NoError(t, err)

	fingerprint, err := NewFingerprint(DetectorNewException, "payments", "0f3c9a")
	require.NoError(t, err)
	require.NotNil(t, change.Issue)
	assert.Equal(t, TransitionCreated, change.Transition)
	assert.Equal(t, fingerprint, change.Issue.Fingerprint)
	assert.Equal(t, testWindow.End, change.Issue.FirstSeen)
	assert.Nil(t, change.Issue.PeakScore)
	utc := firstSeen.UTC()
	assert.Equal(t, &Evidence{Version: EvidenceVersion, GroupID: "0f3c9a", ExceptionType: "TimeoutError", FirstSeen: &utc}, change.Issue.Evidence)
	assert.Equal(t, time.UTC, change.Issue.Evidence.FirstSeen.Location())
}

func TestEvidence_FirstSeenOnlyForExceptions(t *testing.T) {
	red, err := json.Marshal(Evidence{Version: EvidenceVersion})
	require.NoError(t, err)
	assert.NotContains(t, string(red), "firstSeen")

	at := time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)
	exception, err := json.Marshal(Evidence{Version: EvidenceVersion, GroupID: "0f3c9a", FirstSeen: &at})
	require.NoError(t, err)
	assert.Contains(t, string(exception), `"firstSeen":"2026-11-18T12:00:00Z"`)
}

func TestServicesWithHistory(t *testing.T) {
	testCases := []struct {
		name    string
		volumes map[string][Seasons]float64
		history map[string]bool
	}{
		{name: "NoSeason_NoHistory", volumes: map[string][Seasons]float64{}, history: map[string]bool{}},
		{name: "OneSeason_HasHistory", volumes: map[string][Seasons]float64{"cart": {-1, -1, -1, 10}}, history: map[string]bool{"cart": true}},
		{
			name:    "EverySeason_HasHistory",
			volumes: map[string][Seasons]float64{"cart": {10, 10, 10, 10}, "checkout": {-1, 5, -1, -1}},
			history: map[string]bool{"cart": true, "checkout": true},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.history, ServicesWithHistory(seasonsOf(testCase.volumes)))
		})
	}
}
