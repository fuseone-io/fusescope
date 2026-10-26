package implrumapplication

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	maxSessions        = 200
	maxSessionIDLength = 128
)

var ErrCodeSessionNotFound = errors.MustNewCode("rum_session_not_found")

func (module *module) ListSessions(ctx context.Context, orgID valuer.UUID, id valuer.UUID, params *rumtypes.ListSessionsParams) (*rumtypes.GettableSessions, error) {
	page, err := rumtypes.NewPage(params.Limit, params.Offset, maxSessions)
	if err != nil {
		return nil, err
	}
	filter, err := params.Filter()
	if err != nil {
		return nil, err
	}
	scope, err := module.queryScope(ctx, orgID, id, params.QueryableRange)
	if err != nil {
		return nil, err
	}

	resources, err := module.telemetry.Resources(ctx, spanSignal, scope)
	if err != nil {
		return nil, err
	}
	if filter.Browser != "" {
		scope.clientKeys = []uint64{}
		for _, info := range resources {
			if info.client.MatchesBrowser(filter.Browser) {
				scope.clientKeys = append(scope.clientKeys, info.clientKey)
			}
		}
	}

	rows, err := module.telemetry.Sessions(ctx, scope, filter, page)
	if err != nil {
		return nil, err
	}
	sessionIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		sessionIDs = append(sessionIDs, row.sessionID)
	}
	counts, err := module.telemetry.SessionLogCounts(ctx, scope, sessionIDs)
	if err != nil {
		return nil, err
	}
	attributes, err := module.telemetry.SessionAttributes(ctx, scope, sessionIDs)
	if err != nil {
		return nil, err
	}

	gettable := &rumtypes.GettableSessions{Sessions: make([]*rumtypes.SessionSummary, 0, len(rows))}
	for _, row := range rows {
		gettable.Total = int64(row.total)
		info, count, attribute := resourceOf(resources, row.fingerprint), counts[row.sessionID], attributes[row.sessionID]
		endedAt := time.Unix(0, row.endedNs).UTC()
		gettable.Sessions = append(gettable.Sessions, &rumtypes.SessionSummary{
			SessionID:         row.sessionID,
			PreviousSessionID: attribute.previousID,
			UserID:            attribute.userID,
			StartedAt:         row.startedAt.UTC(),
			EndedAt:           endedAt,
			DurationMs:        nanosToMillis(float64(endedAt.Sub(row.startedAt))),
			Views:             int64(row.views),
			Actions:           int64(count.actions),
			Errors:            int64(count.errors),
			Client:            info.client,
			Release:           info.release,
			Environment:       info.environment,
		})
	}
	return gettable, nil
}

func (module *module) GetSession(ctx context.Context, orgID valuer.UUID, id valuer.UUID, sessionID string, params *rumtypes.GetSessionParams) (*rumtypes.GettableSession, error) {
	if sessionID == "" || len(sessionID) > maxSessionIDLength {
		return nil, errors.NewInvalidInputf(rumtypes.ErrCodeQueryInvalidInput, "session id must be 1 to %d characters", maxSessionIDLength)
	}
	scope, err := module.queryScope(ctx, orgID, id, params.QueryableRange)
	if err != nil {
		return nil, err
	}
	// A session can span releases; a release filter carried over from the
	// list would hide it.
	scope.release = ""

	spans, err := module.telemetry.SessionSpans(ctx, scope, sessionID)
	if err != nil {
		return nil, err
	}
	logs, err := module.telemetry.SessionLogs(ctx, scope, sessionID)
	if err != nil {
		return nil, err
	}
	if len(spans) == 0 && len(logs) == 0 {
		return nil, errors.Newf(errors.TypeNotFound, ErrCodeSessionNotFound, "no session %s in the range", sessionID)
	}

	gettable := &rumtypes.GettableSession{SessionSummary: rumtypes.SessionSummary{SessionID: sessionID}}
	if len(spans) > maxTimelineRows || len(logs) > maxTimelineRows {
		gettable.Truncated = true
		spans, logs = spans[:min(len(spans), maxTimelineRows)], logs[:min(len(logs), maxTimelineRows)]
	}

	views, events, fingerprint := addSessionEvents(gettable, spans, logs)

	if err := module.markBackends(ctx, events, gettable.StartedAt, gettable.EndedAt); err != nil {
		return nil, err
	}

	if fingerprint != "" {
		resources, err := module.telemetry.Resources(ctx, spanSignal, scope)
		if err != nil {
			return nil, err
		}
		info := resourceOf(resources, fingerprint)
		gettable.Client, gettable.Release, gettable.Environment = info.client, info.release, info.environment
	}

	gettable.DurationMs = nanosToMillis(float64(gettable.EndedAt.Sub(gettable.StartedAt)))
	gettable.TimelineViews, gettable.Leading = rumtypes.NewSessionViews(views, events)
	return gettable, nil
}

// addSessionEvents counts the session's spans and logs into gettable and
// returns its views, its other events and a resource fingerprint.
func addSessionEvents(gettable *rumtypes.GettableSession, spans []*sessionSpanRow, logs []*sessionLogRow) ([]*rumtypes.TimelineEvent, []*rumtypes.TimelineEvent, string) {
	views, events := []*rumtypes.TimelineEvent{}, []*rumtypes.TimelineEvent{}
	fingerprint := ""
	for _, row := range spans {
		event := newSpanTimelineEvent(row)
		gettable.Observe(event.Timestamp, event.Timestamp.Add(time.Duration(row.durationNs)))
		fingerprint = row.fingerprint
		gettable.PreviousSessionID = firstNonEmpty(gettable.PreviousSessionID, row.previousID)
		gettable.UserID = firstNonEmpty(gettable.UserID, row.userID)
		if event.View != nil {
			views = append(views, event)
			gettable.Views++
			if event.View.LoadingType == rumtypes.LoadingTypeInitialLoad {
				gettable.PageLoads++
			}
			continue
		}
		gettable.Requests++
		if event.Request.Failed {
			gettable.FailedRequests++
		}
		events = append(events, event)
	}
	for _, row := range logs {
		event := newLogTimelineEvent(row)
		if event == nil {
			continue
		}
		gettable.Observe(event.Timestamp, event.Timestamp)
		switch event.Kind {
		case rumtypes.TimelineEventKindError:
			gettable.Errors++
		case rumtypes.TimelineEventKindVital:
			gettable.Vitals++
		default:
			gettable.Actions++
		}
		events = append(events, event)
	}
	return views, events, fingerprint
}

func firstNonEmpty(current string, candidate string) string {
	if current != "" {
		return current
	}
	return candidate
}
