package pipelinesim

import (
	"context"
	"strings"

	"github.com/expr-lang/expr/vm"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/grok"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/logparsingpipeline/pipelineexpr"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/entry"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/helper"
	"go.opentelemetry.io/collector/component"
)

var (
	codeMissingField   = errors.MustNewCode("logs_pipeline_missing_field")
	codeUnparsable     = errors.MustNewCode("logs_pipeline_unparsable_value")
	codeExprEvaluation = errors.MustNewCode("logs_pipeline_expr_evaluation")
)

type addConfig struct {
	helper.TransformerConfig `mapstructure:",squash"`
	Field                    entry.Field `mapstructure:"field"`
	Value                    any         `mapstructure:"value"`
}

func newAddConfig() operator.Builder {
	return &addConfig{TransformerConfig: helper.NewTransformerConfig("add", "add")}
}

func (c addConfig) Build(set component.TelemetrySettings) (operator.Operator, error) {
	transformer, err := c.TransformerConfig.Build(set)
	if err != nil {
		return nil, err
	}
	op := &addOperator{TransformerOperator: transformer, field: c.Field, value: c.Value}
	if s, ok := c.Value.(string); ok && strings.HasPrefix(s, "EXPR(") && strings.HasSuffix(s, ")") {
		program, refsBody, err := pipelineexpr.Compile(strings.TrimSuffix(strings.TrimPrefix(s, "EXPR("), ")"))
		if err != nil {
			return nil, err
		}
		op.program, op.refsBody = program, refsBody
	}
	if op.program == nil && c.Value == nil {
		return nil, errors.NewInvalidInputf(codeMissingField, "add: missing required field 'value'")
	}
	return op, nil
}

type addOperator struct {
	helper.TransformerOperator
	field    entry.Field
	value    any
	program  *vm.Program
	refsBody bool
}

func (o *addOperator) Process(ctx context.Context, e *entry.Entry) error {
	return o.ProcessWith(ctx, e, o.transform)
}

func (o *addOperator) ProcessBatch(ctx context.Context, entries []*entry.Entry) error {
	return o.ProcessBatchWith(ctx, entries, o.Process)
}

func (o *addOperator) transform(e *entry.Entry) error {
	if o.program == nil {
		return e.Set(o.field, o.value)
	}
	result, err := vm.Run(o.program, pipelineexpr.Env(e, o.refsBody))
	if err != nil {
		return errors.WrapInvalidInputf(err, codeExprEvaluation, "evaluate value expression")
	}
	return e.Set(o.field, result)
}

type grokConfig struct {
	helper.ParserConfig `mapstructure:",squash"`
	Pattern             string `mapstructure:"pattern"`
}

func newGrokConfig() operator.Builder {
	return &grokConfig{ParserConfig: helper.NewParserConfig("grok_parser", "grok_parser")}
}

func (c grokConfig) Build(set component.TelemetrySettings) (operator.Operator, error) {
	parser, err := c.ParserConfig.Build(set)
	if err != nil {
		return nil, err
	}
	if c.Pattern == "" {
		return nil, errors.NewInvalidInputf(codeMissingField, "grok_parser: missing required field 'pattern'")
	}
	g, err := grok.NewWithConfig(&grok.Config{NamedCapturesOnly: true})
	if err != nil {
		return nil, err
	}
	return &grokOperator{ParserOperator: parser, grok: g, pattern: c.Pattern}, nil
}

// grokOperator sets parse_to to the named captures, an empty map when the
// pattern does not match; a mismatch is not an error.
type grokOperator struct {
	helper.ParserOperator
	grok    *grok.Grok
	pattern string
}

func (o *grokOperator) Process(ctx context.Context, e *entry.Entry) error {
	return o.ProcessWith(ctx, e, o.parse)
}

func (o *grokOperator) ProcessBatch(ctx context.Context, entries []*entry.Entry) error {
	return o.ProcessBatchWith(ctx, entries, o.parse)
}

func (o *grokOperator) parse(value any) (any, error) {
	text, ok := value.(string)
	if !ok {
		return nil, errors.NewInvalidInputf(codeUnparsable, "type %T cannot be parsed with grok", value)
	}
	return o.grok.ParseTyped(o.pattern, text)
}
