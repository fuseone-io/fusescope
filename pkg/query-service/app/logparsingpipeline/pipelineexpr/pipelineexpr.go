// Package pipelineexpr compiles and evaluates log pipeline expressions in the
// environment the collector's logs pipeline processor gives them, so the
// backend sees the same results as the collector.
package pipelineexpr

import (
	"encoding/json"
	"os"
	"strconv"

	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/vm"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/entry"
)

// parsedBodyAttribute caches a string or []byte body parsed as a JSON object
// in the entry's attributes; the collector reads and writes the same key.
const parsedBodyAttribute = "__signozlogspipelineprocessor_internal__parsedBodyJson"

const (
	bodyIdentifier       = "body"
	bodyFieldsIdentifier = "body_map"
	envFunction          = "env"
	envFunctionVariable  = "os_env_func"
)

// CompileBool compiles a boolean pipeline expression. Undefined variables
// evaluate to nil. Member access on body (body.a, body?.a, body["a"]) reads
// the body as a JSON object, and refsBodyFields reports whether the
// expression does so; pass it on to Env.
func CompileBool(input string) (program *vm.Program, refsBodyFields bool, err error) {
	return compile(input, expr.AsBool())
}

// Compile compiles a pipeline expression of any result type, such as the
// value of an add operator, with the same rules as CompileBool.
func Compile(input string) (program *vm.Program, refsBodyFields bool, err error) {
	return compile(input)
}

func compile(input string, options ...expr.Option) (*vm.Program, bool, error) {
	bodyFields := &bodyFieldsPatcher{}
	options = append([]expr.Option{
		expr.AllowUndefinedVariables(),
		expr.Patch(envFunctionPatcher{}),
		expr.Patch(bodyFields),
	}, options...)
	program, err := expr.Compile(input, options...)
	if err != nil {
		return nil, false, err
	}
	return program, bodyFields.found, nil
}

// Env returns the variables a program compiled by CompileBool runs with.
// When refsBodyFields is set, a string or []byte body is parsed as a JSON
// object and cached in the entry's attributes. Nil attributes are created for
// the cache, but the returned env keeps them nil.
func Env(e *entry.Entry, refsBodyFields bool) map[string]any {
	env := map[string]any{
		envFunctionVariable: os.Getenv,
		"isJSON":            isJSON,
		"unquote":           unquote,
		"$":                 e.Body,
		bodyIdentifier:      e.Body,
		"attributes":        e.Attributes,
		"resource":          e.Resource,
		"timestamp":         e.Timestamp,
		"severity_text":     e.SeverityText,
		"severity_number":   int(e.Severity),
		"trace_id":          e.TraceID,
		"span_id":           e.SpanID,
		"trace_flags":       e.TraceFlags,
	}
	if refsBodyFields {
		env[bodyFieldsIdentifier] = bodyFields(e)
	}
	return env
}

type envFunctionPatcher struct{}

func (envFunctionPatcher) Visit(node *ast.Node) {
	call, ok := (*node).(*ast.CallNode)
	if !ok {
		return
	}
	if callee, ok := call.Callee.(*ast.IdentifierNode); ok && callee.Value == envFunction {
		callee.Value = envFunctionVariable
	}
}

type bodyFieldsPatcher struct {
	found bool
}

func (p *bodyFieldsPatcher) Visit(node *ast.Node) {
	member, ok := (*node).(*ast.MemberNode)
	if !ok {
		return
	}
	if target, ok := member.Node.(*ast.IdentifierNode); ok && target.Value == bodyIdentifier {
		target.Value = bodyFieldsIdentifier
		p.found = true
	}
}

func bodyFields(e *entry.Entry) map[string]any {
	var raw []byte
	switch body := e.Body.(type) {
	case map[string]any:
		return body
	case string:
		raw = []byte(body)
	case []byte:
		raw = body
	default:
		return nil
	}

	if cached, ok := e.Attributes[parsedBodyAttribute].(map[string]any); ok {
		return cached
	}

	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil
	}
	if e.Attributes == nil {
		e.Attributes = map[string]any{}
	}
	e.Attributes[parsedBodyAttribute] = fields
	return fields
}

func isJSON(value any) bool {
	switch v := value.(type) {
	case string:
		return json.Valid([]byte(v))
	case []byte:
		return json.Valid(v)
	default:
		return false
	}
}

// unquote returns a string without its Go string quotes, or unchanged when it
// is not a quoted literal. Any other type, nil included, is an error.
func unquote(value any) (string, error) {
	s, ok := value.(string)
	if !ok {
		return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "unquote expects a string, got %T", value)
	}
	unquoted, err := strconv.Unquote(s)
	if err != nil {
		return s, nil
	}
	return unquoted, nil
}

// ForgetParsedBody removes the parsed body that Env caches in the entry's
// attributes.
func ForgetParsedBody(e *entry.Entry) {
	delete(e.Attributes, parsedBodyAttribute)
}
