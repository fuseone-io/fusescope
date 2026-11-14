package querybuilder_test

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDataFusionAggExprRewriter(t *testing.T) {
	cases := []struct {
		expr string
		want string
		args []any
	}{
		{expr: "count()", want: "count(*)"},
		{expr: "count(name)", want: "count(name)"},
		{expr: "count_distinct(name)", want: "count(DISTINCT name)"},
		{expr: "sum(duration_nano)", want: "sum(TRY_CAST(duration_nano AS DOUBLE))"},
		{expr: "avg(duration_nano)", want: "avg(TRY_CAST(duration_nano AS DOUBLE))"},
		{expr: "p99(duration_nano)", want: "approx_percentile_cont(0.99, 1000) WITHIN GROUP (ORDER BY TRY_CAST(duration_nano AS DOUBLE))"},
		{
			expr: "countIf(has_error = true)",
			want: "count(*) FILTER (WHERE has_error = ?)",
			args: []any{true},
		},
		{
			expr: "p95if(duration_nano, has_error = true)",
			want: "approx_percentile_cont(0.95, 1000) WITHIN GROUP (ORDER BY TRY_CAST(duration_nano AS DOUBLE)) FILTER (WHERE has_error = ?)",
			args: []any{true},
		},
		{expr: "rate()", want: "(count(*) / 60)"},
		{expr: "avg(duration_nano) / 1000000", want: "(avg(TRY_CAST(duration_nano AS DOUBLE)) / 1000000)"},
	}
	rewriter := querybuilder.NewDataFusionAggExprRewriter(tracestelemetryschema.NewDataFusionStorage(), nil, telemetrytypes.SignalTraces)
	for _, c := range cases {
		t.Run(c.expr, func(t *testing.T) {
			got, args, err := rewriter.Rewrite(context.Background(), valuer.UUID{}, 1, 2, c.expr, 60, map[string][]*telemetrytypes.TelemetryFieldKey{})
			require.NoError(t, err)
			assert.Equal(t, c.want, got)
			assert.Equal(t, c.args, args)
		})
	}
}

func TestDataFusionAggExprRewriterRefuses(t *testing.T) {
	rewriter := querybuilder.NewDataFusionAggExprRewriter(tracestelemetryschema.NewDataFusionStorage(), nil, telemetrytypes.SignalTraces)
	for _, expr := range []string{"median(duration_nano)", "count() AND 1", "'x'", "count_distinct(name, kind_string)"} {
		_, _, err := rewriter.Rewrite(context.Background(), valuer.UUID{}, 1, 2, expr, 60, map[string][]*telemetrytypes.TelemetryFieldKey{})
		require.Error(t, err, expr)
	}
}
