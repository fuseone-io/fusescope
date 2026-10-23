package implrumapplication

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	defaultViewRoutes = 100
	maxViewRoutes     = 500
	maxRouteLength    = 512
)

var ErrCodeViewNotFound = errors.MustNewCode("rum_view_not_found")

func (module *module) ListViews(ctx context.Context, orgID valuer.UUID, id valuer.UUID, params *rumtypes.ListViewsParams) (*rumtypes.GettableViews, error) {
	limit := params.Limit
	if limit == 0 {
		limit = defaultViewRoutes
	}
	page, err := rumtypes.NewPage(limit, 0, maxViewRoutes)
	if err != nil {
		return nil, err
	}
	scope, err := module.queryScope(ctx, orgID, id, params.QueryableRange)
	if err != nil {
		return nil, err
	}

	routes, err := module.telemetry.ViewRoutes(ctx, scope, "", page.Limit)
	if err != nil {
		return nil, err
	}
	events, err := module.telemetry.ViewEvents(ctx, scope, "", 0)
	if err != nil {
		return nil, err
	}
	templates, err := module.telemetry.RequestTemplates(ctx, scope, "")
	if err != nil {
		return nil, err
	}

	vitals, errorCounts := map[string]map[rumtypes.VitalName]*rumtypes.VitalSummary{}, map[string]int64{}
	for _, row := range events {
		if row.event == rumtypes.EventNameException {
			errorCounts[row.route] += int64(row.samples)
			continue
		}
		if name, ok := rumtypes.NewVitalName(row.vital); ok {
			if vitals[row.route] == nil {
				vitals[row.route] = map[rumtypes.VitalName]*rumtypes.VitalSummary{}
			}
			vitals[row.route][name] = newVitalSummary(name, row)
		}
	}
	slowest := map[string]*rumtypes.RequestTemplateLatency{}
	for _, row := range templates {
		slowest[row.route] = &rumtypes.RequestTemplateLatency{RequestTemplate: row.template, P75Ms: nanosToMillis(row.p75Ns), Calls: int64(row.calls)}
	}

	sessions, err := module.telemetry.SessionCount(ctx, scope)
	if err != nil {
		return nil, err
	}

	gettable := &rumtypes.GettableViews{Routes: make([]*rumtypes.ViewRoute, 0, len(routes)), Sessions: sessions}
	for _, row := range routes {
		gettable.Routes = append(gettable.Routes, &rumtypes.ViewRoute{
			Route:              row.route,
			ViewCounts:         row.counts,
			MedianTimeOnViewMs: nanosToMillis(row.medianNs),
			Errors:             errorCounts[row.route],
			LCP:                vitals[row.route][rumtypes.VitalNameLCP],
			INP:                vitals[row.route][rumtypes.VitalNameINP],
			CLS:                vitals[row.route][rumtypes.VitalNameCLS],
			SlowestRequest:     slowest[row.route],
		})
	}
	return gettable, nil
}

func (module *module) GetView(ctx context.Context, orgID valuer.UUID, id valuer.UUID, route string, params *rumtypes.GetViewParams) (*rumtypes.GettableView, error) {
	if route == "" || len(route) > maxRouteLength {
		return nil, errors.NewInvalidInputf(rumtypes.ErrCodeQueryInvalidInput, "route must be 1 to %d characters", maxRouteLength)
	}
	scope, err := module.queryScope(ctx, orgID, id, params.QueryableRange)
	if err != nil {
		return nil, err
	}

	gettable := &rumtypes.GettableView{Route: route, ExamplePaths: []string{}}
	if err := module.addViewTotals(ctx, scope, gettable); err != nil {
		return nil, err
	}
	if err := module.addViewVitals(ctx, scope, gettable); err != nil {
		return nil, err
	}
	if err := module.addViewRequests(ctx, scope, gettable); err != nil {
		return nil, err
	}

	resources, err := module.telemetry.Resources(ctx, spanSignal, scope)
	if err != nil {
		return nil, err
	}
	if err := module.addViewClients(ctx, scope, resources, gettable); err != nil {
		return nil, err
	}
	if err := module.addViewSessions(ctx, scope, resources, gettable); err != nil {
		return nil, err
	}
	return gettable, nil
}

func (module *module) addViewTotals(ctx context.Context, scope telemetryScope, gettable *rumtypes.GettableView) error {
	rows, err := module.telemetry.ViewRoutes(ctx, scope, gettable.Route, 1)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return errors.Newf(errors.TypeNotFound, ErrCodeViewNotFound, "no views of route %q in the range", gettable.Route)
	}
	gettable.ViewCounts, gettable.MedianTimeOnViewMs, gettable.ExamplePaths = rows[0].counts, nanosToMillis(rows[0].medianNs), rows[0].examplePaths
	return nil
}

func (module *module) addViewVitals(ctx context.Context, scope telemetryScope, gettable *rumtypes.GettableView) error {
	step := rumtypes.NewSeriesStep(scope.end.Sub(scope.start))
	rows, err := module.telemetry.ViewEvents(ctx, scope, gettable.Route, step)
	if err != nil {
		return err
	}

	summaries := map[rumtypes.VitalName]*rumtypes.VitalSummary{}
	points := map[rumtypes.VitalName][]*rumtypes.VitalSeriesPoint{}
	for _, row := range rows {
		if row.event == rumtypes.EventNameException {
			if row.bucket == 0 {
				gettable.Errors += int64(row.samples)
			}
			continue
		}
		name, ok := rumtypes.NewVitalName(row.vital)
		if !ok {
			continue
		}
		if row.bucket == 0 {
			summaries[name] = newVitalSummary(name, row)
			continue
		}
		points[name] = append(points[name], &rumtypes.VitalSeriesPoint{Timestamp: time.Unix(int64(row.bucket), 0).UTC(), P75: row.p75, Samples: int64(row.samples)})
	}

	gettable.Vitals = []*rumtypes.VitalSummary{}
	gettable.Series = &rumtypes.VitalSeries{StepSeconds: int64(step.Seconds()), Vitals: []*rumtypes.VitalSeriesLine{}}
	for _, name := range rumtypes.VitalNames() {
		if summary, ok := summaries[name]; ok {
			gettable.Vitals = append(gettable.Vitals, summary)
		}
		if line, ok := points[name]; ok {
			slices.SortFunc(line, func(a, b *rumtypes.VitalSeriesPoint) int { return a.Timestamp.Compare(b.Timestamp) })
			gettable.Series.Vitals = append(gettable.Series.Vitals, &rumtypes.VitalSeriesLine{Name: name, Points: line})
		}
	}
	return nil
}

func (module *module) addViewRequests(ctx context.Context, scope telemetryScope, gettable *rumtypes.GettableView) error {
	rows, err := module.telemetry.RequestTemplates(ctx, scope, gettable.Route)
	if err != nil {
		return err
	}

	traceIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		traceIDs = append(traceIDs, row.exampleTraceID)
	}
	backends, err := module.telemetry.Backends(ctx, traceIDs, scope.start, scope.end)
	if err != nil {
		return err
	}

	gettable.SlowRequests = make([]*rumtypes.RequestTemplateStats, 0, len(rows))
	for _, row := range rows {
		gettable.SlowRequests = append(gettable.SlowRequests, &rumtypes.RequestTemplateStats{
			RequestTemplate: row.template,
			P75Ms:           nanosToMillis(row.p75Ns),
			Calls:           int64(row.calls),
			Failed:          int64(row.failed),
			ExampleTraceID:  row.exampleTraceID,
			BackendService:  backends[row.exampleTraceID].service,
		})
	}
	return nil
}

// addViewClients adds the releases and the browser and OS breakdowns.
func (module *module) addViewClients(ctx context.Context, scope telemetryScope, resources map[string]*resourceInfo, gettable *rumtypes.GettableView) error {
	rows, err := module.telemetry.ViewFingerprints(ctx, scope, gettable.Route)
	if err != nil {
		return err
	}

	releases := map[string]time.Time{}
	browsers, systems := newBreakdowns(), newBreakdowns()
	for _, row := range rows {
		info := resourceOf(resources, row.fingerprint)
		if first, ok := releases[info.release]; info.release != "" && (!ok || row.firstView.Before(first)) {
			releases[info.release] = row.firstView
		}
		browsers.add(info.client.BrowserLabel(), int64(row.views), int64(row.pageLoads))
		systems.add(info.client.OSLabel(), int64(row.views), int64(row.pageLoads))
	}

	gettable.Releases = []*rumtypes.ReleaseMarker{}
	for release, firstSeen := range releases {
		gettable.Releases = append(gettable.Releases, &rumtypes.ReleaseMarker{Release: release, FirstSeenAt: firstSeen.UTC()})
	}
	slices.SortFunc(gettable.Releases, func(a, b *rumtypes.ReleaseMarker) int { return a.FirstSeenAt.Compare(b.FirstSeenAt) })

	// OS indexes follow the browser ones, so the two label columns never
	// compute the same expression, which ClickHouse would merge.
	clientKeys, browserIndexes, systemIndexes := []uint64{}, []uint16{}, []uint16{}
	seen := map[uint64]bool{}
	for _, info := range resources {
		if seen[info.clientKey] {
			continue
		}
		seen[info.clientKey] = true
		clientKeys = append(clientKeys, info.clientKey)
		browserIndexes = append(browserIndexes, browsers.index(info.client.BrowserLabel()))
		systemIndexes = append(systemIndexes, systems.index(info.client.OSLabel()))
	}
	for i := range systemIndexes {
		systemIndexes[i] += uint16(len(browsers.labels))
	}

	lcp, err := module.telemetry.ClientLCP(ctx, scope, gettable.Route, clientKeys, browserIndexes, systemIndexes)
	if err != nil {
		return err
	}
	for _, row := range lcp {
		if row.byOS {
			systems.setLCP(int(row.os)-len(browsers.labels), row.p75)
		} else {
			browsers.setLCP(int(row.browser), row.p75)
		}
	}

	gettable.Browsers, gettable.OperatingSystems = browsers.list(), systems.list()
	return nil
}

func (module *module) addViewSessions(ctx context.Context, scope telemetryScope, resources map[string]*resourceInfo, gettable *rumtypes.GettableView) error {
	rows, err := module.telemetry.RouteSessions(ctx, scope, gettable.Route)
	if err != nil {
		return err
	}
	sessionIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		sessionIDs = append(sessionIDs, row.sessionID)
	}
	logs, err := module.telemetry.RouteSessionLogs(ctx, scope, gettable.Route, sessionIDs)
	if err != nil {
		return err
	}

	gettable.RecentSessions = make([]*rumtypes.RouteSession, 0, len(rows))
	for _, row := range rows {
		session := &rumtypes.RouteSession{SessionID: row.sessionID, StartedAt: row.startedAt.UTC(), LoadingType: rumtypes.NewLoadingType(row.loadingType), Client: resourceOf(resources, row.fingerprint).client}
		if log, ok := logs[row.sessionID]; ok {
			session.Errors = int64(log.errors)
			if log.lcpSamples > 0 {
				lcp := log.lcp
				session.LCPMs = &lcp
			}
		}
		gettable.RecentSessions = append(gettable.RecentSessions, session)
	}
	return nil
}

func newVitalSummary(name rumtypes.VitalName, row *viewEventRow) *rumtypes.VitalSummary {
	return &rumtypes.VitalSummary{Name: name, Samples: int64(row.samples), P75: row.p75, Good: int64(row.good), NeedsImprovement: int64(row.needsImprovement), Poor: int64(row.poor)}
}

// breakdowns numbers labels from 1 and counts views per label.
type breakdowns struct {
	labels  []string
	entries map[string]*rumtypes.ClientBreakdown
}

func newBreakdowns() *breakdowns {
	return &breakdowns{entries: map[string]*rumtypes.ClientBreakdown{}}
}

func (b *breakdowns) index(label string) uint16 {
	if _, ok := b.entries[label]; !ok {
		b.add(label, 0, 0)
	}
	return uint16(slices.Index(b.labels, label) + 1)
}

func (b *breakdowns) add(label string, views int64, pageLoads int64) {
	entry, ok := b.entries[label]
	if !ok {
		entry = &rumtypes.ClientBreakdown{Name: label}
		b.entries[label] = entry
		b.labels = append(b.labels, label)
	}
	entry.Views += views
	entry.PageLoads += pageLoads
}

func (b *breakdowns) setLCP(index int, p75 float64) {
	if index < 1 || index > len(b.labels) {
		return
	}
	b.entries[b.labels[index-1]].LCPP75Ms = &p75
}

func (b *breakdowns) list() []*rumtypes.ClientBreakdown {
	list := []*rumtypes.ClientBreakdown{}
	for _, label := range b.labels {
		if entry := b.entries[label]; entry.Views > 0 || entry.LCPP75Ms != nil {
			list = append(list, entry)
		}
	}
	slices.SortStableFunc(list, func(a, b *rumtypes.ClientBreakdown) int {
		if a.PageLoads != b.PageLoads {
			return int(b.PageLoads - a.PageLoads)
		}
		if a.Views != b.Views {
			return int(b.Views - a.Views)
		}
		return strings.Compare(a.Name, b.Name)
	})
	return list
}
