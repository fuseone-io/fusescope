package pipelineexpr

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/expr-lang/expr/vm"
	signozstanzahelper "github.com/fuseone-io/fusescope-otel-collector/processor/signozlogspipelineprocessor/stanza/operator/helper"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/entry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var updateCorpus = flag.Bool("update", false, "rewrite the expression corpus golden file")

type corpusCase struct {
	CompileError string                  `json:"compileError,omitempty"`
	RefsBody     bool                    `json:"refsBody,omitempty"`
	Results      map[string]corpusResult `json:"results,omitempty"`
}

type corpusResult struct {
	Value           json.RawMessage `json:"value,omitempty"`
	Error           bool            `json:"error,omitempty"`
	AddedAttributes []string        `json:"addedAttributes,omitempty"`
}

func corpusEntries() map[string]func() *entry.Entry {
	newEntry := func(body any, attributes, resource map[string]any) *entry.Entry {
		e := entry.New()
		e.Body = body
		e.Attributes = attributes
		e.Resource = resource
		e.Timestamp = time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC)
		return e
	}

	return map[string]func() *entry.Entry{
		"JSONObject": func() *entry.Entry {
			e := newEntry(
				`{"msg":"hello world","n":1,"f":1.5,"big":12345678901234567890,"t":"2024-01-02T03:04:05Z","o":{"p":"q","a.b":{"c":"d"}},"arr":[1,"two",{"k":"v"}]}`,
				map[string]any{
					"level": "info",
					"count": int64(5),
					"ts":    "1700000000",
					"tsf":   "1700000000.123",
					"test":  map[string]any{"a.b": map[string]any{"value": map[string]any{"c.d": map[string]any{"e": "x"}}}},
				},
				map[string]any{"service.name": "checkout", "env": "prod"},
			)
			e.TraceID = []byte{0x01, 0x02}
			e.SpanID = []byte{0x03}
			e.TraceFlags = []byte{0x01}
			e.Severity = entry.Info
			e.SeverityText = "INFO"
			return e
		},
		"JSONObjectPadded": func() *entry.Entry {
			return newEntry("  {\"msg\":\"padded\"}\n", map[string]any{"level": "error"}, map[string]any{"env": "dev"})
		},
		"JSONArray":   func() *entry.Entry { return newEntry(`[1,2]`, map[string]any{}, map[string]any{}) },
		"JSONString":  func() *entry.Entry { return newEntry(`"quoted \"str\""`, map[string]any{}, map[string]any{}) },
		"JSONNumber":  func() *entry.Entry { return newEntry(`12`, map[string]any{"level": float64(3)}, map[string]any{}) },
		"JSONNull":    func() *entry.Entry { return newEntry(`null`, map[string]any{}, map[string]any{}) },
		"InvalidJSON": func() *entry.Entry { return newEntry(`{"msg": broken`, map[string]any{}, map[string]any{}) },
		"EmptyString": func() *entry.Entry { return newEntry(``, map[string]any{}, map[string]any{}) },
		"PlainText": func() *entry.Entry {
			e := newEntry(`checkout failed: 10.0.0.1 ERROR`, map[string]any{"level": int64(17)}, map[string]any{"service.name": "payment"})
			e.Severity = entry.Error
			e.SeverityText = "ERROR"
			return e
		},
		"MapBody": func() *entry.Entry {
			return newEntry(map[string]any{"msg": "from map", "n": int64(2), "o": map[string]any{"p": "q"}}, map[string]any{"level": "warn"}, map[string]any{})
		},
		"BytesJSON":     func() *entry.Entry { return newEntry([]byte(`{"msg":"bytes"}`), map[string]any{}, map[string]any{}) },
		"BytesText":     func() *entry.Entry { return newEntry([]byte(`raw bytes`), map[string]any{}, map[string]any{}) },
		"IntBody":       func() *entry.Entry { return newEntry(int64(42), map[string]any{}, map[string]any{}) },
		"NilEverything": func() *entry.Entry { return newEntry(nil, nil, nil) },
		"JSONObjectNilAttributes": func() *entry.Entry {
			return newEntry(`{"msg":"no attributes"}`, nil, nil)
		},
		"JSONObjectParsedBefore": func() *entry.Entry {
			return newEntry(`{"msg":"raw"}`, map[string]any{"__signozlogspipelineprocessor_internal__parsedBodyJson": map[string]any{"msg": "parsed before"}}, map[string]any{})
		},
	}
}

func corpusExpressions() []string {
	return []string{
		// body field references
		`body.msg == "hello world"`,
		`body?.msg != nil`,
		`body["msg"] != nil`,
		`body.o.p == "q"`,
		`body.o["a.b"].c == "d"`,
		`body.o != nil && body.o["a.b"]?.c != nil`,
		`body.arr != nil && len(body.arr) > 2 && body.arr[2] != nil`,
		`body.arr[1] == "two"`,
		`type(body.n) == "float"`,
		`body.n == 1`,
		`body.n + 1 == 2`,
		`body.n == body["n"]`,
		`body.big > 1e19`,
		`body.f == 1.5`,
		`body.msg`,
		`body.missing == nil`,
		`body.msg.x == nil`,
		`let m = body.msg; m != nil`,
		`any(body.arr ?? [], {# == 1})`,
		`toJSON(body.o) != ""`,
		`body?.msg != nil && "__signozlogspipelineprocessor_internal__parsedBodyJson" in attributes`,
		// body as a whole
		`body == "checkout failed: 10.0.0.1 ERROR"`,
		`$ == body`,
		`$.msg != nil`,
		`"msg" in body`,
		`type(body) == "string"`,
		`type(body) == "map"`,
		`type(body)`,
		`isJSON(body)`,
		`unquote(body) == "quoted \"str\""`,
		`unquote(body) == body`,
		`fromJSON(body).msg == "hello world"`,
		`body matches "ERROR$"`,
		`body != nil && lower(body) contains lower("CHECKOUT")`,
		// attributes and resource
		`attributes.level == "info"`,
		`attributes["level"] in ["info", "error"]`,
		`attributes.count > 3`,
		`attributes.count == 5`,
		`string(attributes.count) == "5"`,
		`"level" in attributes`,
		`len(attributes) == 0`,
		`"service.name" in resource && resource["service.name"] == "checkout"`,
		`resource.env == "prod" and attributes.level != "debug"`,
		`attributes.test != nil && attributes.test["a.b"]?.value != nil && attributes.test["a.b"].value["c.d"]?.e != nil`,
		// other top-level fields
		`trace_id != nil`,
		`span_id == nil`,
		`trace_flags != nil`,
		`severity_number == 9`,
		`severity_text == "ERROR"`,
		`timestamp.Year() == 2024`,
		`now() > timestamp`,
		`env("FUSESCOPE_PIPELINEEXPR_CORPUS") == "set"`,
		`undefined_var == nil`,
		`undefined_var.x == nil`,
		// shapes generated by the pipeline builder and the filter translator
		`attributes?.level != nil && ( type(attributes.level) == "string" || ( type(attributes.level) in ["int", "float"] && attributes.level == float(int(attributes.level)) ) )`,
		`attributes?.ts != nil && string(attributes.ts) matches "^\\s*[0-9]+\\s*$"`,
		`attributes?.tsf != nil && string(attributes.tsf) matches "^\\s*[0-9]+\\.[0-9]+\\s*$"`,
		`body?.t != nil && body.t matches "[0-9]{4}-[0-9]{2}-[0-9]{2}"`,
		`body != nil && body matches "(?P<ip>\\d+\\.\\d+\\.\\d+\\.\\d+)"`,
		`((type(body) == "string" && isJSON(body)) && "msg" in fromJSON(body)) or (type(body) == "map" && (body.msg != nil))`,
		`((type(body) == "string" && isJSON(body)) && "missing" not in fromJSON(body)) or (type(body) == "map" && (body.missing == nil))`,
		// compile errors
		`"x"`,
		`1 +`,
	}
}

func TestCorpus(t *testing.T) {
	t.Setenv("FUSESCOPE_PIPELINEEXPR_CORPUS", "set")

	got := map[string]corpusCase{}
	for _, expression := range corpusExpressions() {
		got[expression] = evaluateCorpusCase(t, expression, corpusEntries())
	}

	path := filepath.Join("testdata", "corpus.golden.json")
	if *updateCorpus {
		data, err := json.MarshalIndent(got, "", "  ")
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(path, append(data, '\n'), 0o644))
	}

	data, err := os.ReadFile(path)
	require.NoError(t, err, "golden missing — generate it with -update")
	var want map[string]corpusCase
	require.NoError(t, json.Unmarshal(data, &want))

	for _, expression := range corpusExpressions() {
		assert.Equal(t, want[expression], got[expression], "expression %s", expression)
	}
	assert.Len(t, want, len(got), "golden has cases the corpus no longer lists; regenerate with -update")
}

func evaluateCorpusCase(t *testing.T, expression string, entries map[string]func() *entry.Entry) corpusCase {
	program, refsBody, _, err := signozstanzahelper.ExprCompileBool(expression)
	if err != nil {
		return corpusCase{CompileError: err.Error()}
	}

	results := map[string]corpusResult{}
	for name, newEntry := range entries {
		e := newEntry()
		before := attributeKeys(e)

		var out any
		runErr := signozstanzahelper.RunWithExprEnv(e, refsBody, nil, func(env map[string]any) error {
			var err error
			out, err = vm.Run(program, env)
			return err
		})

		result := corpusResult{}
		if runErr != nil {
			result.Error = true
		} else {
			value, err := json.Marshal(out)
			require.NoError(t, err)
			result.Value = value
		}
		for _, key := range attributeKeys(e) {
			if !slices.Contains(before, key) {
				result.AddedAttributes = append(result.AddedAttributes, key)
			}
		}
		results[name] = result
	}

	return corpusCase{RefsBody: refsBody, Results: results}
}

func attributeKeys(e *entry.Entry) []string {
	keys := make([]string, 0, len(e.Attributes))
	for key := range e.Attributes {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}
