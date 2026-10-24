package pipelineexpr

import (
	"testing"

	"github.com/expr-lang/expr/vm"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/entry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompile(t *testing.T) {
	testCases := []struct {
		name         string
		expression   string
		wantValue    any
		wantRefsBody bool
	}{
		{name: "StringConcat", expression: `attributes.level + "-" + severity_text`, wantValue: "warn-WARN"},
		{name: "Number", expression: `len(attributes.level) * 2`, wantValue: 8},
		{name: "BodyField", expression: `body.msg`, wantValue: "hi", wantRefsBody: true},
		{name: "UndefinedIsNil", expression: `attributes.absent`, wantValue: nil},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			program, refsBody, err := Compile(testCase.expression)
			require.NoError(t, err)

			e := entry.New()
			e.Body = `{"msg":"hi"}`
			e.Attributes = map[string]any{"level": "warn"}
			e.SeverityText = "WARN"
			got, err := vm.Run(program, Env(e, refsBody))
			require.NoError(t, err)
			assert.Equal(t, testCase.wantValue, got)
			assert.Equal(t, testCase.wantRefsBody, refsBody)
		})
	}
}

func TestForgetParsedBody(t *testing.T) {
	program, refsBody, err := CompileBool(`body.msg == "hi"`)
	require.NoError(t, err)
	e := entry.New()
	e.Body = `{"msg":"hi"}`
	_, err = vm.Run(program, Env(e, refsBody))
	require.NoError(t, err)
	require.Contains(t, e.Attributes, parsedBodyAttribute)

	ForgetParsedBody(e)
	assert.NotContains(t, e.Attributes, parsedBodyAttribute)
}
