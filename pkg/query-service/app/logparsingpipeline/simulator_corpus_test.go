package logparsingpipeline

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	v3 "github.com/fuseone-io/fusescope/pkg/query-service/model/v3"
	"github.com/fuseone-io/fusescope/pkg/types/pipelinetypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/plog"
	"gopkg.in/yaml.v3"
)

var updateSimulatorCorpus = flag.Bool("update", false, "rewrite the simulator corpus golden file")

// Shared with the simulatorcontract integration suite, which replays the
// golden input through the real collector.
var simulatorCorpusDir = filepath.Join("..", "..", "..", "..", "tests", "integration", "testdata", "simulatorcontract")

var uuidPattern = regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)

const corpusCollectorBaseConfig = `
receivers:
  otlp:
    protocols:
      http: {}
exporters:
  file:
    path: /dev/null
service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: []
      exporters: [file]
`

type logsCorpus struct {
	Logs  map[string][]model.SignozLog `json:"logs"`
	Cases []logsCorpusCase             `json:"cases"`
}

type logsCorpusCase struct {
	Name      string               `json:"name"`
	Logs      string               `json:"logs"`
	Pipelines []logsCorpusPipeline `json:"pipelines"`
}

// Corpus pipelines default to enabled, alias "p<n>", a match-all filter and
// enabled operators numbered in order, so cases only spell out what they test.
type logsCorpusPipeline struct {
	Alias   string            `json:"alias"`
	Enabled *bool             `json:"enabled"`
	Filter  *v3.FilterSet     `json:"filter"`
	Config  []json.RawMessage `json:"config"`
}

type logsCorpusGolden struct {
	Inputs map[string][]map[string]any `json:"inputs"`
	Cases  []logsCorpusResult          `json:"cases"`
}

type logsCorpusResult struct {
	Name      string             `json:"name"`
	LogSet    string             `json:"logSet"`
	Error     string             `json:"error,omitempty"`
	Logs      []model.SignozLog  `json:"logs,omitempty"`
	Collector *logsCorpusCollect `json:"collector,omitempty"`
}

// logsCorpusCollect is what the integration suite needs to replay a case
// through the real collector: the processors the backend deploys and either
// the canonical OTLP records the preview got back for the log set's input or
// the preview's refusal of the config.
type logsCorpusCollect struct {
	Processors     map[string]any   `json:"processors"`
	ProcessorNames []string         `json:"processorNames"`
	Output         []map[string]any `json:"output,omitempty"`
	Rejected       bool             `json:"rejected,omitempty"`
}

func TestSimulatorCorpus(t *testing.T) {
	// Layouts without a zone parse in the local zone; collectors run in UTC.
	local := time.Local
	time.Local = time.UTC
	t.Cleanup(func() { time.Local = local })

	data, err := os.ReadFile(filepath.Join(simulatorCorpusDir, "logspipelines.corpus.json"))
	require.NoError(t, err)
	var corpus logsCorpus
	require.NoError(t, json.Unmarshal(data, &corpus))

	names := map[string]bool{}
	for _, c := range corpus.Cases {
		require.False(t, names[c.Name], "duplicate corpus case %s", c.Name)
		names[c.Name] = true
		require.Contains(t, corpus.Logs, c.Logs, "case %s uses an unknown log set", c.Name)
	}

	got := logsCorpusGolden{Inputs: map[string][]map[string]any{}, Cases: make([]logsCorpusResult, len(corpus.Cases))}
	for name, logs := range corpus.Logs {
		for _, pl := range previewInputPLogs(cloneSignozLogs(t, logs)) {
			got.Inputs[name] = append(got.Inputs[name], sortedOTLPAttributes(otlpLogsJSON(t, pl)).(map[string]any))
		}
	}
	t.Run("Cases", func(t *testing.T) {
		for i, c := range corpus.Cases {
			t.Run(c.Name, func(t *testing.T) {
				got.Cases[i] = runLogsCorpusCase(t, c, corpus.Logs[c.Logs])
			})
		}
	})

	goldenPath := filepath.Join(simulatorCorpusDir, "logspipelines.golden.json")
	if *updateSimulatorCorpus {
		out, err := json.MarshalIndent(got, "", " ")
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(goldenPath, append(out, '\n'), 0o644))
	}

	data, err = os.ReadFile(goldenPath)
	require.NoError(t, err, "golden missing — generate it with -update")
	var want logsCorpusGolden
	require.NoError(t, json.Unmarshal(data, &want))

	got = roundTrip(t, got)
	assert.Equal(t, want.Inputs, got.Inputs)
	wantByName := map[string]logsCorpusResult{}
	for _, w := range want.Cases {
		wantByName[w.Name] = w
	}
	for _, g := range got.Cases {
		assert.Equal(t, wantByName[g.Name], g, "case %s", g.Name)
	}
	assert.Len(t, want.Cases, len(got.Cases), "golden has cases the corpus no longer lists; regenerate with -update")
}

func runLogsCorpusCase(t *testing.T, c logsCorpusCase, logs []model.SignozLog) logsCorpusResult {
	pipelines := corpusGettablePipelines(t, c)
	result := logsCorpusResult{Name: c.Name, LogSet: c.Logs}

	if len(pipelines) == 0 {
		out, _, err := SimulatePipelinesProcessing(context.Background(), pipelines, cloneSignozLogs(t, logs))
		require.NoError(t, err)
		result.Logs = out
		return result
	}

	outPLogs, collectorErrs, err := simulatePipelinesOnPLogs(context.Background(), pipelines, previewInputPLogs(cloneSignozLogs(t, logs)))
	if err != nil {
		typ, _, _, _, _, _ := errors.Unwrapb(err)
		result.Error = typ.String()
		if processors, names, ok := corpusCollectorProcessors(t, pipelines); ok {
			result.Collector = &logsCorpusCollect{Processors: processors, ProcessorNames: names, Rejected: true}
		}
		return result
	}
	canonical := canonicalOTLPLogRecords(t, outPLogs)
	result.Logs, _ = previewOutputLogs(outPLogs, collectorErrs)

	processors, names, ok := corpusCollectorProcessors(t, pipelines)
	require.True(t, ok, "case %s", c.Name)
	result.Collector = &logsCorpusCollect{
		Processors:     processors,
		ProcessorNames: names,
		Output:         canonical,
	}
	return result
}

func corpusGettablePipelines(t *testing.T, c logsCorpusCase) []pipelinetypes.GettablePipeline {
	pipelines := make([]pipelinetypes.GettablePipeline, 0, len(c.Pipelines))
	for i, p := range c.Pipelines {
		alias := p.Alias
		if alias == "" {
			alias = fmt.Sprintf("p%d", i+1)
		}
		enabled := p.Enabled == nil || *p.Enabled
		filter := p.Filter
		if filter == nil {
			filter = &v3.FilterSet{Operator: "AND", Items: []v3.FilterItem{{Key: v3.AttributeKey{Key: "body"}, Operator: v3.FilterOperatorExists}}}
		}

		ops := make([]pipelinetypes.PipelineOperator, 0, len(p.Config))
		for j, raw := range p.Config {
			var fields map[string]any
			require.NoError(t, json.Unmarshal(raw, &fields), "case %s", c.Name)
			if _, ok := fields["enabled"]; !ok {
				fields["enabled"] = true
			}
			if _, ok := fields["orderId"]; !ok {
				fields["orderId"] = j + 1
			}
			if _, ok := fields["id"]; !ok {
				fields["id"] = fmt.Sprintf("op%d", j+1)
			}
			withDefaults, err := json.Marshal(fields)
			require.NoError(t, err)
			var op pipelinetypes.PipelineOperator
			require.NoError(t, json.Unmarshal(withDefaults, &op), "case %s", c.Name)
			ops = append(ops, op)
		}

		pipelines = append(pipelines, pipelinetypes.GettablePipeline{
			StoreablePipeline: pipelinetypes.StoreablePipeline{OrderID: i + 1, Name: alias, Alias: alias, Enabled: enabled},
			Filter:            filter,
			Config:            ops,
		})
	}
	return pipelines
}

// corpusCollectorProcessors returns the processors the backend would deploy
// for the case, with the json_parser's random operator IDs numbered so the
// golden is stable, or false when the backend cannot build them.
func corpusCollectorProcessors(t *testing.T, pipelines []pipelinetypes.GettablePipeline) (map[string]any, []string, bool) {
	conf, err := GenerateCollectorConfigWithPipelines([]byte(corpusCollectorBaseConfig), pipelines)
	if err != nil {
		return nil, nil, false
	}

	seen := map[string]string{}
	stable := uuidPattern.ReplaceAllStringFunc(string(conf), func(id string) string {
		if _, ok := seen[id]; !ok {
			seen[id] = fmt.Sprintf("generated-%d", len(seen)+1)
		}
		return seen[id]
	})

	var parsed struct {
		Processors map[string]any `yaml:"processors"`
		Service    struct {
			Pipelines struct {
				Logs struct {
					Processors []string `yaml:"processors"`
				} `yaml:"logs"`
			} `yaml:"pipelines"`
		} `yaml:"service"`
	}
	require.NoError(t, yaml.Unmarshal([]byte(stable), &parsed))
	return parsed.Processors, parsed.Service.Pipelines.Logs.Processors, true
}

func otlpLogsJSON(t *testing.T, pl plog.Logs) map[string]any {
	raw, err := (&plog.JSONMarshaler{}).MarshalLogs(pl)
	require.NoError(t, err)
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

// canonicalOTLPLogRecords flattens OTLP/JSON into one object per record with
// the resource attributes inlined, key/value lists turned into objects and
// the observed timestamp dropped, ordered by input position. The
// simulatorcontract integration suite applies the same rules to the
// collector's output.
func canonicalOTLPLogRecords(t *testing.T, logs []plog.Logs) []map[string]any {
	records := []map[string]any{}
	for _, pl := range logs {
		doc := otlpLogsJSON(t, pl)
		resourceLogs, _ := doc["resourceLogs"].([]any)
		for _, rl := range resourceLogs {
			rlMap := rl.(map[string]any)
			resource, _ := rlMap["resource"].(map[string]any)
			scopeLogs, _ := rlMap["scopeLogs"].([]any)
			for _, sl := range scopeLogs {
				logRecords, _ := sl.(map[string]any)["logRecords"].([]any)
				for _, lr := range logRecords {
					record := map[string]any{}
					for k, v := range lr.(map[string]any) {
						switch k {
						case "observedTimeUnixNano":
						case "attributes":
							record[k] = canonicalKeyValues(v)
						case "body":
							record[k] = canonicalAnyValue(v)
						default:
							record[k] = v
						}
					}
					record["resource"] = canonicalKeyValues(resource["attributes"])
					records = append(records, record)
				}
			}
		}
	}
	sort.SliceStable(records, func(i, j int) bool {
		if a, b := corpusInputIndex(records[i]), corpusInputIndex(records[j]); a != b {
			return a < b
		}
		return corpusRecordKey(t, records[i]) < corpusRecordKey(t, records[j])
	})
	return records
}

func corpusRecordKey(t *testing.T, record map[string]any) string {
	data, err := json.Marshal(record)
	require.NoError(t, err)
	return string(data)
}

// corpusInputIndex places records that lost the input index attribute last.
func corpusInputIndex(record map[string]any) int64 {
	attributes, _ := record["attributes"].(map[string]any)
	value, _ := attributes[inputOrderAttribute].(map[string]any)
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

func cloneSignozLogs(t *testing.T, logs []model.SignozLog) []model.SignozLog {
	data, err := json.Marshal(logs)
	require.NoError(t, err)
	var out []model.SignozLog
	require.NoError(t, json.Unmarshal(data, &out))
	return out
}

func roundTrip(t *testing.T, golden logsCorpusGolden) logsCorpusGolden {
	data, err := json.Marshal(golden)
	require.NoError(t, err)
	var out logsCorpusGolden
	require.NoError(t, json.Unmarshal(data, &out))
	return out
}
