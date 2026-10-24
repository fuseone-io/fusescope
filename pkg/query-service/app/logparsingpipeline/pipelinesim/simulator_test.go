package pipelinesim

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
)

func TestSimulate(t *testing.T) {
	testCases := []struct {
		name      string
		body      string
		operators []map[string]any
		want      func(t *testing.T, records []plog.LogRecord)
	}{
		{
			name: "IfReadsJSONBodyField",
			body: `{"level":"warn"}`,
			operators: []map[string]any{
				{"id": "a", "type": "add", "field": "attributes.matched", "value": "yes", "if": `body.level == "warn"`},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				require.Len(t, records, 1)
				assert.Equal(t, map[string]any{"matched": "yes"}, records[0].Attributes().AsRaw())
			},
		},
		{
			name: "AddExprSeesSeverityText",
			body: "text",
			operators: []map[string]any{
				{"id": "a", "type": "add", "field": "attributes.sev", "value": `EXPR(severity_text + "!")`},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				require.Len(t, records, 1)
				assert.Equal(t, map[string]any{"sev": "INFO!"}, records[0].Attributes().AsRaw())
			},
		},
		{
			name: "AddExprNilBecomesText",
			body: "text",
			operators: []map[string]any{
				{"id": "a", "type": "add", "field": "attributes.missing", "value": "EXPR(attributes.absent)"},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				require.Len(t, records, 1)
				assert.Equal(t, map[string]any{"missing": "<nil>"}, records[0].Attributes().AsRaw())
			},
		},
		{
			name: "RouterWithoutDefaultDrops",
			body: "text",
			operators: []map[string]any{
				{"id": "r", "type": "router", "routes": []any{map[string]any{"expr": `body == "other"`, "output": "n"}}},
				{"id": "n", "type": "noop"},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				assert.Empty(t, records)
			},
		},
		{
			name: "OnErrorDropDropsFailedParse",
			body: "not json",
			operators: []map[string]any{
				{"id": "j", "type": "json_parser", "parse_from": "body", "parse_to": "attributes", "on_error": "drop"},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				assert.Empty(t, records)
			},
		},
		{
			name: "JSONFlatteningKeepsTopLevelOnCollision",
			body: `{"a":{"b":"lifted"},"a.b":"top"}`,
			operators: []map[string]any{
				{"id": "j", "type": "json_parser", "parse_from": "body", "parse_to": "attributes", "enable_flattening": true, "max_flattening_depth": 1, "enable_paths": true},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				require.Len(t, records, 1)
				assert.Equal(t, map[string]any{"a.b": "top"}, records[0].Attributes().AsRaw())
			},
		},
		{
			name: "GrokMismatchSetsEmptyMap",
			body: "no digits",
			operators: []map[string]any{
				{"id": "g", "type": "grok_parser", "pattern": "%{NUMBER:n:int}", "parse_from": "body", "parse_to": "attributes.parsed", "on_error": "drop"},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				require.Len(t, records, 1)
				assert.Equal(t, map[string]any{"parsed": map[string]any{}}, records[0].Attributes().AsRaw())
			},
		},
		{
			name: "NormalizeRenamesMsg",
			body: `{"msg":"hello","n":1}`,
			operators: []map[string]any{
				{"id": "n", "type": "normalize"},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				require.Len(t, records, 1)
				assert.Equal(t, map[string]any{"message": "hello", "n": int64(1)}, records[0].Body().AsRaw())
			},
		},
		{
			name: "ShortTraceIDIsRightAligned",
			body: "text",
			operators: []map[string]any{
				{"id": "a", "type": "add", "field": "attributes.trace", "value": "abcd"},
				{"id": "t", "type": "trace_parser", "trace_id": map[string]any{"parse_from": "attributes.trace"}},
			},
			want: func(t *testing.T, records []plog.LogRecord) {
				require.Len(t, records, 1)
				assert.Equal(t, "0000000000000000000000000000abcd", records[0].TraceID().String())
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			out, _, err := Simulate(context.Background(), []Processor{{Name: "p", Operators: testCase.operators}}, []plog.Logs{newLogs(testCase.body)})
			require.NoError(t, err)
			testCase.want(t, records(out))
		})
	}
}

func TestSimulate_TimeWithoutZoneIsUTC(t *testing.T) {
	local := time.Local
	time.Local = time.FixedZone("UTC-3", -3*60*60)
	t.Cleanup(func() { time.Local = local })

	operators := []map[string]any{
		{"id": "a", "type": "add", "field": "attributes.ts", "value": "2024-01-02 03:04:05"},
		{"id": "t", "type": "time_parser", "parse_from": "attributes.ts", "layout_type": "strptime", "layout": "%Y-%m-%d %H:%M:%S"},
	}
	out, _, err := Simulate(context.Background(), []Processor{{Name: "p", Operators: operators}}, []plog.Logs{newLogs("text")})
	require.NoError(t, err)
	got := records(out)
	require.Len(t, got, 1)
	assert.Equal(t, time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC), got[0].Timestamp().AsTime())
}

func TestSimulate_ConfigErrors(t *testing.T) {
	testCases := []struct {
		name      string
		operators []map[string]any
		wantType  string
	}{
		{name: "UnsupportedType_InvalidInput", operators: []map[string]any{{"id": "r", "type": "retain", "fields": []any{"attributes.a"}}}, wantType: errors.TypeInvalidInput.String()},
		{name: "InvalidRegex_Internal", operators: []map[string]any{{"id": "r", "type": "regex_parser", "regex": "(?P<x>[a-z"}}, wantType: errors.TypeInternal.String()},
		{name: "UnknownOutput_Internal", operators: []map[string]any{{"id": "n", "type": "noop", "output": "missing"}}, wantType: errors.TypeInternal.String()},
		{name: "Cycle_Internal", operators: []map[string]any{{"id": "a", "type": "noop", "output": "b"}, {"id": "b", "type": "noop", "output": "a"}}, wantType: errors.TypeInternal.String()},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, _, err := Simulate(context.Background(), []Processor{{Name: "p", Operators: testCase.operators}}, []plog.Logs{newLogs("text")})
			require.Error(t, err)
			typ, _, _, _, _, _ := errors.Unwrapb(err)
			assert.Equal(t, testCase.wantType, typ.String())
		})
	}
}

func TestSimulate_Concurrent(t *testing.T) {
	operators := []map[string]any{
		{"id": "g", "type": "grok_parser", "pattern": "%{WORD:verb} %{NUMBER:n:int}", "parse_from": "body", "parse_to": "attributes"},
		{"id": "s", "type": "severity_parser", "parse_from": "attributes.verb"},
	}

	var wg sync.WaitGroup
	errs := make([]error, 16)
	outs := make([][]plog.LogRecord, len(errs))
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			out, _, err := Simulate(context.Background(), []Processor{{Name: "p", Operators: operators}}, []plog.Logs{newLogs(fmt.Sprintf("error %d", i))})
			errs[i], outs[i] = err, records(out)
		}()
	}
	wg.Wait()

	for i := range errs {
		require.NoError(t, errs[i])
		require.Len(t, outs[i], 1)
		assert.Equal(t, map[string]any{"verb": "error", "n": int64(i)}, outs[i][0].Attributes().AsRaw())
		assert.Equal(t, plog.SeverityNumberError, outs[i][0].SeverityNumber())
	}
}

func TestSimulate_Canceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err := Simulate(ctx, []Processor{{Name: "p", Operators: []map[string]any{{"id": "n", "type": "noop"}}}}, []plog.Logs{newLogs("text")})
	assert.True(t, errors.Ast(err, errors.TypeCanceled))
}

func newLogs(body string) plog.Logs {
	logs := plog.NewLogs()
	record := logs.ResourceLogs().AppendEmpty().ScopeLogs().AppendEmpty().LogRecords().AppendEmpty()
	record.Body().SetStr(body)
	record.SetSeverityNumber(plog.SeverityNumberInfo)
	record.SetSeverityText("INFO")
	record.SetTimestamp(pcommon.NewTimestampFromTime(time.Unix(1, 0)))
	return logs
}

func records(logs []plog.Logs) []plog.LogRecord {
	out := []plog.LogRecord{}
	for _, l := range logs {
		for i := 0; i < l.ResourceLogs().Len(); i++ {
			scopes := l.ResourceLogs().At(i).ScopeLogs()
			for j := 0; j < scopes.Len(); j++ {
				for k := 0; k < scopes.At(j).LogRecords().Len(); k++ {
					out = append(out, scopes.At(j).LogRecords().At(k))
				}
			}
		}
	}
	return out
}
