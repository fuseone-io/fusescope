package querybuildertypesv5

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseFunctionArgNumber(t *testing.T) {
	testCases := []struct {
		name    string
		value   any
		want    float64
		wantErr bool
	}{
		{name: "Float", value: 3600.0, want: 3600},
		{name: "Int", value: 60, want: 60},
		{name: "Int64", value: int64(-120), want: -120},
		{name: "NumericString", value: "0.5", want: 0.5},
		{name: "ObjectWithNumber", value: map[string]any{"value": 86400.0}, want: 86400},
		{name: "ObjectWithNumericString", value: map[string]any{"name": "shift", "value": "604800"}, want: 604800},
		{name: "NonNumericString", value: "1h", wantErr: true},
		{name: "EmptyString", value: "", wantErr: true},
		{name: "NaNString", value: "NaN", wantErr: true},
		{name: "InfString", value: "+Inf", wantErr: true},
		{name: "Null", value: nil, wantErr: true},
		{name: "Bool", value: true, wantErr: true},
		{name: "NestedArray", value: []any{[]any{1.0}}, wantErr: true},
		{name: "ObjectWithoutValue", value: map[string]any{"name": "x"}, wantErr: true},
		{name: "ObjectWithNullValue", value: map[string]any{"value": nil}, wantErr: true},
		{name: "ObjectWithNestedObject", value: map[string]any{"value": map[string]any{"value": 1.0}}, wantErr: true},
		{name: "ObjectWithBool", value: map[string]any{"value": false}, wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var got float64
			var err error
			require.NotPanics(t, func() { got, err = ParseFunctionArgNumber(testCase.value) })
			if testCase.wantErr {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}

func TestFunctionValidateArgs_MalformedArgs(t *testing.T) {
	numericFunctions := []FunctionName{
		FunctionNameTimeShift,
		FunctionNameEWMA3,
		FunctionNameEWMA5,
		FunctionNameEWMA7,
		FunctionNameClampMin,
		FunctionNameClampMax,
		FunctionNameCutOffMin,
		FunctionNameCutOffMax,
	}
	testCases := []struct {
		name    string
		args    []FunctionArg
		wantErr bool
	}{
		{name: "BareNumber", args: []FunctionArg{{Value: 0.5}}},
		{name: "NumericString", args: []FunctionArg{{Value: "0.5"}}},
		{name: "ObjectWithNumber", args: []FunctionArg{{Value: map[string]any{"value": 0.5}}}},
		{name: "ObjectWithNumericString", args: []FunctionArg{{Value: map[string]any{"value": "0.5"}}}},
		{name: "Null", args: []FunctionArg{{Value: nil}}, wantErr: true},
		{name: "Bool", args: []FunctionArg{{Value: true}}, wantErr: true},
		{name: "NestedArray", args: []FunctionArg{{Value: []any{[]any{0.5}}}}, wantErr: true},
	}

	for _, name := range numericFunctions {
		for _, testCase := range testCases {
			t.Run(name.StringValue()+"_"+testCase.name, func(t *testing.T) {
				fn := Function{Name: name, Args: testCase.args}
				var err error
				require.NotPanics(t, func() { err = fn.ValidateArgs() })
				if testCase.wantErr {
					require.Error(t, err)
					assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
					return
				}
				assert.NoError(t, err)
			})
		}
	}
}

func TestApplyFunction_ObjectArgs(t *testing.T) {
	testCases := []struct {
		name  string
		fn    Function
		input []float64
		want  []float64
	}{
		{
			name:  "ClampMax_ObjectWithNumber",
			fn:    Function{Name: FunctionNameClampMax, Args: []FunctionArg{{Value: map[string]any{"value": 2.0}}}},
			input: []float64{1, 3},
			want:  []float64{1, 2},
		},
		{
			name:  "ClampMin_ObjectWithNumericString",
			fn:    Function{Name: FunctionNameClampMin, Args: []FunctionArg{{Value: map[string]any{"value": "2"}}}},
			input: []float64{1, 3},
			want:  []float64{2, 3},
		},
		{
			name:  "ClampMin_Bool_Unchanged",
			fn:    Function{Name: FunctionNameClampMin, Args: []FunctionArg{{Value: true}}},
			input: []float64{1, 3},
			want:  []float64{1, 3},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var result *TimeSeries
			require.NotPanics(t, func() { result = ApplyFunction(testCase.fn, createTestTimeSeriesData(testCase.input)) })
			assert.Equal(t, testCase.want, extractValues(result))
		})
	}
}
