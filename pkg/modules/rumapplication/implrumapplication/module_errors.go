package implrumapplication

import (
	"context"
	"slices"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const maxErrorGroups = 200

var ErrCodeErrorGroupNotFound = errors.MustNewCode("rum_error_group_not_found")

// errorFingerprints maps the error keys of the history window to fingerprints.
type errorFingerprints struct {
	order     []string
	keys      map[string][]uint64
	first     map[string]*errorKeyRow
	resources map[string]*resourceInfo
}

func (module *module) ListErrorGroups(ctx context.Context, orgID valuer.UUID, id valuer.UUID, params *rumtypes.ListErrorGroupsParams) (*rumtypes.GettableErrorGroups, error) {
	page, err := rumtypes.NewPage(params.Limit, params.Offset, maxErrorGroups)
	if err != nil {
		return nil, err
	}
	scope, err := module.queryScope(ctx, orgID, id, params.QueryableRange)
	if err != nil {
		return nil, err
	}

	fingerprints, err := module.errorFingerprints(ctx, scope)
	if err != nil {
		return nil, err
	}
	groups, err := module.errorGroups(ctx, scope, fingerprints, fingerprints.order)
	if err != nil {
		return nil, err
	}

	gettable := &rumtypes.GettableErrorGroups{Total: int64(len(groups)), Groups: []*rumtypes.ErrorGroup{}}
	for _, group := range groups {
		gettable.Events += group.Events
	}
	if page.Offset < len(groups) {
		gettable.Groups = groups[page.Offset:min(page.Offset+page.Limit, len(groups))]
	}
	return gettable, nil
}

func (module *module) GetErrorGroup(ctx context.Context, orgID valuer.UUID, id valuer.UUID, fingerprint string, params *rumtypes.GetErrorGroupParams) (*rumtypes.GettableErrorGroup, error) {
	if !rumtypes.IsErrorFingerprint(fingerprint) {
		return nil, errors.NewInvalidInputf(rumtypes.ErrCodeQueryInvalidInput, "fingerprint must be %d lowercase hex characters", rumtypes.ErrorFingerprintLength)
	}
	scope, err := module.queryScope(ctx, orgID, id, params.QueryableRange)
	if err != nil {
		return nil, err
	}

	fingerprints, err := module.errorFingerprints(ctx, scope)
	if err != nil {
		return nil, err
	}
	groups, err := module.errorGroups(ctx, scope, fingerprints, []string{fingerprint})
	if err != nil {
		return nil, err
	}
	if len(groups) == 0 {
		return nil, errors.Newf(errors.TypeNotFound, ErrCodeErrorGroupNotFound, "no error group %s in the range", fingerprint)
	}

	gettable := &rumtypes.GettableErrorGroup{ErrorGroup: *groups[0]}
	keys := fingerprints.keys[fingerprint]
	if err := module.addErrorEvents(ctx, id, scope, keys, fingerprints.resources, params.EventID, gettable); err != nil {
		return nil, err
	}
	if err := module.addAffectedSessions(ctx, scope, keys, fingerprints.resources, gettable); err != nil {
		return nil, err
	}
	return gettable, nil
}

// errorFingerprints reads the keys of the history window: it ignores the
// release filter, so first seen spans releases.
func (module *module) errorFingerprints(ctx context.Context, scope telemetryScope) (*errorFingerprints, error) {
	history := scope
	history.start, history.release = scope.end.Add(-rumtypes.ErrorHistoryWindow), ""

	rows, err := module.telemetry.ErrorKeys(ctx, history)
	if err != nil {
		return nil, err
	}
	resources, err := module.telemetry.Resources(ctx, logSignal, history)
	if err != nil {
		return nil, err
	}

	fingerprints := &errorFingerprints{keys: map[string][]uint64{}, first: map[string]*errorKeyRow{}, resources: resources}
	for _, row := range rows {
		fingerprint := rumtypes.NewErrorFingerprint(row.exceptionType, row.normalizedMessage, row.frameLine)
		if _, ok := fingerprints.keys[fingerprint]; !ok {
			fingerprints.order = append(fingerprints.order, fingerprint)
		}
		fingerprints.keys[fingerprint] = append(fingerprints.keys[fingerprint], row.key)
		if first, ok := fingerprints.first[fingerprint]; !ok || row.firstSeen < first.firstSeen {
			fingerprints.first[fingerprint] = row
		}
	}
	return fingerprints, nil
}

// errorGroups aggregates the range's events of the given fingerprints, by
// event count.
func (module *module) errorGroups(ctx context.Context, scope telemetryScope, fingerprints *errorFingerprints, selected []string) ([]*rumtypes.ErrorGroup, error) {
	keys, indexes := []uint64{}, []uint16{}
	for i, fingerprint := range selected {
		for _, key := range fingerprints.keys[fingerprint] {
			keys, indexes = append(keys, key), append(indexes, uint16(i+1))
		}
	}

	step := time.Hour
	rows, err := module.telemetry.ErrorGroups(ctx, scope, keys, indexes, step)
	if err != nil {
		return nil, err
	}

	releasesInRange := map[string]time.Time{}
	for _, row := range rows {
		for _, release := range row.releases {
			releasesInRange[release] = time.Time{}
		}
	}
	for _, info := range fingerprints.resources {
		if first, ok := releasesInRange[info.release]; ok && (first.IsZero() || info.firstSeen.Before(first)) {
			releasesInRange[info.release] = info.firstSeen
		}
	}
	newest := rumtypes.NewestRelease(releasesInRange)

	groups := make([]*rumtypes.ErrorGroup, 0, len(rows))
	for _, row := range rows {
		fingerprint := selected[row.index-1]
		groups = append(groups, newErrorGroup(fingerprint, fingerprints, row, newest, scope, step))
	}
	slices.SortStableFunc(groups, func(a, b *rumtypes.ErrorGroup) int {
		if a.Events != b.Events {
			return int(b.Events - a.Events)
		}
		return b.LastSeenAt.Compare(a.LastSeenAt)
	})
	return groups, nil
}

func newErrorGroup(fingerprint string, fingerprints *errorFingerprints, row *errorGroupRow, newest string, scope telemetryScope, step time.Duration) *rumtypes.ErrorGroup {
	first := fingerprints.first[fingerprint]
	firstRelease := resourceOf(fingerprints.resources, first.firstFingerprint).release

	var topFrame *rumtypes.StackFrame
	if frames := rumtypes.ParseStackFrames(row.frameLine); len(frames) > 0 {
		topFrame = &frames[0]
	}

	counts := make(map[int64]int64, len(row.sparkline))
	for bucket, count := range row.sparkline {
		counts[int64(bucket)] = int64(count)
	}
	slices.Sort(row.releases)

	return &rumtypes.ErrorGroup{
		Fingerprint:       fingerprint,
		Type:              first.exceptionType,
		Message:           row.message,
		NormalizedMessage: first.normalizedMessage,
		TopFrame:          topFrame,
		Source:            row.source,
		Route:             row.route,
		Events:            int64(row.events),
		Sessions:          int64(row.sessions),
		FirstSeenAt:       time.Unix(0, int64(min(first.firstSeen, row.firstSeen))).UTC(),
		FirstSeenRelease:  firstRelease,
		LastSeenAt:        time.Unix(0, int64(row.lastSeen)).UTC(),
		LastSeenRelease:   row.lastRelease,
		Releases:          row.releases,
		NewInRelease:      newest != "" && firstRelease == newest,
		Sparkline:         rumtypes.NewSparkline(scope.start, scope.end, step, counts),
	}
}

func (module *module) addErrorEvents(ctx context.Context, applicationID valuer.UUID, scope telemetryScope, keys []uint64, resources map[string]*resourceInfo, eventID string, gettable *rumtypes.GettableErrorGroup) error {
	rows, err := module.telemetry.ErrorEvents(ctx, scope, keys)
	if err != nil {
		return err
	}

	gettable.LatestEvents = make([]*rumtypes.ErrorEvent, 0, len(rows))
	var selected *rumtypes.ErrorEvent
	for _, row := range rows {
		info := resourceOf(resources, row.fingerprint)
		frames, symbolicated, err := module.symbolicator.Symbolicate(ctx, applicationID, info.release, rumtypes.ParseStackFrames(row.stacktrace))
		if err != nil {
			return err
		}
		event := &rumtypes.ErrorEvent{
			ID: row.id, Timestamp: time.Unix(0, int64(row.timestamp)).UTC(), SessionID: row.sessionID, Route: row.route, Release: info.release, Client: info.client,
			Type: row.errorType, Message: row.message, Source: row.source, Stacktrace: row.stacktrace, Frames: frames, Symbolicated: symbolicated,
		}
		gettable.LatestEvents = append(gettable.LatestEvents, event)
		if selected == nil || event.ID == eventID {
			selected = event
		}
	}

	gettable.Breadcrumbs = []*rumtypes.TimelineEvent{}
	if selected == nil {
		return nil
	}
	gettable.SelectedEventID = selected.ID
	if selected.SessionID == "" {
		return nil
	}
	return module.addBreadcrumbs(ctx, scope, selected, gettable)
}

func (module *module) addBreadcrumbs(ctx context.Context, scope telemetryScope, selected *rumtypes.ErrorEvent, gettable *rumtypes.GettableErrorGroup) error {
	window := scope
	window.start, window.end = selected.Timestamp.Add(-rumtypes.BreadcrumbWindow), selected.Timestamp

	spans, err := module.telemetry.SessionSpans(ctx, window, selected.SessionID)
	if err != nil {
		return err
	}
	logs, err := module.telemetry.SessionLogs(ctx, window, selected.SessionID)
	if err != nil {
		return err
	}

	for _, row := range spans {
		gettable.Breadcrumbs = append(gettable.Breadcrumbs, newSpanTimelineEvent(row))
	}
	for _, row := range logs {
		if row.event == rumtypes.EventNameClick || row.event == rumtypes.EventNameCustomAction {
			gettable.Breadcrumbs = append(gettable.Breadcrumbs, newLogTimelineEvent(row))
		}
	}
	slices.SortStableFunc(gettable.Breadcrumbs, func(a, b *rumtypes.TimelineEvent) int { return a.Timestamp.Compare(b.Timestamp) })

	gettable.LinkedRequest = rumtypes.NearestFailedRequest(gettable.Breadcrumbs, selected.Timestamp)
	return module.markBackends(ctx, gettable.Breadcrumbs, window.start, window.end)
}

func (module *module) addAffectedSessions(ctx context.Context, scope telemetryScope, keys []uint64, resources map[string]*resourceInfo, gettable *rumtypes.GettableErrorGroup) error {
	rows, err := module.telemetry.AffectedSessions(ctx, scope, keys)
	if err != nil {
		return err
	}
	sessionIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		sessionIDs = append(sessionIDs, row.sessionID)
	}
	overviews, err := module.telemetry.SessionOverviews(ctx, scope, sessionIDs)
	if err != nil {
		return err
	}

	gettable.AffectedSessions = make([]*rumtypes.AffectedSession, 0, len(rows))
	for _, row := range rows {
		info, overview := resourceOf(resources, row.fingerprint), overviews[row.sessionID]
		lastError := time.Unix(0, int64(row.lastError)).UTC()
		startedAt := overview.startedAt.UTC()
		if overview.startedAt.IsZero() || lastError.Before(startedAt) {
			startedAt = lastError
		}
		gettable.AffectedSessions = append(gettable.AffectedSessions, &rumtypes.AffectedSession{
			SessionID: row.sessionID, StartedAt: startedAt, LastErrorAt: lastError, Release: info.release, Client: info.client, Views: int64(overview.views), Errors: int64(row.errors),
		})
	}
	return nil
}
