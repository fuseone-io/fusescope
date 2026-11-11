package parityrun

import (
	"context"
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
	// traceCandidateLimit caps the traces a round samples from, the largest first.
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

// traceCandidates are the traces of w, the largest first, with their span counts and errors.
func traceCandidates(ctx context.Context, q querier.Querier, org valuer.UUID, w parity.Window) ([]parity.TraceCandidate, error) {
	resp, err := q.QueryRange(ctx, org, builderRequest(qbtypes.RequestTypeScalar, w, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		GroupBy:      []qbtypes.GroupByKey{{TelemetryFieldKey: traceKey}},
		Aggregations: []qbtypes.TraceAggregation{{Expression: "count()", Alias: "spans"}, {Expression: "countIf(has_error = true)", Alias: "errors"}},
		Order:        []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "spans"}}, Direction: qbtypes.OrderDirectionDesc}},
		Limit:        traceCandidateLimit,
	}))
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
