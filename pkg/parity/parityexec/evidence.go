package parityexec

import (
	"context"
	"log/slog"
	"regexp"
	"strconv"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Group is the spans one quantile of a view aggregated: the view's window and filter, narrowed to
// the group's values, and the field the quantile is of.
type Group struct {
	// Start and End are the window in milliseconds, as the view's request has it.
	Start, End uint64
	Filter     string
	Variables  map[string]qbtypes.VariableItem
	Field      string
	narrowed   bool
}

// Where narrows g to the spans whose key holds value, as the view's group by does. An empty string
// is kept: ClickHouse's group of the empty value holds the spans without the key too.
func (g Group) Where(key telemetrytypes.TelemetryFieldKey, value any) Group {
	condition := key.Text() + " = " + literal(value)
	switch {
	case g.Filter == "":
		g.Filter = condition
	case g.narrowed:
		g.Filter += " AND " + condition
	default:
		g.Filter = "(" + g.Filter + ") AND " + condition
	}
	g.narrowed = true
	return g
}

// Bucket is g over the time series bucket starting at ts, of step milliseconds, within g's window:
// the first and last buckets may be partial.
func (g Group) Bucket(ts, step uint64) (Group, bool) {
	start, end := max(ts, g.Start), min(ts+step, g.End)
	if step == 0 || start >= end {
		return Group{}, false
	}
	g.Start, g.End = start, end
	return g, true
}

func (g Group) expression() string {
	if g.Filter == "" || g.narrowed {
		return g.Filter
	}
	return "(" + g.Filter + ")"
}

func literal(value any) string {
	switch v := value.(type) {
	case string:
		return "'" + strings.ReplaceAll(strings.ReplaceAll(v, `\`, `\\`), "'", `\'`) + "'"
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	}
	return "'" + strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(toText(value)), `\`, `\\`), "'", `\'`) + "'"
}

func toText(value any) string {
	switch v := value.(type) {
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case uint64:
		return strconv.FormatUint(v, 10)
	}
	return ""
}

var quantileExpression = regexp.MustCompile(`^(p[0-9]+)\(([A-Za-z_][A-Za-z0-9_.:$@-]*)\)$`)

// QuantileField is the field and the quantile of an aggregation expression pNN(field), for the
// percentiles the query builder knows.
func QuantileField(expression string) (string, float64, bool) {
	m := quantileExpression.FindStringSubmatch(strings.TrimSpace(expression))
	if m == nil {
		return "", 0, false
	}
	fn, ok := querybuilder.AggreFuncMap[valuer.NewString(m[1])]
	if !ok || !strings.HasPrefix(fn.FuncName, "quantile(") {
		return "", 0, false
	}
	q, err := strconv.ParseFloat(strings.TrimSuffix(strings.TrimPrefix(fn.FuncName, "quantile("), ")"), 64)
	if err != nil || q <= 0 || q >= 1 {
		return "", 0, false
	}
	return m[2], q, true
}

// QuantileEvidence is the evidence of one group with its row count, which the caller compares to
// the count the view answered for the group.
type QuantileEvidence struct {
	Rows     int64
	Evidence parity.QuantileEvidence
}

// Evidencer asks ClickHouse, through its graph's querier and the view's builder, for the exact
// distribution of a quantile's group.
type Evidencer struct {
	Querier querier.Querier
	Keys    telemetrytypes.KeyResolver
	Org     valuer.UUID
	// Logger takes the whole error of evidence that failed; the report keeps its type and code
	// alone. Nil is slog's default.
	Logger *slog.Logger
}

// Quantile is the evidence of g for the engine's value v of the quantile q. It counts the rows,
// the field's values, those below v and those at or below it, and, when the order statistics
// judge, reads them at their ranks and counts again; ok is false when the field is not one numeric
// key or the counts moved between the queries.
//
// # Errors
//
// A query ClickHouse refused.
func (e Evidencer) Quantile(ctx context.Context, g Group, q, v float64) (QuantileEvidence, bool, error) {
	if numeric, err := e.numericField(ctx, g.Field); err != nil || !numeric {
		return QuantileEvidence{}, false, err
	}
	counts, err := e.counts(ctx, g, v)
	if err != nil {
		return QuantileEvidence{}, false, err
	}
	rule, low, high := parity.QuantileRuleFor(q, counts.Evidence.N)
	if rule != parity.RuleOrderStatistics || counts.Evidence.N == 0 {
		return counts, true, nil
	}
	bounds := &parity.OrderStatistics{}
	if bounds.Low, err = e.valueAt(ctx, g, low); err != nil {
		return QuantileEvidence{}, false, err
	}
	bounds.High = bounds.Low
	if high != low {
		if bounds.High, err = e.valueAt(ctx, g, high); err != nil {
			return QuantileEvidence{}, false, err
		}
	}
	again, err := e.counts(ctx, g, v)
	if err != nil || again != counts {
		return QuantileEvidence{}, false, err
	}
	counts.Evidence.Bounds = bounds
	return counts, true, nil
}

func (e Evidencer) numericField(ctx context.Context, field string) (bool, error) {
	name := field
	if i := strings.LastIndex(field, ":"); i >= 0 {
		name = field[:i]
	}
	for _, prefix := range []string{"attribute.", "resource.", "span.", "scope."} {
		name = strings.TrimPrefix(name, prefix)
	}
	keys, complete, err := e.Keys.GetKeysMulti(ctx, e.Org, []*telemetrytypes.FieldKeySelector{{Name: name, Signal: telemetrytypes.SignalTraces, SelectorMatchType: telemetrytypes.FieldSelectorMatchTypeExact}})
	if err != nil || !complete {
		return false, err
	}
	matching := keys[name]
	if len(matching) != 1 {
		return false, nil
	}
	switch matching[0].FieldDataType {
	case telemetrytypes.FieldDataTypeFloat64, telemetrytypes.FieldDataTypeInt64, telemetrytypes.FieldDataTypeNumber:
		return true, nil
	}
	return false, nil
}

func (e Evidencer) counts(ctx context.Context, g Group, v float64) (QuantileEvidence, error) {
	value := strconv.FormatFloat(v, 'f', -1, 64)
	spec := e.query(g)
	spec.Aggregations = []qbtypes.TraceAggregation{
		{Expression: "count()"},
		{Expression: "count(" + g.Field + ")"},
		{Expression: "countIf(" + g.Field + " < " + value + ")"},
		{Expression: "countIf(" + g.Field + " <= " + value + ")"},
	}
	resp, err := e.Querier.QueryRange(ctx, e.Org, e.request(g, qbtypes.RequestTypeScalar, spec))
	if err != nil {
		return QuantileEvidence{}, err
	}
	row, err := scalarRow(resp, 4)
	if err != nil {
		return QuantileEvidence{}, err
	}
	return QuantileEvidence{Rows: row[0], Evidence: parity.QuantileEvidence{N: row[1], Below: row[2], AtOrBelow: row[3]}}, nil
}

// valueAt is the field's value at the 1-based rank, in ascending order.
func (e Evidencer) valueAt(ctx context.Context, g Group, rank int64) (float64, error) {
	spec := e.query(g)
	spec.SelectFields = []telemetrytypes.TelemetryFieldKey{{Name: g.Field}}
	spec.Order = []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: g.Field}}, Direction: qbtypes.OrderDirectionAsc}}
	spec.Limit, spec.Offset = 1, int(rank-1)
	resp, err := e.Querier.QueryRange(ctx, e.Org, e.request(g, qbtypes.RequestTypeRaw, spec))
	if err != nil {
		return 0, err
	}
	rows := rawRows(resp)
	if len(rows) != 1 {
		return 0, errors.NewInternalf(errors.CodeInternal, "the order statistic at rank %d is not one row", rank)
	}
	value, ok := number(rows[0].Data[g.Field])
	if !ok {
		return 0, errors.NewInternalf(errors.CodeInternal, "the order statistic at rank %d is not a number", rank)
	}
	return value, nil
}

func (e Evidencer) query(g Group) qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation] {
	spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{Name: "A", Signal: telemetrytypes.SignalTraces}
	if expr := g.expression(); expr != "" {
		spec.Filter = &qbtypes.Filter{Expression: expr}
	}
	return spec
}

func (e Evidencer) request(g Group, kind qbtypes.RequestType, spec qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]) *qbtypes.QueryRangeRequest {
	return &qbtypes.QueryRangeRequest{
		Start: g.Start, End: g.End, RequestType: kind, Variables: g.Variables, NoCache: true,
		CompositeQuery: qbtypes.CompositeQuery{Queries: []qbtypes.QueryEnvelope{{Type: qbtypes.QueryTypeBuilder, Spec: spec}}},
	}
}

func scalarRow(resp *qbtypes.QueryRangeResponse, width int) ([]int64, error) {
	if resp != nil && len(resp.Data.Results) == 1 {
		if data, ok := resp.Data.Results[0].(*qbtypes.ScalarData); ok && len(data.Data) == 1 && len(data.Data[0]) >= width {
			out := make([]int64, width)
			for i := range out {
				n, ok := number(data.Data[0][i])
				if !ok {
					return nil, errors.NewInternalf(errors.CodeInternal, "an evidence count is not a number")
				}
				out[i] = int64(n)
			}
			return out, nil
		}
	}
	return nil, errors.NewInternalf(errors.CodeInternal, "the evidence counts are not one scalar row")
}

func rawRows(resp *qbtypes.QueryRangeResponse) []*qbtypes.RawRow {
	if resp != nil && len(resp.Data.Results) == 1 {
		if data, ok := resp.Data.Results[0].(*qbtypes.RawData); ok {
			return data.Rows
		}
	}
	return nil
}

func number(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint64:
		return float64(n), true
	case int32:
		return float64(n), true
	case uint32:
		return float64(n), true
	}
	return 0, false
}
