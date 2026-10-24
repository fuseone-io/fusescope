package pipelinesim

import (
	"bytes"
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/entry"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/helper"
	"go.opentelemetry.io/collector/component"
)

const (
	normalizedMessageKey = "message"
	shortMessageKey      = "msg"
)

type jsonConfig struct {
	helper.ParserConfig `mapstructure:",squash"`
	EnableFlattening    bool   `mapstructure:"enable_flattening"`
	MaxFlatteningDepth  int    `mapstructure:"max_flattening_depth"`
	EnablePaths         bool   `mapstructure:"enable_paths"`
	PathPrefix          string `mapstructure:"path_prefix"`
}

func newJSONConfig() operator.Builder {
	return &jsonConfig{ParserConfig: helper.NewParserConfig("json_parser", "json_parser")}
}

func (c jsonConfig) Build(set component.TelemetrySettings) (operator.Operator, error) {
	parser, err := c.ParserConfig.Build(set)
	if err != nil {
		return nil, err
	}
	return &jsonOperator{ParserOperator: parser, config: c}, nil
}

// jsonOperator parses a JSON object, or takes a map as it is. Flattening
// lifts the members of nested objects up to MaxFlatteningDepth levels, named
// by their path when paths are enabled; members that were already at the
// top keep their value over lifted ones.
type jsonOperator struct {
	helper.ParserOperator
	config jsonConfig
}

func (o *jsonOperator) Process(ctx context.Context, e *entry.Entry) error {
	return o.ProcessWith(ctx, e, o.parse)
}

func (o *jsonOperator) ProcessBatch(ctx context.Context, entries []*entry.Entry) error {
	return o.ProcessBatchWith(ctx, entries, o.parse)
}

func (o *jsonOperator) parse(value any) (any, error) {
	var parsed map[string]any
	switch v := value.(type) {
	case string:
		if err := json.Unmarshal([]byte(v), &parsed); err != nil {
			return nil, err
		}
	case []byte:
		if err := json.Unmarshal(v, &parsed); err != nil {
			return nil, err
		}
	case map[string]any:
		parsed = v
	default:
		return nil, errors.NewInvalidInputf(codeUnparsable, "type %T cannot be parsed as JSON", value)
	}

	if !o.config.EnableFlattening {
		return parsed, nil
	}
	prefix := ""
	if o.config.EnablePaths {
		prefix = o.config.PathPrefix
	}
	return o.flatten(parsed, 0, prefix), nil
}

func (o *jsonOperator) flatten(m map[string]any, depth int, prefix string) map[string]any {
	out := make(map[string]any, len(m))
	lifted := []string{}
	for k, v := range m {
		if _, isMap := v.(map[string]any); isMap && depth < o.config.MaxFlatteningDepth {
			lifted = append(lifted, k)
			continue
		}
		out[o.path(prefix, k)] = v
	}

	sort.Strings(lifted)
	for _, k := range lifted {
		childPrefix := prefix
		if o.config.EnablePaths {
			childPrefix = o.path(prefix, k)
		}
		for ck, cv := range o.flatten(m[k].(map[string]any), depth+1, childPrefix) {
			if _, exists := out[ck]; !exists {
				out[ck] = cv
			}
		}
	}
	return out
}

func (o *jsonOperator) path(prefix, key string) string {
	if !o.config.EnablePaths || prefix == "" {
		return key
	}
	return prefix + "." + key
}

type normalizeConfig struct {
	helper.TransformerConfig `mapstructure:",squash"`
}

func newNormalizeConfig() operator.Builder {
	return &normalizeConfig{TransformerConfig: helper.NewTransformerConfig("normalize", "normalize")}
}

func (c normalizeConfig) Build(set component.TelemetrySettings) (operator.Operator, error) {
	transformer, err := c.TransformerConfig.Build(set)
	if err != nil {
		return nil, err
	}
	return &normalizeOperator{TransformerOperator: transformer}, nil
}

// normalizeOperator turns the body into a map: a string holding a JSON
// object becomes that object with msg renamed to message, anything else
// becomes {"message": body}. Map bodies are kept.
type normalizeOperator struct {
	helper.TransformerOperator
}

func (o *normalizeOperator) Process(ctx context.Context, e *entry.Entry) error {
	return o.ProcessWith(ctx, e, normalizeBody)
}

func (o *normalizeOperator) ProcessBatch(ctx context.Context, entries []*entry.Entry) error {
	return o.ProcessBatchWith(ctx, entries, o.Process)
}

func normalizeBody(e *entry.Entry) error {
	switch body := e.Body.(type) {
	case map[string]any:
		return nil
	case string:
		if object, ok := jsonObject(body); ok {
			if msg, hasMsg := object[shortMessageKey]; hasMsg {
				if _, hasMessage := object[normalizedMessageKey]; !hasMessage {
					delete(object, shortMessageKey)
					object[normalizedMessageKey] = msg
				}
			}
			e.Body = object
			return nil
		}
	}
	e.Body = map[string]any{normalizedMessageKey: e.Body}
	return nil
}

// jsonObject parses s when it is exactly a JSON object, with no surrounding
// whitespace. Integers become int64 and other numbers float64.
func jsonObject(s string) (map[string]any, bool) {
	if !strings.HasPrefix(s, "{") || !strings.HasSuffix(s, "}") {
		return nil, false
	}
	decoder := json.NewDecoder(bytes.NewReader([]byte(s)))
	decoder.UseNumber()
	var object map[string]any
	if err := decoder.Decode(&object); err != nil || decoder.More() {
		return nil, false
	}
	return convertNumbers(object).(map[string]any), true
}

func convertNumbers(value any) any {
	switch v := value.(type) {
	case json.Number:
		if i, err := v.Int64(); err == nil {
			return i
		}
		f, _ := v.Float64()
		return f
	case map[string]any:
		for k, item := range v {
			v[k] = convertNumbers(item)
		}
		return v
	case []any:
		for i, item := range v {
			v[i] = convertNumbers(item)
		}
		return v
	default:
		return v
	}
}
