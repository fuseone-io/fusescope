package impltracedetail

import (
	"context"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"go.opentelemetry.io/otel/metric"
)

// formattedSpansLogThreshold is the number of formatted gen_ai spans in one waterfall response above which
// the response is logged, to size the memory the formatted copies of the messages take.
const formattedSpansLogThreshold = 200

type module struct {
	store    spantypes.TraceStore
	engine   *EngineReader
	settings factory.ScopedProviderSettings
	config   tracedetail.Config
	metrics  *moduleMetrics
}

// NewModule reads trace detail from traceStore, and the summary and waterfall of the orgs engine
// serves from fusescope-engine; a nil engine serves none.
func NewModule(traceStore spantypes.TraceStore, engine *EngineReader, providerSettings factory.ProviderSettings, cfg tracedetail.Config) *module {
	scopedProviderSettings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/tracedetail/impltracedetail")

	metrics, err := newModuleMetrics(scopedProviderSettings.Meter())
	if err != nil {
		panic(err)
	}

	m := &module{
		config:   cfg,
		store:    traceStore,
		engine:   engine,
		settings: scopedProviderSettings,
		metrics:  metrics,
	}

	m.metrics.waterfallSpanLimit.Record(context.Background(), int64(cfg.Waterfall.MaxLimitToSelectAllSpans), metric.WithAttributes(attrResponseType.String(attrResponseTypeWindowed)))
	m.metrics.flamegraphSpanLimit.Record(context.Background(), int64(cfg.Flamegraph.SelectAllSpansLimit), metric.WithAttributes(attrResponseType.String(attrResponseTypeSampled)))

	return m
}

func (m *module) GetTraceSummary(ctx context.Context, orgID valuer.UUID, traceID string) (*spantypes.TraceStats, []string, error) {
	if m.engine.servesOrg(orgID) {
		return m.engine.stats(ctx, orgID, traceID)
	}
	bounds, err := m.store.GetTraceBounds(ctx, traceID)
	if err != nil {
		return nil, nil, err
	}
	stats, err := m.store.GetTraceStats(ctx, orgID, traceID, bounds)
	if err != nil {
		return nil, nil, err
	}
	if stats.TotalSpans == 0 {
		return nil, nil, spantypes.ErrTraceNotFound
	}
	return stats, nil, nil
}

// GetWaterfallV4 is the OOM-safe V4 waterfall.
// For large traces (NumSpans > effectiveLimit) it uses a two-step fetch:
// minimal fields for all spans to build the tree, then full fields for the
// visible window only. Aggregations are not returned.
func (m *module) GetWaterfallV4(ctx context.Context, orgID valuer.UUID, traceID string, selectedSpanID string, uncollapsedSpans []string) (*spantypes.GettableWaterfallTrace, []string, error) {
	var (
		trace    *spantypes.GettableWaterfallTrace
		warnings []string
		err      error
	)
	if m.engine.servesOrg(orgID) {
		trace, warnings, err = m.getEngineWaterfall(ctx, orgID, traceID, selectedSpanID, uncollapsedSpans)
	} else {
		trace, err = m.getWaterfall(ctx, orgID, traceID, selectedSpanID, uncollapsedSpans)
	}
	if err != nil {
		return nil, nil, err
	}
	if trace.FormattedSpans > formattedSpansLogThreshold {
		m.settings.Logger().WarnContext(ctx, "waterfall response carries many formatted gen_ai spans", slog.String("trace_id", traceID), slog.Int("formatted_spans", trace.FormattedSpans), slog.Int("spans", len(trace.Spans)), slog.Bool("windowed", trace.HasMore))
	}
	return trace, warnings, nil
}

func (m *module) getWaterfall(ctx context.Context, orgID valuer.UUID, traceID string, selectedSpanID string, uncollapsedSpans []string) (*spantypes.GettableWaterfallTrace, error) {
	bounds, err := m.store.GetTraceBounds(ctx, traceID)
	if err != nil {
		return nil, err
	}
	if m.windowed(ctx, bounds.NumSpans) {
		return m.getWindowedWaterfall(ctx, orgID, traceID, selectedSpanID, uncollapsedSpans, bounds.Start, bounds.End)
	}
	return m.getFullWaterfall(ctx, orgID, traceID, bounds)
}

// windowed tells whether a waterfall of numSpans returns only a window, and counts it if so.
func (m *module) windowed(ctx context.Context, numSpans uint64) bool {
	if numSpans <= uint64(m.config.Waterfall.MaxLimitToSelectAllSpans) {
		return false
	}
	attrs := metric.WithAttributes(attrResponseType.String(attrResponseTypeWindowed))
	m.metrics.waterfallRequestCount.Add(ctx, 1, attrs)
	m.metrics.waterfallSpanCount.Add(ctx, int64(numSpans), attrs)
	return true
}

// getEngineWaterfall reads the tree with a minimal lookup, then in full every span or, past the
// limit, only the window's.
func (m *module) getEngineWaterfall(ctx context.Context, orgID valuer.UUID, traceID, selectedSpanID string, uncollapsedSpans []string) (*spantypes.GettableWaterfallTrace, []string, error) {
	minimalSpans, warnings, err := m.engine.minimalSpans(ctx, orgID, traceID)
	if err != nil {
		return nil, nil, err
	}
	if len(minimalSpans) == 0 {
		return nil, nil, spantypes.ErrTraceNotFound
	}
	if !m.windowed(ctx, uint64(len(minimalSpans))) {
		spans, more, err := m.engine.fullSpans(ctx, orgID, traceID, nil)
		if err != nil {
			return nil, nil, err
		}
		if len(spans) == 0 {
			return nil, nil, spantypes.ErrTraceNotFound
		}
		return fullWaterfall(traceID, spans), appendNew(warnings, more...), nil
	}

	waterfallTrace, selectedSpans, uncollapsedSpans := m.waterfallWindow(traceID, minimalSpans, selectedSpanID, uncollapsedSpans)
	if ids := windowSpanIDs(selectedSpans); len(ids) > 0 {
		fullSpans, more, err := m.engine.fullSpans(ctx, orgID, traceID, ids)
		if err != nil {
			return nil, nil, err
		}
		warnings = appendNew(warnings, more...)
		spantypes.EnrichSelectedSpans(selectedSpans, fullSpans)
	}
	return spantypes.NewGettableWaterfallTrace(waterfallTrace, selectedSpans, uncollapsedSpans, false), warnings, nil
}

func (m *module) getFullWaterfall(ctx context.Context, orgID valuer.UUID, traceID string, bounds *spantypes.TraceBounds) (*spantypes.GettableWaterfallTrace, error) {
	spanItems, err := m.store.GetTraceSpans(ctx, orgID, traceID, bounds)
	if err != nil {
		return nil, err
	}

	if len(spanItems) == 0 {
		return nil, spantypes.ErrTraceNotFound
	}
	return fullWaterfall(traceID, spanItems), nil
}

func fullWaterfall(traceID string, spanItems []spantypes.StorableSpan) *spantypes.GettableWaterfallTrace {
	nodes := make([]*spantypes.WaterfallSpan, len(spanItems))
	for i := range spanItems {
		nodes[i] = spanItems[i].ToWaterfallSpan(traceID)
	}
	waterfallTrace := spantypes.NewWaterfallTraceFromSpans(nodes)
	selectedSpans := waterfallTrace.GetAllSpans()

	return spantypes.NewGettableWaterfallTrace(waterfallTrace, selectedSpans, nil, true)
}

func (m *module) GetTraceAggregations(ctx context.Context, traceID string, req *spantypes.PostableTraceAggregations) (*spantypes.GettableTraceAggregations, error) {
	bounds, err := m.store.GetTraceBounds(ctx, traceID)
	if err != nil {
		return nil, err
	}

	traceDurationNs := uint64(bounds.End.UnixNano()) - uint64(bounds.Start.UnixNano())

	results := make([]spantypes.SpanAggregationResult, 0, len(req.Aggregations))
	for _, agg := range req.Aggregations {
		result := spantypes.SpanAggregationResult{Field: agg.Field, Aggregation: agg.Aggregation}
		switch agg.Aggregation {
		case spantypes.SpanAggregationSpanCount:
			result.Value, err = m.store.GetSpanCountByField(ctx, traceID, bounds, agg.Field)
			if err != nil {
				return nil, err
			}
		case spantypes.SpanAggregationDuration:
			durationNs, err2 := m.store.GetSpanDurationByField(ctx, traceID, bounds, agg.Field)
			if err2 != nil {
				return nil, err2
			}
			result.Value = make(map[string]uint64, len(durationNs))
			for k, ns := range durationNs {
				result.Value[k] = ns / 1_000_000
			}
		case spantypes.SpanAggregationExecutionTimePercentage:
			durationNs, err2 := m.store.GetSpanDurationByField(ctx, traceID, bounds, agg.Field)
			if err2 != nil {
				return nil, err2
			}
			result.Value = make(map[string]uint64, len(durationNs))
			if traceDurationNs > 0 {
				for k, ns := range durationNs {
					result.Value[k] = ns * 100 / traceDurationNs
				}
			}
		}
		results = append(results, result)
	}
	return &spantypes.GettableTraceAggregations{Aggregations: results}, nil
}

func (m *module) GetFlamegraph(ctx context.Context, traceID string, selectedSpanID string, selectFields []telemetrytypes.TelemetryFieldKey) (*spantypes.GettableFlamegraphTrace, error) {
	bounds, err := m.store.GetTraceBounds(ctx, traceID)
	if err != nil {
		return nil, err
	}
	if bounds.NumSpans <= uint64(m.config.Flamegraph.SelectAllSpansLimit) {
		return m.getFullFlamegraph(ctx, traceID, bounds, selectFields)
	}
	m.metrics.flamegraphRequestCount.Add(ctx, 1, metric.WithAttributes(attrResponseType.String(attrResponseTypeSampled)))
	return m.getWindowedFlamegraph(ctx, traceID, selectedSpanID, bounds, selectFields)
}

// getWindowedWaterfall builds the waterfall tree with minimal data and then returns only a window of full spans.
func (m *module) getWindowedWaterfall(ctx context.Context, orgID valuer.UUID, traceID, selectedSpanID string, uncollapsedSpans []string, start, end time.Time) (*spantypes.GettableWaterfallTrace, error) {
	// Step 1: minimal fetch → build full tree → select visible window
	minimalSpans, err := m.store.GetMinimalSpans(ctx, traceID, start, end)
	if err != nil {
		return nil, err
	}
	if len(minimalSpans) == 0 {
		return nil, spantypes.ErrTraceNotFound
	}

	waterfallTrace, selectedSpans, uncollapsedSpans := m.waterfallWindow(traceID, minimalSpans, selectedSpanID, uncollapsedSpans)

	// Step 2: full fetch for the selected window only
	fullSpans, err := m.store.GetTraceSpansByIDs(ctx, orgID, traceID, start, end, windowSpanIDs(selectedSpans))
	if err != nil {
		return nil, err
	}

	spantypes.EnrichSelectedSpans(selectedSpans, fullSpans)

	return spantypes.NewGettableWaterfallTrace(
		waterfallTrace, selectedSpans, uncollapsedSpans, false,
	), nil
}

// waterfallWindow builds the tree from minimal spans and selects the visible window.
func (m *module) waterfallWindow(traceID string, minimalSpans []spantypes.MinimalSpan, selectedSpanID string, uncollapsedSpans []string) (*spantypes.WaterfallTrace, []*spantypes.WaterfallSpan, []string) {
	nodes := make([]*spantypes.WaterfallSpan, len(minimalSpans))
	for i := range minimalSpans {
		nodes[i] = minimalSpans[i].ToWaterfallSpan(traceID)
	}
	waterfallTrace := spantypes.NewWaterfallTraceFromSpans(nodes)
	selectedSpans, uncollapsedSpans := waterfallTrace.GetSelectedSpans(
		uncollapsedSpans,
		selectedSpanID,
		m.config.Waterfall.SpanPageSize,
		m.config.Waterfall.MaxDepthToAutoExpand,
	)
	return waterfallTrace, selectedSpans, uncollapsedSpans
}

func windowSpanIDs(selectedSpans []*spantypes.WaterfallSpan) []string {
	spanIDs := make([]string, len(selectedSpans))
	for i, s := range selectedSpans {
		spanIDs[i] = s.SpanID
	}
	return spanIDs
}

func (m *module) GetThread(ctx context.Context, orgID valuer.UUID, traceID string, query *spantypes.ThreadQuery) (*spantypes.GettableTraceThread, error) {
	bounds, err := m.store.GetTraceBounds(ctx, traceID)
	if err != nil {
		return nil, err
	}

	// One extra row per side signals a next/prev page; NewGettableTraceThread trims the response back to query.Limit.
	page := spantypes.ThreadPage{Limit: query.Limit + 1}
	switch {
	case query.SpanID != "":
		// Window centred on the span: fetch both directions, NewGettableTraceThread splits the limit.
		anchor, err := m.store.GetThreadCursor(ctx, traceID, bounds, query.SpanID)
		if err != nil {
			return nil, err
		}
		before, err := m.store.GetThreadSpans(ctx, orgID, traceID, bounds, spantypes.ThreadPage{Cursor: anchor, From: spantypes.ThreadBefore, Limit: page.Limit})
		if err != nil {
			return nil, err
		}
		// ThreadAt keeps the anchor when it carries messages; otherwise the filter drops it.
		after, err := m.store.GetThreadSpans(ctx, orgID, traceID, bounds, spantypes.ThreadPage{Cursor: anchor, From: spantypes.ThreadAt, Limit: page.Limit})
		if err != nil {
			return nil, err
		}
		return spantypes.NewGettableTraceThread(traceID, query, before, after), nil
	case query.Before != nil:
		page.Cursor, page.From = query.Before, spantypes.ThreadBefore
		before, err := m.store.GetThreadSpans(ctx, orgID, traceID, bounds, page)
		if err != nil {
			return nil, err
		}
		return spantypes.NewGettableTraceThread(traceID, query, before, nil), nil
	default:
		// nil for the first page.
		page.Cursor = query.After
		after, err := m.store.GetThreadSpans(ctx, orgID, traceID, bounds, page)
		if err != nil {
			return nil, err
		}
		return spantypes.NewGettableTraceThread(traceID, query, nil, after), nil
	}
}

func (m *module) getFullFlamegraph(ctx context.Context, traceID string, bounds *spantypes.TraceBounds, selectFields []telemetrytypes.TelemetryFieldKey) (*spantypes.GettableFlamegraphTrace, error) {
	fullSpans, err := m.store.GetFlamegraphSpans(ctx, traceID, bounds.Start, bounds.End, nil)
	if err != nil {
		return nil, err
	}
	if len(fullSpans) == 0 {
		return nil, spantypes.ErrTraceNotFound
	}
	flamegraphTrace := spantypes.NewFlamegraphTraceFromStorable(fullSpans, selectFields)
	start, end := flamegraphTrace.TimeRange()
	return spantypes.NewGettableFlamegraphTrace(flamegraphTrace.GetAllLevels(), start, end, false), nil
}

// getWindowedFlamegraph returns a window of a max levels and max sampled spans per level around the selected span.
func (m *module) getWindowedFlamegraph(ctx context.Context, traceID, selectedSpanID string, bounds *spantypes.TraceBounds, selectFields []telemetrytypes.TelemetryFieldKey) (*spantypes.GettableFlamegraphTrace, error) {
	minimalSpans, err := m.store.GetMinimalSpans(ctx, traceID, bounds.Start, bounds.End)
	if err != nil {
		return nil, err
	}
	if len(minimalSpans) == 0 {
		return nil, spantypes.ErrTraceNotFound
	}

	flamegraphTrace := spantypes.NewFlamegraphTraceFromMinimal(minimalSpans)
	minimalSpans = nil //nolint:ineffassign,wastedassign // release backing array before further db calls

	start, end := flamegraphTrace.TimeRange()

	cfg := m.config.Flamegraph
	selectedSpans := flamegraphTrace.GetSelectedLevels(selectedSpanID, cfg.MaxSelectedLevels, cfg.MaxSpansPerLevel, cfg.SamplingTopLatencySpansCount, cfg.SamplingBucketCount)
	if len(selectedSpans) == 0 {
		return nil, spantypes.ErrTraceNotFound
	}

	fullSpans, err := m.store.GetFlamegraphSpans(ctx, traceID, bounds.Start, bounds.End, spantypes.FlamegraphWindowSpanIDs(selectedSpans))
	if err != nil {
		return nil, err
	}

	enrichedSpans := flamegraphTrace.EnrichSelectedSpans(selectedSpans, fullSpans, selectFields)
	return spantypes.NewGettableFlamegraphTrace(enrichedSpans, start, end, true), nil
}
