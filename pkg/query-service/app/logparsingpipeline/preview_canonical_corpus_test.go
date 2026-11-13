package logparsingpipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/logspipeline/corpus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/plog"
	"golang.org/x/mod/modfile"
)

// The canonical log pipelines corpus is the collector's, published by its
// logspipeline module at the version go.mod pins (collector ADR 0012, step 4).
// These tests hold the backend's corpus to it: the local golden is derived
// from it, not an independent copy. TestSimulatorCorpus keeps what is the
// backend's own: its pipelines, their translation, the SignozLog conversion,
// the preview's golden and its error codes.

// knownDivergence is a message the preview logs and the collector does not,
// allowed only here, never in the preview itself. Each is the expr drift
// approved in collector ADR 0012, decision 4 (scripts/logspipelinecompat/
// approved.txt): under SigNoz/expr, `matches` on a byte slice is an error;
// under expr-lang/expr it is not. The output is the same on both sides. It
// goes when the expr replace leaves go.mod.
type knownDivergence struct {
	Case       string
	Input      int
	OperatorID string
	Error      string
}

var knownDivergences = []knownDivergence{{
	Case:       "X_Bodies_Regex",
	Input:      2,
	OperatorID: "op1",
	Error: "running if expr: interface conversion: interface {} is []uint8, not string (1:21)\n" +
		" | body != nil && body matches \"^(?P<verb>[A-Z]+)\"\n" +
		" | ....................^",
}}

// The known divergences exist because of the expr replace: once it leaves
// go.mod, the test asks for them to be removed.
func TestKnownDivergencesNeedTheExprReplace(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "go.mod"))
	require.NoError(t, err)
	module, replaced := exprReplaced(t, data)
	require.Equal(t, "github.com/fuseone-io/fusescope", module, "read this module's go.mod")
	if !replaced {
		assert.Empty(t, knownDivergences, "github.com/expr-lang/expr is no longer replaced by SigNoz/expr: remove knownDivergences")
	}
}

// exprReplaced reports go.mod's module path and whether it replaces
// expr-lang/expr with SigNoz/expr. modfile.Parse, not ParseLax: only Parse
// reads replace directives.
func exprReplaced(t *testing.T, gomod []byte) (string, bool) {
	t.Helper()
	f, err := modfile.Parse("go.mod", gomod, nil)
	require.NoError(t, err)
	for _, r := range f.Replace {
		if r.Old.Path == "github.com/expr-lang/expr" && r.New.Path == "github.com/SigNoz/expr" {
			return f.Module.Mod.Path, true
		}
	}
	return f.Module.Mod.Path, false
}

func TestExprReplaced(t *testing.T) {
	with := []byte("module m\n\nrequire github.com/expr-lang/expr v1.17.8\n\nreplace github.com/expr-lang/expr => github.com/SigNoz/expr v1.17.7-beta\n")
	without := []byte("module m\n\nrequire github.com/expr-lang/expr v1.17.8\n")
	other := []byte("module m\n\nreplace github.com/expr-lang/expr => github.com/other/expr v1.0.0\n")
	_, ok := exprReplaced(t, with)
	assert.True(t, ok)
	_, ok = exprReplaced(t, without)
	assert.False(t, ok)
	_, ok = exprReplaced(t, other)
	assert.False(t, ok)
}

// Every message the preview logs for a record is the canonical one: the
// same record, operator and text, in the same order and number, after the
// preview's normalisation. Only knownDivergences differ, each exactly once,
// where the corpus has no message.
func TestPreviewMessagesMatchTheCanonicalCorpus(t *testing.T) {
	observed, err := corpus.Observed()
	require.NoError(t, err)
	canonical, err := corpus.LibraryMessages()
	require.NoError(t, err)
	byName := map[string]corpus.Case{}
	for _, c := range observed.Cases {
		byName[c.Name] = c
	}
	require.NotEmpty(t, canonical.Cases)

	seen := map[knownDivergence]int{}
	for name, want := range canonical.Cases {
		t.Run(name, func(t *testing.T) {
			c, ok := byName[name]
			require.True(t, ok, "the canonical messages name an observed case")
			processors := canonicalPreviewProcessors(t, c)
			var got []corpus.Message
			for i, ld := range canonicalRecords(t, observed.Inputs[c.LogSet]) {
				_, messages, err := simulateWithLogspipeline(context.Background(), processors, []plog.Logs{ld})
				require.NoError(t, err)
				for _, m := range messages {
					rest, ok := strings.CutPrefix(m, "operator ")
					require.True(t, ok, "a preview message names its operator: %q", m)
					id, text, ok := strings.Cut(rest, ": ")
					require.True(t, ok, "%q", m)
					got = append(got, corpus.Message{Input: i, OperatorID: id, Error: text})
				}
			}
			kept := []corpus.Message{}
			for _, m := range got {
				d := knownDivergence{Case: name, Input: m.Input, OperatorID: m.OperatorID, Error: m.Error}
				if isKnownDivergence(d) {
					seen[d]++
					for _, w := range want {
						assert.False(t, w.Input == d.Input && w.OperatorID == d.OperatorID,
							"the corpus has a message for the known divergence's record and operator: %+v", w)
					}
					continue
				}
				kept = append(kept, m)
			}
			assert.Equal(t, want, kept)
		})
	}
	for _, d := range knownDivergences {
		assert.Equal(t, 1, seen[d], "known divergence %s input %d %s: seen once", d.Case, d.Input, d.OperatorID)
	}
}

func isKnownDivergence(d knownDivergence) bool {
	for _, k := range knownDivergences {
		if k == d {
			return true
		}
	}
	return false
}

// The backend's golden holds the canonical corpus's inputs, processors and
// outputs for its cases: its "inputs" are the canonical log sets, each
// case's processors are the canonical ones, its output is what the collector
// was observed to write, and each refusal is a canonical startup refusal.
func TestGoldenIsTheCanonicalCorpus(t *testing.T) {
	observed, err := corpus.Observed()
	require.NoError(t, err)
	outputs, err := corpus.ObservedOutputs()
	require.NoError(t, err)
	startup, err := corpus.ObservedStartup()
	require.NoError(t, err)
	data, err := os.ReadFile(filepath.Join(simulatorCorpusDir, "logspipelines.golden.json"))
	require.NoError(t, err)
	var golden logsCorpusGolden
	require.NoError(t, json.Unmarshal(data, &golden))

	for name, docs := range golden.Inputs {
		want := observed.Inputs[name]
		require.Len(t, docs, len(want), "log set %s", name)
		for i := range want {
			var doc any
			require.NoError(t, json.Unmarshal(want[i], &doc))
			assert.Equal(t, sortedOTLPAttributes(doc), sortedOTLPAttributes(jsonValue(t, docs[i])), "log set %s document %d", name, i)
		}
	}

	byName := map[string]corpus.Case{}
	for _, c := range append(observed.Cases, observed.Startup...) {
		byName[c.Name] = c
	}
	refused := map[string]bool{}
	for _, r := range startup {
		refused[r.Name] = !r.Starts
	}
	checked := 0
	for _, g := range golden.Cases {
		if g.Collector == nil {
			continue
		}
		checked++
		c, ok := byName[g.Name]
		require.True(t, ok, "%s is in the canonical corpus", g.Name)
		assert.Equal(t, "backend", c.Origin, g.Name)
		assert.Equal(t, c.ProcessorNames, g.Collector.ProcessorNames, g.Name)
		want := map[string]any{}
		for n, raw := range c.Processors {
			want[n] = jsonValue(t, raw)
		}
		assert.Equal(t, want, jsonValue(t, g.Collector.Processors), "%s processors", g.Name)
		if g.Collector.Rejected {
			assert.True(t, refused[g.Name], "%s is refused at startup in the corpus", g.Name)
			continue
		}
		var docs []plog.Logs
		for _, raw := range outputs[g.Name] {
			ld, err := (&plog.JSONUnmarshaler{}).UnmarshalLogs([]byte(strings.ReplaceAll(string(raw), `"set-by-collector"`, `"0"`)))
			require.NoError(t, err)
			docs = append(docs, ld)
		}
		assert.Equal(t, jsonValue(t, canonicalOTLPLogRecords(t, docs)), jsonValue(t, g.Collector.Output), "%s output", g.Name)
	}
	assert.Equal(t, 168, checked, "the backend's cases that reach the collector")
}

// canonicalPreviewProcessors decodes a case's processors as the collector
// does for the configs FuseScope pushes: `$$` becomes `$`, numbers take
// YAML's types.
func canonicalPreviewProcessors(t *testing.T, c corpus.Case) []previewProcessor {
	t.Helper()
	out := make([]previewProcessor, 0, len(c.ProcessorNames))
	for _, name := range c.ProcessorNames {
		d := json.NewDecoder(bytes.NewReader(c.Processors[name]))
		d.UseNumber()
		var cfg map[string]any
		require.NoError(t, d.Decode(&cfg))
		list, _ := cfg["operators"].([]any)
		operators := make([]map[string]any, 0, len(list))
		for _, op := range list {
			operators = append(operators, unescapePushed(op).(map[string]any))
		}
		out = append(out, previewProcessor{Name: name, Operators: operators})
	}
	return out
}

func unescapePushed(v any) any {
	switch v := v.(type) {
	case json.Number:
		if i, err := v.Int64(); err == nil {
			return int(i)
		}
		f, _ := v.Float64()
		return f
	case string:
		return strings.ReplaceAll(v, "$$", "$")
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, item := range v {
			out[k] = unescapePushed(item)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = unescapePushed(item)
		}
		return out
	}
	return v
}

// canonicalRecords splits a log set into one plog.Logs per record, in the
// order of corpus.Message.Input.
func canonicalRecords(t *testing.T, docs []json.RawMessage) []plog.Logs {
	t.Helper()
	var out []plog.Logs
	for _, raw := range docs {
		ld, err := (&plog.JSONUnmarshaler{}).UnmarshalLogs(raw)
		require.NoError(t, err)
		for i := 0; i < ld.ResourceLogs().Len(); i++ {
			rl := ld.ResourceLogs().At(i)
			for j := 0; j < rl.ScopeLogs().Len(); j++ {
				sl := rl.ScopeLogs().At(j)
				for k := 0; k < sl.LogRecords().Len(); k++ {
					one := plog.NewLogs()
					orl := one.ResourceLogs().AppendEmpty()
					rl.Resource().CopyTo(orl.Resource())
					orl.SetSchemaUrl(rl.SchemaUrl())
					osl := orl.ScopeLogs().AppendEmpty()
					sl.Scope().CopyTo(osl.Scope())
					osl.SetSchemaUrl(sl.SchemaUrl())
					sl.LogRecords().At(k).CopyTo(osl.LogRecords().AppendEmpty())
					out = append(out, one)
				}
			}
		}
	}
	return out
}

func jsonValue(t *testing.T, v any) any {
	t.Helper()
	var raw []byte
	switch v := v.(type) {
	case json.RawMessage:
		raw = v
	default:
		b, err := json.Marshal(v)
		require.NoError(t, err)
		raw = b
	}
	var out any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}
