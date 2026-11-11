package logparsingpipeline

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/logspipeline"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/plog"
)

func previewLogs(bodies ...string) []plog.Logs {
	out := make([]plog.Logs, 0, len(bodies))
	for _, body := range bodies {
		ld := plog.NewLogs()
		ld.ResourceLogs().AppendEmpty().ScopeLogs().AppendEmpty().LogRecords().AppendEmpty().Body().SetStr(body)
		out = append(out, ld)
	}
	return out
}

// A record an operator fails is reported as "operator <id>: <error>", as the
// preview always showed; on_error still decides whether the record goes on.
func TestPreviewReportsOperatorErrors(t *testing.T) {
	processors := []previewProcessor{{Name: "p", Operators: []map[string]any{
		{"type": "regex_parser", "id": "re", "regex": `^(?P<n>\d+)$`, "parse_from": "body", "on_error": "send"},
	}}}
	out, messages, err := simulateWithLogspipeline(context.Background(), processors, previewLogs("12", "x"))
	require.NoError(t, err)
	assert.Equal(t, 2, out[0].LogRecordCount())
	require.Len(t, messages, 1)
	assert.Regexp(t, `^operator re: .+`, messages[0])
}

// The processors run in order, each on what the one before let through.
func TestPreviewRunsProcessorsInOrder(t *testing.T) {
	processors := []previewProcessor{
		{Name: "a", Operators: []map[string]any{{"type": "add", "id": "a", "field": "attributes.step", "value": "a"}}},
		{Name: "b", Operators: []map[string]any{{"type": "add", "id": "b", "field": "attributes.seen", "value": `EXPR(attributes.step)`}}},
	}
	out, _, err := simulateWithLogspipeline(context.Background(), processors, previewLogs("x"))
	require.NoError(t, err)
	attrs := out[0].ResourceLogs().At(0).ScopeLogs().At(0).LogRecords().At(0).Attributes().AsRaw()
	assert.Equal(t, map[string]any{"step": "a", "seen": "a"}, attrs)
}

// A refused configuration keeps the classification the preview's golden
// records: the operator list and an operator's fields are invalid input; an
// expression, an operator's own build and its outputs are a build failure.
func TestPreviewClassifiesRefusals(t *testing.T) {
	tests := []struct {
		stage     logspipeline.Stage
		operators []map[string]any
		want      string
	}{
		{logspipeline.StageOperators, []map[string]any{{"type": "retain"}}, "invalid-input"},
		{logspipeline.StageDecode, []map[string]any{{"type": "add", "id": "a", "field": "attributes.x", "value": "v", "nope": 1}}, "invalid-input"},
		{logspipeline.StageCompile, []map[string]any{{"type": "add", "id": "a", "field": "attributes.x", "value": "v", "if": "body =="}}, "internal"},
		{logspipeline.StageBuild, []map[string]any{{"type": "regex_parser", "id": "r", "regex": "^x$"}}, "internal"},
		{logspipeline.StageGraph, []map[string]any{{"type": "add", "id": "a", "field": "attributes.x", "value": "v", "output": "nope"}}, "internal"},
	}
	for _, tt := range tests {
		t.Run(string(tt.stage), func(t *testing.T) {
			_, _, err := simulateWithLogspipeline(context.Background(), []previewProcessor{{Name: "p", Operators: tt.operators}}, previewLogs("x"))
			require.Error(t, err)
			var ce *logspipeline.ConfigError
			require.ErrorAs(t, err, &ce)
			assert.Equal(t, tt.stage, ce.Stage)
			typ, _, _, _, _, _ := errors.Unwrapb(err)
			assert.Equal(t, tt.want, typ.String())
		})
	}
}

func TestPreviewStopsOnCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	processors := []previewProcessor{{Name: "p", Operators: []map[string]any{{"type": "add", "id": "a", "field": "attributes.x", "value": "v"}}}}
	_, _, err := simulateWithLogspipeline(ctx, processors, previewLogs("x"))
	require.Error(t, err)
	typ, _, _, _, _, _ := errors.Unwrapb(err)
	assert.Equal(t, "canceled", typ.String())
}
