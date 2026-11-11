package parityrun

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/querier"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var ErrCodeData = errors.MustNewCode("parity_data")

const (
	// traceCandidateLimit caps each of the trace candidate queries.
	traceCandidateLimit = 1000
	// presentValueLimit caps the present values of an absent key the cases are written with.
	presentValueLimit = 20
)

var (
	serviceKey = telemetrytypes.TelemetryFieldKey{Name: "service.name", FieldContext: telemetrytypes.FieldContextResource}
	traceKey   = telemetrytypes.TelemetryFieldKey{Name: "trace_id", FieldContext: telemetrytypes.FieldContextSpan}
	nameKey    = telemetrytypes.TelemetryFieldKey{Name: "name", FieldContext: telemetrytypes.FieldContextSpan}
)

func builderRequest(kind qbtypes.RequestType, w parity.Window, spec qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]) *qbtypes.QueryRangeRequest {
	spec.Name, spec.Signal = "A", telemetrytypes.SignalTraces
	return &qbtypes.QueryRangeRequest{
		Start: uint64(w.Start / int64(time.Millisecond)), End: uint64(w.End / int64(time.Millisecond)),
		RequestType: kind, NoCache: true,
		CompositeQuery: qbtypes.CompositeQuery{Queries: []qbtypes.QueryEnvelope{{Type: qbtypes.QueryTypeBuilder, Spec: spec}}},
	}
}

// serviceCounts is what the count gate reads from one store: each service's spans, raw and by
// distinct span id, per minute of w.
func serviceCounts(ctx context.Context, q querier.Querier, org valuer.UUID, w parity.Window) (parity.ServiceCounts, error) {
	resp, err := q.QueryRange(ctx, org, builderRequest(qbtypes.RequestTypeTimeSeries, w, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		StepInterval: qbtypes.Step{Duration: time.Minute},
		GroupBy:      []qbtypes.GroupByKey{{TelemetryFieldKey: serviceKey}},
		Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}, {Expression: "count_distinct(span_id)"}},
	}))
	if err != nil {
		return nil, err
	}
	data, ok := single[*qbtypes.TimeSeriesData](resp)
	if !ok {
		return nil, errors.Newf(errors.TypeInternal, ErrCodeData, "the gate counts are not one time series")
	}
	out := parity.ServiceCounts{}
	for _, bucket := range data.Aggregations {
		for _, series := range bucket.Series {
			service, ok := label(series, serviceKey.Name)
			if !ok {
				return nil, errors.Newf(errors.TypeInternal, ErrCodeData, "a gate series has no service")
			}
			if out[service] == nil {
				out[service] = map[int64]parity.Counts{}
			}
			for _, v := range series.Values {
				minute := v.Timestamp * int64(time.Millisecond)
				c := out[service][minute]
				switch bucket.Index {
				case 0:
					c.Raw = int64(v.Value)
				case 1:
					c.Distinct = int64(v.Value)
				}
				out[service][minute] = c
			}
		}
	}
	return out, nil
}

// traceCandidates are the traces a round samples from, so that no quota is drawn from a biased
// set: the largest of w, a circular run of the trace id space from a point the seed picks (trace
// ids are random, so the run is a uniform sample), and the traces with an error from the same
// point, each with every one of its spans counted.
func traceCandidates(ctx context.Context, q querier.Querier, org valuer.UUID, w parity.Window, seed parity.Seed) ([]parity.TraceCandidate, error) {
	start := randomTraceStart(seed, w)
	largest, err := candidateQuery(ctx, q, org, w, "", "spans", qbtypes.OrderDirectionDesc, traceCandidateLimit)
	if err != nil {
		return nil, err
	}
	random, err := traceRun(ctx, q, org, w, "", start)
	if err != nil {
		return nil, err
	}
	failing, err := traceRun(ctx, q, org, w, "has_error = true AND ", start)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, c := range failing {
		if quoted := "'" + c.ID + "'"; traceID.MatchString(c.ID) && !slices.Contains(ids, quoted) {
			ids = append(ids, quoted)
		}
	}
	out := append(largest, random...)
	if len(ids) == 0 {
		return mergeCandidates(out), nil
	}
	whole, err := candidateQuery(ctx, q, org, w, "trace_id IN ("+strings.Join(ids, ", ")+")", "spans", qbtypes.OrderDirectionDesc, len(ids))
	if err != nil {
		return nil, err
	}
	return mergeCandidates(append(out, whole...)), nil
}

// mergeCandidates keeps one candidate a trace, at its larger count, with any error.
func mergeCandidates(candidates []parity.TraceCandidate) []parity.TraceCandidate {
	at := map[string]int{}
	var out []parity.TraceCandidate
	for _, c := range candidates {
		i, ok := at[c.ID]
		if !ok {
			at[c.ID] = len(out)
			out = append(out, c)
			continue
		}
		out[i].Spans, out[i].HasError = max(out[i].Spans, c.Spans), out[i].HasError || c.HasError
	}
	return out
}

// traceRun is a run of the trace id space from start, wrapping past the highest id to the lowest
// until the limit, so every trace has the same chance whatever its id.
func traceRun(ctx context.Context, q querier.Querier, org valuer.UUID, w parity.Window, filter, start string) ([]parity.TraceCandidate, error) {
	run, err := candidateQuery(ctx, q, org, w, filter+"trace_id >= '"+start+"'", "trace_id", qbtypes.OrderDirectionAsc, traceCandidateLimit)
	if err != nil || len(run) >= traceCandidateLimit {
		return run, err
	}
	wrapped, err := candidateQuery(ctx, q, org, w, filter+"trace_id < '"+start+"'", "trace_id", qbtypes.OrderDirectionAsc, traceCandidateLimit-len(run))
	if err != nil {
		return nil, err
	}
	return append(run, wrapped...), nil
}

// traceID is the trace id the queries write as a literal: nothing else is written into a filter.
var traceID = regexp.MustCompile(`^[0-9a-f]{32}$`)

// randomTraceStart is the point of the trace id space a round's random traces start from.
func randomTraceStart(seed parity.Seed, w parity.Window) string {
	var b [24]byte
	binary.BigEndian.PutUint64(b[0:], uint64(seed))
	binary.BigEndian.PutUint64(b[8:], uint64(w.Start))
	binary.BigEndian.PutUint64(b[16:], uint64(w.End))
	sum := sha256.Sum256(b[:])
	return hex.EncodeToString(sum[:16])
}

func candidateQuery(ctx context.Context, q querier.Querier, org valuer.UUID, w parity.Window, filter, order string, direction qbtypes.OrderDirection, limit int) ([]parity.TraceCandidate, error) {
	spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		GroupBy:      []qbtypes.GroupByKey{{TelemetryFieldKey: traceKey}},
		Aggregations: []qbtypes.TraceAggregation{{Expression: "count()", Alias: "spans"}, {Expression: "countIf(has_error = true)", Alias: "errors"}},
		Order:        []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: order}}, Direction: direction}},
		Limit:        limit,
	}
	if filter != "" {
		spec.Filter = &qbtypes.Filter{Expression: filter}
	}
	resp, err := q.QueryRange(ctx, org, builderRequest(qbtypes.RequestTypeScalar, w, spec))
	if err != nil {
		return nil, err
	}
	rows, err := scalarRows(resp, 3)
	if err != nil {
		return nil, err
	}
	out := make([]parity.TraceCandidate, 0, len(rows))
	for _, r := range rows {
		id, ok := r[0].(string)
		spans, okSpans := count(r[1])
		errs, okErrs := count(r[2])
		if !ok || !okSpans || !okErrs {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeData, "a trace candidate is malformed")
		}
		out = append(out, parity.TraceCandidate{ID: id, Spans: spans, HasError: errs > 0})
	}
	return out, nil
}

// operations are the span names of service in w.
func operations(ctx context.Context, q querier.Querier, org valuer.UUID, w parity.Window, service string) ([]string, error) {
	return groupValues(ctx, q, org, w, parityexec.Group{}.Where(serviceKey, service).Filter, nameKey, 0)
}

// absentColumns are the promoted text keys some spans of w lack, with values other spans have.
func absentColumns(ctx context.Context, q querier.Querier, org valuer.UUID, w parity.Window) ([]parity.AbsentKeyColumn, error) {
	var out []parity.AbsentKeyColumn
	for _, attribute := range parity.AbsentKeyAttributes() {
		resp, err := q.QueryRange(ctx, org, builderRequest(qbtypes.RequestTypeScalar, w, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
			Filter:       &qbtypes.Filter{Expression: attribute + " NOT EXISTS"},
			Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}},
		}))
		if err != nil {
			return nil, err
		}
		rows, err := scalarRows(resp, 1)
		if err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			continue
		}
		if n, ok := count(rows[0][0]); !ok || n == 0 {
			continue
		}
		present, err := groupValues(ctx, q, org, w, attribute+" EXISTS", telemetrytypes.TelemetryFieldKey{Name: attribute}, presentValueLimit)
		if err != nil {
			return nil, err
		}
		out = append(out, parity.AbsentKeyColumn{Attribute: attribute, Present: present})
	}
	return out, nil
}

// groupValues are the values of key among the spans of w that filter keeps, the most frequent
// first, up to limit when it is positive.
func groupValues(ctx context.Context, q querier.Querier, org valuer.UUID, w parity.Window, filter string, key telemetrytypes.TelemetryFieldKey, limit int) ([]string, error) {
	spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		GroupBy:      []qbtypes.GroupByKey{{TelemetryFieldKey: key}},
		Aggregations: []qbtypes.TraceAggregation{{Expression: "count()", Alias: "spans"}},
		Order:        []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "spans"}}, Direction: qbtypes.OrderDirectionDesc}},
		Limit:        limit,
	}
	if filter != "" {
		spec.Filter = &qbtypes.Filter{Expression: filter}
	}
	resp, err := q.QueryRange(ctx, org, builderRequest(qbtypes.RequestTypeScalar, w, spec))
	if err != nil {
		return nil, err
	}
	rows, err := scalarRows(resp, 1)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if v, ok := r[0].(string); ok {
			out = append(out, v)
		}
	}
	return out, nil
}

func single[T any](resp *qbtypes.QueryRangeResponse) (T, bool) {
	var zero T
	if resp == nil || len(resp.Data.Results) != 1 {
		return zero, false
	}
	v, ok := resp.Data.Results[0].(T)
	return v, ok
}

func scalarRows(resp *qbtypes.QueryRangeResponse, width int) ([][]any, error) {
	data, ok := single[*qbtypes.ScalarData](resp)
	if !ok {
		return nil, errors.Newf(errors.TypeInternal, ErrCodeData, "the answer is not one scalar")
	}
	for _, r := range data.Data {
		if len(r) < width {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeData, "a scalar row is too short")
		}
	}
	return data.Data, nil
}

func label(series *qbtypes.TimeSeries, name string) (string, bool) {
	for _, l := range series.Labels {
		if l.Key.Name == name {
			v, ok := l.Value.(string)
			return v, ok
		}
	}
	return "", false
}

func count(v any) (int64, bool) {
	switch n := v.(type) {
	case uint64:
		return int64(n), true
	case int64:
		return n, true
	case float64:
		return int64(n), true
	case int:
		return int64(n), true
	}
	return 0, false
}
