package impltracedetail

import (
	"context"
	"encoding/json"
	"regexp"
	"slices"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/flighttelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	projectionFull    = "full"
	projectionMinimal = "minimal"
)

// engineTraceID is the trace id the engine holds: ClickHouse stores the same lowercase hex, so any
// other id finds no span there either.
var engineTraceID = regexp.MustCompile(`^[0-9a-f]{32}$`)

// lookupBody is the body of the engine's trace.lookup action.
type lookupBody struct {
	TraceID    string   `json:"trace_id"`
	Projection string   `json:"projection"`
	SpanIDs    []string `json:"span_ids,omitempty"`
}

// EngineReader reads the summary and waterfall of a trace from fusescope-engine, with no time
// bounds, for the orgs its serves admits on the trace_detail route.
type EngineReader struct {
	store   telemetrystore.TelemetryStore
	flagger flagger.Flagger
	serves  func(telemetrystore.Route, valuer.UUID) bool
}

func NewEngineReader(store telemetrystore.TelemetryStore, fl flagger.Flagger, serves func(telemetrystore.Route, valuer.UUID) bool) *EngineReader {
	return &EngineReader{store: store, flagger: fl, serves: serves}
}

func (e *EngineReader) servesOrg(orgID valuer.UUID) bool {
	return e != nil && e.serves != nil && e.serves(telemetrystore.RouteTraceDetail, orgID)
}

// lookup asks for the spans of a trace. An id the engine cannot hold is spantypes.ErrTraceNotFound
// before any call, and a trace past the engine's row cap is ErrCodeTraceTooLarge.
func (e *EngineReader) lookup(ctx context.Context, orgID valuer.UUID, body lookupBody) (telemetrystore.Rows, error) {
	if !engineTraceID.MatchString(body.TraceID) {
		return nil, spantypes.ErrTraceNotFound
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "error encoding the trace lookup")
	}
	ctx = telemetrystore.WithRoute(telemetrystore.WithTenant(ctx, orgID), telemetrystore.RouteTraceDetail)
	rows, err := e.store.Do(ctx, "trace.lookup", encoded)
	return rows, traceError(err)
}

func traceError(err error) error {
	if err != nil && errors.Asc(err, flighttelemetrystore.ErrCodeTooManyRows) {
		return errors.Newf(errors.TypePayloadTooLarge, spantypes.ErrCodeTraceTooLarge, "the trace has more spans than the engine answers at once")
	}
	return err
}

// minimalSpans reads the tree of a trace: one row per span.
func (e *EngineReader) minimalSpans(ctx context.Context, orgID valuer.UUID, traceID string) ([]spantypes.MinimalSpan, []string, error) {
	rows, err := e.lookup(ctx, orgID, lookupBody{TraceID: traceID, Projection: projectionMinimal})
	if err != nil {
		return nil, nil, err
	}
	warnings := partialWarnings(rows)
	spans, err := readMinimalSpans(rows)
	return spans, warnings, traceError(err)
}

// fullSpans reads the spans of a trace in full, all of them or only spanIDs, one row per span.
func (e *EngineReader) fullSpans(ctx context.Context, orgID valuer.UUID, traceID string, spanIDs []string) ([]spantypes.StorableSpan, []string, error) {
	rows, err := e.lookup(ctx, orgID, lookupBody{TraceID: traceID, Projection: projectionFull, SpanIDs: spanIDs})
	if err != nil {
		return nil, nil, err
	}
	warnings := partialWarnings(rows)
	spans, err := readSpans(rows)
	return spans, warnings, traceError(err)
}

// stats reads the summary of a trace from one full lookup, a row at a time: no span is kept.
func (e *EngineReader) stats(ctx context.Context, orgID valuer.UUID, traceID string) (*spantypes.TraceStats, []string, error) {
	rows, err := e.lookup(ctx, orgID, lookupBody{TraceID: traceID, Projection: projectionFull})
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	warnings := partialWarnings(rows)
	acc := newStatsAccumulator(genAIKeysFor(ctx, orgID, e.flagger))
	types := rows.ColumnTypes()
	for rows.Next() {
		row, err := scanRow(rows, types)
		if err != nil {
			return nil, nil, err
		}
		acc.add(row)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, traceError(err)
	}
	stats := acc.result()
	if stats.TotalSpans == 0 {
		return nil, nil, spantypes.ErrTraceNotFound
	}
	return stats, warnings, nil
}

// partialWarnings are the user-facing texts of the partial-result categories of rows, once each.
func partialWarnings(rows telemetrystore.Rows) []string {
	var out []string
	for _, category := range rows.Warnings() {
		out = appendNew(out, telemetrystore.PartialWarning(category))
	}
	return out
}

// appendNew appends each of items not already in list.
func appendNew(list []string, items ...string) []string {
	for _, item := range items {
		if !slices.Contains(list, item) {
			list = append(list, item)
		}
	}
	return list
}
