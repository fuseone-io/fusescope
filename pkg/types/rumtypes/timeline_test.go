package rumtypes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewSessionViews(t *testing.T) {
	at := time.Date(2026, 10, 22, 14, 0, 0, 0, time.UTC)
	view := func(offset time.Duration, route string) *TimelineEvent {
		return &TimelineEvent{Kind: TimelineEventKindView, Timestamp: at.Add(offset), Route: route, View: &ViewEvent{SpanID: route}}
	}
	click := func(offset time.Duration) *TimelineEvent {
		return &TimelineEvent{Kind: TimelineEventKindClick, Timestamp: at.Add(offset), Action: &ActionEvent{Type: "click"}}
	}

	views, leading := NewSessionViews(
		[]*TimelineEvent{view(10*time.Second, "/cart"), view(0, "/")},
		[]*TimelineEvent{click(12 * time.Second), click(-time.Second), click(0), click(5 * time.Second), click(10 * time.Second)},
	)

	require.Len(t, views, 2)
	assert.Equal(t, "/", views[0].Route)
	assert.Equal(t, "/cart", views[1].Route)
	assert.Len(t, leading, 1)
	assert.Len(t, views[0].Events, 2)
	assert.Len(t, views[1].Events, 2)
	assert.Equal(t, at.Add(10*time.Second), views[1].Events[0].Timestamp)

	views, leading = NewSessionViews(nil, []*TimelineEvent{click(0)})
	assert.Empty(t, views)
	assert.Len(t, leading, 1)
}

func TestNearestFailedRequest(t *testing.T) {
	at := time.Date(2026, 10, 22, 14, 0, 0, 0, time.UTC)
	request := func(offset time.Duration, failed bool) *TimelineEvent {
		return &TimelineEvent{Kind: TimelineEventKindRequest, Timestamp: at.Add(offset), Request: &RequestEvent{Failed: failed, SpanID: offset.String()}}
	}

	testCases := []struct {
		name     string
		events   []*TimelineEvent
		expected string
	}{
		{name: "LatestFailedInWindow", events: []*TimelineEvent{request(-4*time.Second, true), request(-time.Second, true), request(-500*time.Millisecond, false)}, expected: (-time.Second).String()},
		{name: "OutsideWindow_None", events: []*TimelineEvent{request(-6*time.Second, true)}},
		{name: "AfterError_None", events: []*TimelineEvent{request(time.Millisecond, true)}},
		{name: "OnlySucceeded_None", events: []*TimelineEvent{request(-time.Second, false)}},
		{name: "AtError_Kept", events: []*TimelineEvent{request(0, true)}, expected: time.Duration(0).String()},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			nearest := NearestFailedRequest(testCase.events, at)
			if testCase.expected == "" {
				assert.Nil(t, nearest)
				return
			}
			require.NotNil(t, nearest)
			assert.Equal(t, testCase.expected, nearest.Request.SpanID)
		})
	}
}

func TestNewestRelease(t *testing.T) {
	at := time.Date(2026, 10, 22, 14, 0, 0, 0, time.UTC)
	testCases := []struct {
		name      string
		firstSeen map[string]time.Time
		expected  string
	}{
		{name: "LatestFirstSeen", firstSeen: map[string]time.Time{"1.7.4": at, "1.8.0": at.Add(time.Hour), "1.7.2": at.Add(-time.Hour)}, expected: "1.8.0"},
		{name: "OneRelease_None", firstSeen: map[string]time.Time{"1.8.0": at}, expected: ""},
		{name: "EmptyReleaseIgnored_None", firstSeen: map[string]time.Time{"": at, "1.8.0": at.Add(time.Hour)}, expected: ""},
		{name: "Tie_HighestName", firstSeen: map[string]time.Time{"a": at, "b": at}, expected: "b"},
		{name: "Semver_HighestVersionWins_OverFirstSeen", firstSeen: map[string]time.Time{"10.0.0": at, "9.0.0": at.Add(time.Hour)}, expected: "10.0.0"},
		{name: "Semver_ReleaseOverPrerelease", firstSeen: map[string]time.Time{"2.0.0-rc.1": at.Add(time.Hour), "2.0.0": at}, expected: "2.0.0"},
		{name: "NotAllSemver_LatestFirstSeen", firstSeen: map[string]time.Time{"9f2c1ab": at.Add(time.Hour), "10.0.0": at}, expected: "9f2c1ab"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, NewestRelease(testCase.firstSeen))
		})
	}
}

func TestNewSparkline(t *testing.T) {
	start := time.Date(2026, 10, 22, 10, 30, 0, 0, time.UTC)
	end := time.Date(2026, 10, 22, 13, 10, 0, 0, time.UTC)
	sparkline := NewSparkline(start, end, time.Hour, map[int64]int64{
		time.Date(2026, 10, 22, 10, 0, 0, 0, time.UTC).Unix(): 2,
		time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC).Unix(): 5,
		time.Date(2026, 10, 22, 20, 0, 0, 0, time.UTC).Unix(): 9,
	})

	assert.Equal(t, time.Date(2026, 10, 22, 10, 0, 0, 0, time.UTC), sparkline.Start)
	assert.Equal(t, int64(3600), sparkline.StepSeconds)
	assert.Equal(t, []int64{2, 0, 5, 0}, sparkline.Counts)
}

func TestClientLabels(t *testing.T) {
	testCases := []struct {
		name    string
		client  Client
		browser string
		os      string
	}{
		{name: "Full", client: Client{Browser: "Chrome", BrowserVersion: "130", OS: "Android", OSVersion: "14"}, browser: "Chrome 130", os: "Android 14"},
		{name: "NoVersion", client: Client{Browser: "Chrome", OS: "Linux"}, browser: "Chrome", os: "Linux"},
		{name: "Unknown", client: Client{}, browser: "Unknown", os: "Unknown"},
		{name: "Mobile_DeviceForBrowser", client: Client{Device: "Google Pixel 8", OS: "Android", OSVersion: "14"}, browser: "Google Pixel 8", os: "Android 14"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.browser, testCase.client.BrowserLabel())
			assert.Equal(t, testCase.os, testCase.client.OSLabel())
		})
	}
}

func TestNewLoadingType(t *testing.T) {
	testCases := []struct {
		name     string
		value    string
		expected LoadingType
	}{
		{name: "InitialLoad", value: "initial_load", expected: LoadingTypeInitialLoad},
		{name: "RouteChange", value: "route_change", expected: LoadingTypeRouteChange},
		{name: "Missing_Unknown", value: "", expected: LoadingTypeUnknown},
		{name: "Other_Unknown", value: "push", expected: LoadingTypeUnknown},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, NewLoadingType(testCase.value))
		})
	}
}

func TestNewVitalName(t *testing.T) {
	testCases := []struct {
		name     string
		value    string
		expected VitalName
		ok       bool
	}{
		{name: "Lowercase", value: "lcp", expected: VitalNameLCP, ok: true},
		{name: "Uppercase", value: "TTFB", expected: VitalNameTTFB, ok: true},
		{name: "Unknown", value: "fid", ok: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			name, ok := NewVitalName(testCase.value)
			assert.Equal(t, testCase.ok, ok)
			assert.Equal(t, testCase.expected, name)
		})
	}
}

func TestGettableSessionObserve(t *testing.T) {
	at := time.Date(2026, 10, 22, 14, 0, 0, 0, time.UTC)
	session := &GettableSession{}

	session.Observe(at.Add(time.Minute), at.Add(2*time.Minute))
	session.Observe(at, at)
	session.Observe(at.Add(30*time.Second), at.Add(90*time.Second))

	assert.Equal(t, at, session.StartedAt)
	assert.Equal(t, at.Add(2*time.Minute), session.EndedAt)
}

func TestClientMatchesBrowser(t *testing.T) {
	testCases := []struct {
		name    string
		client  Client
		filter  string
		matches bool
	}{
		{name: "Browser_IgnoresCase", client: Client{Browser: "Chrome"}, filter: "chrome", matches: true},
		{name: "Device_Matches", client: Client{Device: "Google Pixel 8"}, filter: "google pixel 8", matches: true},
		{name: "Other_NoMatch", client: Client{Browser: "Firefox"}, filter: "Chrome"},
		{name: "EmptyClient_NoMatch", client: Client{}, filter: "Chrome"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.matches, testCase.client.MatchesBrowser(testCase.filter))
		})
	}
}
