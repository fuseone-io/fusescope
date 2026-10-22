package implrumapplication

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMonitorSnapshotWindow(t *testing.T) {
	start := time.Date(2026, 10, 21, 12, 0, 30, 0, time.UTC)
	applicationID, keyID := valuer.GenerateUUID(), valuer.GenerateUUID()

	testCases := []struct {
		name     string
		at       time.Duration
		sessions int64
		views    int64
	}{
		{name: "SameMinute_AllCounted", at: 0, sessions: 2, views: 3},
		{name: "FourMinutesLater_AllCounted", at: 4 * time.Minute, sessions: 2, views: 3},
		{name: "FiveMinutesLater_FirstBatchExpired", at: 5 * time.Minute, sessions: 1, views: 1},
		{name: "TenMinutesLater_Empty", at: 10 * time.Minute, sessions: 0, views: 0},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			monitor := newMonitor()
			monitor.ObserveIngest(applicationID, keyID, &rumtypes.IngestBatch{SessionIDs: []string{"s1", "s2"}, Views: 2}, false, start)
			monitor.ObserveIngest(applicationID, keyID, &rumtypes.IngestBatch{SessionIDs: []string{"s2"}, Views: 1, SDKName: rumtypes.SDKBrowserName, SDKVersion: "0.1.0"}, false, start.Add(time.Minute))

			counts, sdk, _, _ := monitor.Snapshot(applicationID, start.Add(testCase.at))
			assert.Equal(t, testCase.sessions, counts.Sessions)
			assert.Equal(t, testCase.views, counts.Views)
			assert.Equal(t, rumtypes.SDKSupportSupported, sdk.Support)
		})
	}
}

func TestMonitorRejections(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	applicationID := valuer.GenerateUUID()
	monitor := newMonitor()

	monitor.ObserveRejection(applicationID, rumtypes.RejectionReasonOriginNotAllowed, "https://evil.test", now)
	monitor.ObserveRejection(applicationID, rumtypes.RejectionReasonOriginNotAllowed, "https://other.test", now.Add(time.Minute))
	monitor.ObserveRejection(applicationID, rumtypes.RejectionReasonRateLimited, "", now.Add(30*time.Second))

	_, _, rejections, _ := monitor.Snapshot(applicationID, now.Add(2*time.Minute))
	require.Len(t, rejections, 2)
	assert.Equal(t, rumtypes.RejectionReasonOriginNotAllowed, rejections[0].Reason)
	assert.Equal(t, int64(2), rejections[0].Count)
	assert.Equal(t, "https://other.test", rejections[0].LastOrigin)
	assert.Equal(t, rumtypes.RejectionReasonRateLimited, rejections[1].Reason)
	assert.Equal(t, int64(1), rejections[1].Count)
}

func TestMonitorUsage(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	applicationID, keyID := valuer.GenerateUUID(), valuer.GenerateUUID()
	monitor := newMonitor()

	monitor.ObserveIngest(applicationID, keyID, &rumtypes.IngestBatch{}, false, now)
	monitor.ObserveIngest(applicationID, keyID, &rumtypes.IngestBatch{}, false, now.Add(time.Second))

	_, _, _, pending := monitor.Snapshot(applicationID, now)
	require.NotNil(t, pending)
	assert.Equal(t, now, *pending)

	keysUsed, firstSeen := monitor.TakeUsage()
	assert.Equal(t, map[valuer.UUID]time.Time{keyID: now.Add(time.Second)}, keysUsed)
	assert.Equal(t, map[valuer.UUID]time.Time{applicationID: now}, firstSeen)

	monitor.ObserveIngest(applicationID, keyID, &rumtypes.IngestBatch{}, false, now.Add(time.Minute))
	_, firstSeen = monitor.TakeUsage()
	assert.Empty(t, firstSeen)

	monitor.RestoreFirstSeen(applicationID, now)
	_, firstSeen = monitor.TakeUsage()
	assert.Equal(t, map[valuer.UUID]time.Time{applicationID: now}, firstSeen)
}

func TestMonitorAlreadySeenNotPending(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	monitor := newMonitor()
	applicationID := valuer.GenerateUUID()

	monitor.ObserveIngest(applicationID, valuer.GenerateUUID(), &rumtypes.IngestBatch{}, true, now)

	_, firstSeen := monitor.TakeUsage()
	assert.Empty(t, firstSeen)
}
