package querybuilder

import (
	"context"
	"fmt"
	"strings"

	chparser "github.com/AfterShip/clickhouse-sql-parser/parser"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/huandu/go-sqlbuilder"
)

// ErrCodeUnsupportedDialect marks a request the DataFusion dialect has no
// translation for; it is refused rather than rendered approximately.
var ErrCodeUnsupportedDialect = errors.MustNewCode("unsupported_dialect")

type dataFusionAggExprRewriter struct {
	storage qbtypes.Storage
	flagger flagger.Flagger
	signal  telemetrytypes.Signal
}

var _ qbtypes.AggExprRewriter = (*dataFusionAggExprRewriter)(nil)

// NewDataFusionAggExprRewriter renders aggregation expressions for
// fusescope-engine. The expression is read with the same parser as for
// ClickHouse, and written from its tree: function calls, numbers and
// arithmetic between them. Anything else is refused.
func NewDataFusionAggExprRewriter(storage qbtypes.Storage, fl flagger.Flagger, signal telemetrytypes.Signal) qbtypes.AggExprRewriter {
	return &dataFusionAggExprRewriter{storage: storage, flagger: fl, signal: signal}
}

func (r *dataFusionAggExprRewriter) Rewrite(
	ctx context.Context,
	orgID valuer.UUID,
	startNs, endNs uint64,
	expr string,
	rateInterval uint64,
	keys map[string][]*telemetrytypes.TelemetryFieldKey,
) (string, []any, error) {
	stmts, err := chparser.NewParser("SELECT " + expr).ParseStmts()
	if err != nil {
		return "", nil, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "failed to parse aggregation expression %q", expr)
	}
	if len(stmts) != 1 {
		return "", nil, errors.NewInvalidInputf(errors.CodeInvalidInput, "one aggregation expression expected in %q", expr)
	}
	sel, ok := stmts[0].(*chparser.SelectQuery)
	if !ok || len(sel.SelectItems) != 1 {
		return "", nil, errors.NewInvalidInputf(errors.CodeInvalidInput, "one aggregation expression expected in %q", expr)
	}
	query := NewQueryInfo(ctx, orgID, r.flagger, r.signal, nil, startNs, endNs)
	query.Dialect = DataFusion{}
	w := &dataFusionAggWriter{ctx: ctx, query: query, storage: r.storage, keys: keys, rateInterval: rateInterval}
	sql, err := w.write(sel.SelectItems[0].Expr)
	if err != nil {
		return "", nil, err
	}
	return sql, w.args, nil
}

func (r *dataFusionAggExprRewriter) RewriteMulti(
	ctx context.Context,
	orgID valuer.UUID,
	startNs, endNs uint64,
	exprs []string,
	rateInterval uint64,
	keys map[string][]*telemetrytypes.TelemetryFieldKey,
) ([]string, [][]any, error) {
	out := make([]string, len(exprs))
	args := make([][]any, len(exprs))
	for i, expr := range exprs {
		sql, exprArgs, err := r.Rewrite(ctx, orgID, startNs, endNs, expr, rateInterval, keys)
		if err != nil {
			return nil, nil, err
		}
		out[i], args[i] = sql, exprArgs
	}
	return out, args, nil
}

type dataFusionAggWriter struct {
	ctx          context.Context
	query        qbtypes.QueryInfo
	storage      qbtypes.Storage
	keys         map[string][]*telemetrytypes.TelemetryFieldKey
	rateInterval uint64
	args         []any
}

func (w *dataFusionAggWriter) write(expr chparser.Expr) (string, error) {
	switch e := expr.(type) {
	case *chparser.FunctionExpr:
		return w.function(e)
	case *chparser.NumberLiteral:
		return e.Literal, nil
	case *chparser.BinaryOperation:
		switch op := string(e.Operation); op {
		case "+", "-", "*", "/":
			left, err := w.write(e.LeftExpr)
			if err != nil {
				return "", err
			}
			right, err := w.write(e.RightExpr)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("(%s %s %s)", left, op, right), nil
		}
	case *chparser.ColumnExprList:
		if len(e.Items) == 1 {
			inner, err := w.write(e.Items[0])
			return "(" + inner + ")", err
		}
	case *chparser.ParamExprList:
		if e.Items != nil && len(e.Items.Items) == 1 {
			inner, err := w.write(e.Items.Items[0])
			return "(" + inner + ")", err
		}
	}
	return "", errors.NewInvalidInputf(ErrCodeUnsupportedDialect, "aggregation term %q has no DataFusion form", chparser.Format(expr))
}

func (w *dataFusionAggWriter) function(fn *chparser.FunctionExpr) (string, error) {
	name := strings.ToLower(fn.Name.Name)
	agg, ok := AggreFuncMap[valuer.NewString(name)]
	if !ok {
		return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "unrecognized function: %s", name)
	}
	var args []chparser.Expr
	if fn.Params != nil && fn.Params.Items != nil {
		args = fn.Params.Items.Items
	}
	if agg.RequireArgs && (len(args) < agg.MinArgs || len(args) > agg.MaxArgs) {
		return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "invalid number of arguments for %q: %d", name, len(args))
	}
	filter := ""
	if agg.FuncCombinator {
		predicate, err := w.predicate(args[len(args)-1])
		if err != nil {
			return "", err
		}
		filter = " FILTER (WHERE " + predicate + ")"
		args = args[:len(args)-1]
	}
	dataType := telemetrytypes.FieldDataTypeString
	if agg.Numeric {
		dataType = telemetrytypes.FieldDataTypeFloat64
	}
	columns := make([]string, len(args))
	for i, arg := range args {
		key := telemetrytypes.GetFieldKeyFromKeyText(chparser.Format(arg))
		column, err := ResolveColumn(w.ctx, w.query, w.storage, &key, dataType, w.keys)
		if err != nil {
			return "", err
		}
		columns[i] = column
	}
	call, err := dataFusionAggregate(agg, columns)
	if err != nil {
		return "", err
	}
	call += filter
	if agg.Rate {
		call = fmt.Sprintf("(%s / %d)", call, w.rateInterval)
	}
	return call, nil
}

// predicate compiles an *If condition; its placeholders join the args in
// the order the aggregation renders them.
func (w *dataFusionAggWriter) predicate(arg chparser.Expr) (string, error) {
	clause, err := PrepareWhereClause(chparser.Format(arg), FilterExprVisitorOpts{
		Context:   w.ctx,
		Query:     w.query,
		Storage:   w.storage,
		FieldKeys: w.keys,
	})
	if err != nil {
		return "", err
	}
	if clause.IsEmpty() {
		return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "invalid predicate %q", chparser.Format(arg))
	}
	sql, args := clause.WhereClause.BuildWithFlavor(sqlbuilder.ClickHouse)
	w.args = append(w.args, args...)
	return strings.TrimSpace(strings.TrimPrefix(sql, "WHERE")), nil
}

// dataFusionAggregate is the DataFusion call of agg over its columns, without the filter.
func dataFusionAggregate(agg AggrFunc, columns []string) (string, error) {
	base := agg.FuncName
	if strings.HasPrefix(base, "quantile") {
		open, end := strings.IndexByte(base, '('), strings.IndexByte(base, ')')
		if open < 0 || end < open || len(columns) != 1 {
			return "", errors.NewInternalf(errors.CodeInternal, "malformed quantile %q", base)
		}
		return fmt.Sprintf("approx_percentile_cont(%s) WITHIN GROUP (ORDER BY %s)", base[open+1:end], columns[0]), nil
	}
	base = strings.TrimSuffix(base, "If")
	switch base {
	case "count":
		if len(columns) == 0 {
			return "count(*)", nil
		}
		return fmt.Sprintf("count(%s)", strings.Join(columns, ", ")), nil
	case "countDistinct":
		if len(columns) != 1 {
			return "", errors.NewInvalidInputf(ErrCodeUnsupportedDialect, "count_distinct over %d columns has no DataFusion form", len(columns))
		}
		return fmt.Sprintf("count(DISTINCT %s)", columns[0]), nil
	case "sum", "avg", "min", "max":
		if len(columns) != 1 {
			return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "%s takes one argument", base)
		}
		return fmt.Sprintf("%s(%s)", base, columns[0]), nil
	}
	return "", errors.NewInvalidInputf(ErrCodeUnsupportedDialect, "aggregation %s has no DataFusion form", agg.Name.StringValue())
}
