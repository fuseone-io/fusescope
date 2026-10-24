package spantypes

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/ptrace"
	"gopkg.in/yaml.v3"
)

var updateSimulatorCorpus = flag.Bool("update", false, "rewrite the span mapper simulator corpus golden file")

// Shared with the simulatorcontract integration suite, which replays the
// golden input through the real collector.
var simulatorCorpusDir = filepath.Join("..", "..", "..", "tests", "integration", "testdata", "simulatorcontract")

var systemDefinitionsDir = filepath.Join("..", "..", "modules", "spanmapper", "implspanmapper", "fs", "definitions")

type spanMapperCorpus struct {
	Spans map[string][]SpanMapperTestSpan `json:"spans"`
	Cases []spanMapperCorpusCase          `json:"cases"`
}

// System groups run before the case's own groups, enabled as the reconciler
// provisions them.
type spanMapperCorpusCase struct {
	Name         string                        `json:"name"`
	Spans        string                        `json:"spans"`
	SystemGroups []string                      `json:"systemGroups"`
	Groups       []PostableSpanMapperTestGroup `json:"groups"`
}

type spanMapperCorpusGolden struct {
	Inputs map[string][]map[string]any `json:"inputs"`
	Cases  []spanMapperCorpusResult    `json:"cases"`
}

type spanMapperCorpusResult struct {
	Name      string                   `json:"name"`
	SpanSet   string                   `json:"spanSet"`
	Error     string                   `json:"error,omitempty"`
	Spans     []SpanMapperTestSpan     `json:"spans,omitempty"`
	Collector *spanMapperCorpusCollect `json:"collector,omitempty"`
}

// spanMapperCorpusCollect is what the integration suite needs to replay a
// case through the real collector: the processor the backend deploys and the
// canonical OTLP spans the preview got back for the span set's input.
type spanMapperCorpusCollect struct {
	Processors     map[string]any   `json:"processors"`
	ProcessorNames []string         `json:"processorNames"`
	Output         []map[string]any `json:"output"`
}

func TestSpanMapperSimulatorCorpus(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(simulatorCorpusDir, "spanmapper.corpus.json"))
	require.NoError(t, err)
	var corpus spanMapperCorpus
	require.NoError(t, json.Unmarshal(data, &corpus))

	names := map[string]bool{}
	for _, c := range corpus.Cases {
		require.False(t, names[c.Name], "duplicate corpus case %s", c.Name)
		names[c.Name] = true
		require.Contains(t, corpus.Spans, c.Spans, "case %s uses an unknown span set", c.Name)
	}

	got := spanMapperCorpusGolden{Inputs: map[string][]map[string]any{}, Cases: make([]spanMapperCorpusResult, len(corpus.Cases))}
	for name, spans := range corpus.Spans {
		for _, td := range spanMapperInputPTraces(spans) {
			got.Inputs[name] = append(got.Inputs[name], sortedOTLPAttributes(otlpTracesJSON(t, td)).(map[string]any))
		}
	}
	t.Run("Cases", func(t *testing.T) {
		for i, c := range corpus.Cases {
			t.Run(c.Name, func(t *testing.T) {
				got.Cases[i] = runSpanMapperCorpusCase(t, c, corpus.Spans[c.Spans])
			})
		}
	})

	goldenPath := filepath.Join(simulatorCorpusDir, "spanmapper.golden.json")
	if *updateSimulatorCorpus {
		out, err := json.MarshalIndent(got, "", " ")
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(goldenPath, append(out, '\n'), 0o644))
	}

	data, err = os.ReadFile(goldenPath)
	require.NoError(t, err, "golden missing — generate it with -update")
	var want spanMapperCorpusGolden
	require.NoError(t, json.Unmarshal(data, &want))

	got = roundTripSpanMapperGolden(t, got)
	assert.Equal(t, want.Inputs, got.Inputs)
	wantByName := map[string]spanMapperCorpusResult{}
	for _, w := range want.Cases {
		wantByName[w.Name] = w
	}
	for _, g := range got.Cases {
		assert.Equal(t, wantByName[g.Name], g, "case %s", g.Name)
	}
	assert.Len(t, want.Cases, len(got.Cases), "golden has cases the corpus no longer lists; regenerate with -update")
}

func runSpanMapperCorpusCase(t *testing.T, c spanMapperCorpusCase, spans []SpanMapperTestSpan) spanMapperCorpusResult {
	groups := corpusSpanMapperGroups(t, c)
	result := spanMapperCorpusResult{Name: c.Name, SpanSet: c.Spans}

	enabled := filterEnabledGroupsWithMappers(groups)
	if len(enabled) == 0 {
		out, _, err := SimulateSpanMappersProcessing(context.Background(), groups, cloneSpans(t, spans))
		require.NoError(t, err)
		result.Spans = out
		return result
	}

	outTraces, err := simulateSpanMappersOnPTraces(context.Background(), enabled, spanMapperInputPTraces(cloneSpans(t, spans)))
	if err != nil {
		typ, _, _, _, _, _ := errors.Unwrapb(err)
		result.Error = typ.String()
		return result
	}
	canonical := canonicalOTLPSpans(t, outTraces)
	result.Spans, err = spanMapperOutputSpans(outTraces, len(spans))
	require.NoError(t, err)

	conf, err := GenerateCollectorConfigWithSpanMapperProcessor([]byte("{}"), enabled)
	require.NoError(t, err)
	var parsed struct {
		Processors map[string]any `yaml:"processors"`
	}
	require.NoError(t, yaml.Unmarshal(conf, &parsed))
	result.Collector = &spanMapperCorpusCollect{Processors: parsed.Processors, ProcessorNames: []string{ProcessorName}, Output: canonical}
	return result
}

func corpusSpanMapperGroups(t *testing.T, c spanMapperCorpusCase) []*SpanMapperGroupWithMappers {
	postable := make([]PostableSpanMapperTestGroup, 0, len(c.SystemGroups)+len(c.Groups))
	for _, name := range c.SystemGroups {
		raw, err := os.ReadFile(filepath.Join(systemDefinitionsDir, name+".json"))
		require.NoError(t, err)
		definition, err := NewSpanMapperGroupDefinition(raw)
		require.NoError(t, err)
		for i := range definition.Definition.Mappers {
			definition.Definition.Mappers[i].Enabled = true
		}
		postable = append(postable, definition.Definition)
	}
	postable = append(postable, c.Groups...)
	return NewSpanMapperGroupsWithMappersFromPostable(valuer.GenerateUUID(), postable)
}

func otlpTracesJSON(t *testing.T, td ptrace.Traces) map[string]any {
	raw, err := (&ptrace.JSONMarshaler{}).MarshalTraces(td)
	require.NoError(t, err)
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

// canonicalOTLPSpans flattens OTLP/JSON into one object per span with the
// resource attributes inlined and key/value lists turned into objects,
// ordered by input position. The simulatorcontract integration suite applies
// the same rules to the collector's output.
func canonicalOTLPSpans(t *testing.T, traces []ptrace.Traces) []map[string]any {
	spans := []map[string]any{}
	for _, td := range traces {
		doc := otlpTracesJSON(t, td)
		resourceSpans, _ := doc["resourceSpans"].([]any)
		for _, rs := range resourceSpans {
			rsMap := rs.(map[string]any)
			resource, _ := rsMap["resource"].(map[string]any)
			scopeSpans, _ := rsMap["scopeSpans"].([]any)
			for _, ss := range scopeSpans {
				items, _ := ss.(map[string]any)["spans"].([]any)
				for _, item := range items {
					span := map[string]any{}
					for k, v := range item.(map[string]any) {
						if k == "attributes" {
							span[k] = canonicalKeyValues(v)
							continue
						}
						span[k] = v
					}
					span["resource"] = canonicalKeyValues(resource["attributes"])
					spans = append(spans, span)
				}
			}
		}
	}
	sort.SliceStable(spans, func(i, j int) bool {
		if a, b := corpusInputIndex(spans[i]), corpusInputIndex(spans[j]); a != b {
			return a < b
		}
		return corpusItemKey(t, spans[i]) < corpusItemKey(t, spans[j])
	})
	return spans
}

func corpusItemKey(t *testing.T, item map[string]any) string {
	data, err := json.Marshal(item)
	require.NoError(t, err)
	return string(data)
}

// corpusInputIndex places spans that lost the input index attribute last.
func corpusInputIndex(item map[string]any) int64 {
	attributes, _ := item["attributes"].(map[string]any)
	value, _ := attributes[spanInputOrderAttr].(map[string]any)
	index, err := strconv.ParseInt(fmt.Sprint(value["intValue"]), 10, 64)
	if err != nil {
		return math.MaxInt64
	}
	return index
}

// sortedOTLPAttributes orders every attribute list by key, since the preview
// builds them from maps.
func sortedOTLPAttributes(v any) any {
	switch value := v.(type) {
	case map[string]any:
		for k, item := range value {
			value[k] = sortedOTLPAttributes(item)
		}
		if attributes, ok := value["attributes"].([]any); ok {
			sort.Slice(attributes, func(i, j int) bool {
				return attributes[i].(map[string]any)["key"].(string) < attributes[j].(map[string]any)["key"].(string)
			})
		}
		if values, ok := value["values"].([]any); ok && len(values) > 0 {
			if _, isKeyValue := values[0].(map[string]any)["key"]; isKeyValue {
				sort.Slice(values, func(i, j int) bool {
					return values[i].(map[string]any)["key"].(string) < values[j].(map[string]any)["key"].(string)
				})
			}
		}
		return value
	case []any:
		for i, item := range value {
			value[i] = sortedOTLPAttributes(item)
		}
		return value
	default:
		return v
	}
}

func canonicalKeyValues(v any) map[string]any {
	out := map[string]any{}
	list, _ := v.([]any)
	for _, kv := range list {
		kvMap := kv.(map[string]any)
		out[kvMap["key"].(string)] = canonicalAnyValue(kvMap["value"])
	}
	return out
}

func canonicalAnyValue(v any) any {
	value, ok := v.(map[string]any)
	if !ok {
		return v
	}
	if kvlist, ok := value["kvlistValue"].(map[string]any); ok {
		return map[string]any{"kvlistValue": canonicalKeyValues(kvlist["values"])}
	}
	if array, ok := value["arrayValue"].(map[string]any); ok {
		values, _ := array["values"].([]any)
		out := make([]any, 0, len(values))
		for _, item := range values {
			out = append(out, canonicalAnyValue(item))
		}
		return map[string]any{"arrayValue": out}
	}
	return value
}

func cloneSpans(t *testing.T, spans []SpanMapperTestSpan) []SpanMapperTestSpan {
	data, err := json.Marshal(spans)
	require.NoError(t, err)
	var out []SpanMapperTestSpan
	require.NoError(t, json.Unmarshal(data, &out))
	return out
}

func roundTripSpanMapperGolden(t *testing.T, golden spanMapperCorpusGolden) spanMapperCorpusGolden {
	data, err := json.Marshal(golden)
	require.NoError(t, err)
	var out spanMapperCorpusGolden
	require.NoError(t, json.Unmarshal(data, &out))
	return out
}
