package implrumapplication

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// queryScope checks the application belongs to the organization and that
// its promoted columns exist, then scopes queries to it.
func (module *module) queryScope(ctx context.Context, orgID valuer.UUID, id valuer.UUID, params rumtypes.QueryableRange) (telemetryScope, error) {
	queryRange, err := rumtypes.NewQueryRange(params, time.Now().UTC())
	if err != nil {
		return telemetryScope{}, err
	}
	application, err := module.Get(ctx, orgID, id)
	if err != nil {
		return telemetryScope{}, err
	}
	if err := module.PromoteFields(ctx); err != nil {
		return telemetryScope{}, err
	}
	scope := newTelemetryScope(id.StringValue(), queryRange)
	scope.platform = application.Platform
	return scope, nil
}

func newSpanTimelineEvent(row *sessionSpanRow) *rumtypes.TimelineEvent {
	event := &rumtypes.TimelineEvent{Timestamp: row.timestamp.UTC(), Route: row.route}
	if row.name == rumtypes.SpanNameView {
		event.Kind = rumtypes.TimelineEventKindView
		event.View = &rumtypes.ViewEvent{SpanID: row.spanID, Path: row.path, LoadingType: rumtypes.NewLoadingType(row.loadingType), DurationMs: nanosToMillis(float64(row.durationNs))}
		return event
	}

	event.Kind = rumtypes.TimelineEventKindRequest
	event.Request = &rumtypes.RequestEvent{
		RequestTemplate: rumtypes.NewRequestTemplate(row.method, row.url),
		SpanID:          row.spanID,
		TraceID:         row.traceID,
		URL:             row.url,
		StatusCode:      int(row.statusCode),
		DurationMs:      nanosToMillis(float64(row.durationNs)),
		Failed:          row.statusCode >= 400 || row.hasError,
	}
	return event
}

func newLogTimelineEvent(row *sessionLogRow) *rumtypes.TimelineEvent {
	event := &rumtypes.TimelineEvent{Timestamp: time.Unix(0, int64(row.timestamp)).UTC(), Route: row.route}
	switch row.event {
	case rumtypes.EventNameException:
		event.Kind = rumtypes.TimelineEventKindError
		event.Error = &rumtypes.ErrorEventInfo{Fingerprint: rumtypes.NewErrorFingerprint(row.errorType, row.message, row.stacktrace), Type: row.errorType, Message: row.message, Source: row.source}
	case rumtypes.EventNameWebVital:
		name, ok := rumtypes.NewVitalName(row.vitalName)
		if !ok {
			return nil
		}
		event.Kind = rumtypes.TimelineEventKindVital
		event.Vital = &rumtypes.VitalEvent{Name: name, Value: row.vitalValue, Rating: rumtypes.VitalRating{String: valuer.NewString(row.vitalRating)}}
	case rumtypes.EventNameClick:
		event.Kind = rumtypes.TimelineEventKindClick
		event.Action = &rumtypes.ActionEvent{Type: row.actionType, Target: row.target}
	default:
		event.Kind = rumtypes.TimelineEventKindAction
		event.Action = &rumtypes.ActionEvent{Type: row.actionType, Name: row.actionName, Target: row.target}
	}
	return event
}

// markBackends sets whether each request's trace reached a backend.
func (module *module) markBackends(ctx context.Context, events []*rumtypes.TimelineEvent, start time.Time, end time.Time) error {
	traceIDs := []string{}
	for _, event := range events {
		if event != nil && event.Request != nil && event.Request.TraceID != "" {
			traceIDs = append(traceIDs, event.Request.TraceID)
		}
	}

	backends, err := module.telemetry.Backends(ctx, traceIDs, start, end)
	if err != nil {
		return err
	}
	for _, event := range events {
		if event == nil || event.Request == nil {
			continue
		}
		if backend, ok := backends[event.Request.TraceID]; ok {
			event.Request.HasBackend, event.Request.BackendService = true, backend.service
		}
	}
	return nil
}

func nanosToMillis(nanos float64) float64 {
	return nanos / float64(time.Millisecond)
}

func resourceOf(resources map[string]*resourceInfo, fingerprint string) *resourceInfo {
	if info, ok := resources[fingerprint]; ok {
		return info
	}
	return &resourceInfo{}
}
