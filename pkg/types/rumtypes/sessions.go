package rumtypes

import (
	"time"
)

type GettableSessions struct {
	Sessions []*SessionSummary `json:"sessions" required:"true"`
	Total    int64             `json:"total" required:"true" description:"Sessions matching the filters."`
}

type SessionSummary struct {
	SessionID         string    `json:"sessionId" required:"true"`
	PreviousSessionID string    `json:"previousSessionId" required:"true" description:"session.previous_id, empty for a first session."`
	UserID            string    `json:"userId" required:"true" description:"user.id, else user.hash; empty when the app set no user."`
	StartedAt         time.Time `json:"startedAt" required:"true"`
	EndedAt           time.Time `json:"endedAt" required:"true" description:"End of the session's last span."`
	DurationMs        float64   `json:"durationMs" required:"true"`
	Views             int64     `json:"views" required:"true"`
	Actions           int64     `json:"actions" required:"true" description:"Clicks and custom actions."`
	Errors            int64     `json:"errors" required:"true"`
	Client            Client    `json:"client" required:"true"`
	Release           string    `json:"release" required:"true"`
	Environment       string    `json:"environment" required:"true"`
}

type GettableSession struct {
	SessionSummary
	PageLoads      int64            `json:"pageLoads" required:"true"`
	Requests       int64            `json:"requests" required:"true"`
	FailedRequests int64            `json:"failedRequests" required:"true"`
	Vitals         int64            `json:"vitals" required:"true"`
	TimelineViews  []*SessionView   `json:"timeline" required:"true" description:"Views in order, each with what happened while it was current."`
	Leading        []*TimelineEvent `json:"leadingEvents" required:"true" description:"Events before the first view."`
	Truncated      bool             `json:"truncated" required:"true" description:"The session has more spans or events than one response carries."`
}

type SessionView struct {
	Timestamp time.Time `json:"timestamp" required:"true"`
	Route     string    `json:"route" required:"true"`
	ViewEvent
	Events []*TimelineEvent `json:"events" required:"true"`
}

// NewSessionViews hands each event to the view that was current when it
// happened: the last view started at or before it.
func NewSessionViews(views []*TimelineEvent, events []*TimelineEvent) ([]*SessionView, []*TimelineEvent) {
	sortTimeline(views)
	sortTimeline(events)

	sessionViews := make([]*SessionView, 0, len(views))
	for _, view := range views {
		sessionViews = append(sessionViews, &SessionView{Timestamp: view.Timestamp, Route: view.Route, ViewEvent: *view.View, Events: []*TimelineEvent{}})
	}

	leading := []*TimelineEvent{}
	current := -1
	for _, event := range events {
		for current+1 < len(sessionViews) && !sessionViews[current+1].Timestamp.After(event.Timestamp) {
			current++
		}
		if current < 0 {
			leading = append(leading, event)
			continue
		}
		sessionViews[current].Events = append(sessionViews[current].Events, event)
	}
	return sessionViews, leading
}

// Observe widens the session's bounds to cover an event from start to end.
func (session *GettableSession) Observe(start time.Time, end time.Time) {
	if session.StartedAt.IsZero() || start.Before(session.StartedAt) {
		session.StartedAt = start
	}
	if end.After(session.EndedAt) {
		session.EndedAt = end
	}
}
