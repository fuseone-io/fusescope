package rumtypes

import (
	"time"
)

type GettableErrorGroups struct {
	Groups []*ErrorGroup `json:"groups" required:"true"`
	Total  int64         `json:"total" required:"true" description:"Groups with events in the range."`
	Events int64         `json:"events" required:"true" description:"Error events in the range."`
}

// ErrorGroup aggregates the events of one fingerprint. First seen and new in
// release look back ErrorHistoryWindow, or the data retention if shorter.
type ErrorGroup struct {
	Fingerprint       string      `json:"fingerprint" required:"true"`
	Type              string      `json:"type" required:"true"`
	Message           string      `json:"message" required:"true" description:"Message of the latest event."`
	NormalizedMessage string      `json:"normalizedMessage" required:"true"`
	TopFrame          *StackFrame `json:"topFrame" required:"true" nullable:"true"`
	Source            string      `json:"source" required:"true"`
	Route             string      `json:"route" required:"true" description:"Route of the latest event."`
	Events            int64       `json:"events" required:"true"`
	Sessions          int64       `json:"sessions" required:"true"`
	FirstSeenAt       time.Time   `json:"firstSeenAt" required:"true"`
	FirstSeenRelease  string      `json:"firstSeenRelease" required:"true"`
	LastSeenAt        time.Time   `json:"lastSeenAt" required:"true"`
	LastSeenRelease   string      `json:"lastSeenRelease" required:"true"`
	Releases          []string    `json:"releases" required:"true" description:"Releases with events in the range."`
	NewInRelease      bool        `json:"newInRelease" required:"true" description:"First seen in the newest release with telemetry in the range, when an older release exists."`
	Sparkline         *Sparkline  `json:"sparkline" required:"true"`
}

type Sparkline struct {
	Start       time.Time `json:"start" required:"true"`
	StepSeconds int64     `json:"stepSeconds" required:"true"`
	Counts      []int64   `json:"counts" required:"true"`
}

type GettableErrorGroup struct {
	ErrorGroup
	LatestEvents     []*ErrorEvent      `json:"latestEvents" required:"true" description:"Up to 10, newest first."`
	SelectedEventID  string             `json:"selectedEventId" required:"true"`
	Breadcrumbs      []*TimelineEvent   `json:"breadcrumbs" required:"true" description:"Views, clicks, actions and requests of the selected event's session in the 2 minutes before it."`
	LinkedRequest    *TimelineEvent     `json:"linkedRequest" required:"true" nullable:"true" description:"The failed request of the same session that started last in the 5 seconds before the selected event."`
	AffectedSessions []*AffectedSession `json:"affectedSessions" required:"true" description:"The 5 sessions with the latest events."`
}

type ErrorEvent struct {
	ID           string       `json:"id" required:"true"`
	Timestamp    time.Time    `json:"timestamp" required:"true"`
	SessionID    string       `json:"sessionId" required:"true"`
	Route        string       `json:"route" required:"true"`
	Release      string       `json:"release" required:"true"`
	Client       Client       `json:"client" required:"true"`
	Type         string       `json:"type" required:"true"`
	Message      string       `json:"message" required:"true"`
	Source       string       `json:"source" required:"true"`
	Stacktrace   string       `json:"stacktrace" required:"true" description:"exception.stacktrace as received."`
	Frames       []StackFrame `json:"frames" required:"true"`
	Symbolicated bool         `json:"symbolicated" required:"true" description:"Whether frames were mapped through an uploaded source map."`
}

type AffectedSession struct {
	SessionID   string    `json:"sessionId" required:"true"`
	StartedAt   time.Time `json:"startedAt" required:"true"`
	LastErrorAt time.Time `json:"lastErrorAt" required:"true"`
	Release     string    `json:"release" required:"true"`
	Client      Client    `json:"client" required:"true"`
	Views       int64     `json:"views" required:"true"`
	Errors      int64     `json:"errors" required:"true" description:"Events of this group in the session."`
}

// NewestRelease returns the release first seen last, or "" when fewer than
// two releases exist, since then nothing is new relative to anything.
func NewestRelease(firstSeen map[string]time.Time) string {
	newest, count := "", 0
	var newestAt time.Time
	for release, at := range firstSeen {
		if release == "" {
			continue
		}
		count++
		if newest == "" || at.After(newestAt) || (at.Equal(newestAt) && release > newest) {
			newest, newestAt = release, at
		}
	}
	if count < 2 {
		return ""
	}
	return newest
}

// NewSparkline lays counts keyed by bucket start (unix seconds) on a dense
// series from start to end.
func NewSparkline(start time.Time, end time.Time, step time.Duration, counts map[int64]int64) *Sparkline {
	first := start.Truncate(step)
	buckets := int(end.Sub(first)/step) + 1
	series := make([]int64, buckets)
	for bucket, count := range counts {
		index := int(time.Unix(bucket, 0).Sub(first) / step)
		if index >= 0 && index < buckets {
			series[index] += count
		}
	}
	return &Sparkline{Start: first.UTC(), StepSeconds: int64(step.Seconds()), Counts: series}
}
