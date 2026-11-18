package watchdogtypes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewWindow(t *testing.T) {
	testCases := []struct {
		name  string
		now   time.Time
		start time.Time
		end   time.Time
	}{
		{
			name:  "LagCrossesBucket_EndsOnPreviousBucket",
			now:   time.Date(2026, 11, 18, 12, 1, 59, 0, time.UTC),
			start: time.Date(2026, 11, 18, 11, 40, 0, 0, time.UTC),
			end:   time.Date(2026, 11, 18, 11, 55, 0, 0, time.UTC),
		},
		{
			name:  "LagLandsOnBucket_EndsOnIt",
			now:   time.Date(2026, 11, 18, 12, 2, 0, 0, time.UTC),
			start: time.Date(2026, 11, 18, 11, 45, 0, 0, time.UTC),
			end:   time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC),
		},
		{
			name:  "NonUTCClock_ReturnsUTC",
			now:   time.Date(2026, 11, 18, 9, 9, 0, 0, time.FixedZone("BRT", -3*3600)),
			start: time.Date(2026, 11, 18, 11, 50, 0, 0, time.UTC),
			end:   time.Date(2026, 11, 18, 12, 5, 0, 0, time.UTC),
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			window := NewWindow(testCase.now)
			assert.Equal(t, testCase.start, window.Start)
			assert.Equal(t, testCase.end, window.End)
		})
	}
}

func TestWindow_Buckets(t *testing.T) {
	window := NewWindow(time.Date(2026, 11, 18, 12, 2, 0, 0, time.UTC))
	start := window.Start.UnixMilli()
	assert.Equal(t, []int64{start, start + 300_000, start + 600_000}, window.Buckets())
}

func TestWindow_SeasonShift(t *testing.T) {
	testCases := []struct {
		name    string
		season  int
		seconds int64
	}{
		{name: "FirstSeason_OneDay", season: 1, seconds: 86_400},
		{name: "LastSeason_FourDays", season: 4, seconds: 345_600},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.seconds, SeasonShift(testCase.season))
		})
	}
}
