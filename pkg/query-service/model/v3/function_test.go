package v3

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuilderQueryValidate_FunctionArgs(t *testing.T) {
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
		args    []interface{}
		want    float64
		wantErr bool
	}{
		{name: "BareNumber", args: []interface{}{0.5}, want: 0.5},
		{name: "NumericString", args: []interface{}{"0.25"}, want: 0.25},
		{name: "ObjectWithNumber", args: []interface{}{map[string]interface{}{"value": 0.75}}, want: 0.75},
		{name: "ObjectWithNumericString", args: []interface{}{map[string]interface{}{"value": "1"}}, want: 1},
		{name: "Null", args: []interface{}{nil}, wantErr: true},
		{name: "MissingArg", args: nil, wantErr: true},
		{name: "Bool", args: []interface{}{true}, wantErr: true},
		{name: "NestedArray", args: []interface{}{[]interface{}{[]interface{}{0.5}}}, wantErr: true},
		{name: "NonNumericString", args: []interface{}{"abc"}, wantErr: true},
	}

	for _, name := range numericFunctions {
		for _, testCase := range testCases {
			t.Run(string(name)+"_"+testCase.name, func(t *testing.T) {
				query := &BuilderQuery{
					QueryName:  "F1",
					Expression: "A + B",
					Functions:  []Function{{Name: name, Args: testCase.args}},
				}
				var err error
				require.NotPanics(t, func() { err = query.Validate(PanelTypeGraph) })
				if testCase.wantErr {
					require.Error(t, err)
					assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
					return
				}
				require.NoError(t, err)
				require.Len(t, query.Functions[0].Args, 1)
				assert.Equal(t, testCase.want, query.Functions[0].Args[0])
			})
		}
	}
}

func TestBuilderQueryValidate_EWMAAlphaOutOfRange(t *testing.T) {
	testCases := []struct {
		name string
		arg  interface{}
	}{
		{name: "BareNumber", arg: 1.5},
		{name: "NumericString", arg: "-0.1"},
		{name: "ObjectWithNumber", arg: map[string]interface{}{"value": 2.0}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			query := &BuilderQuery{
				QueryName:  "F1",
				Expression: "A + B",
				Functions:  []Function{{Name: FunctionNameEWMA5, Args: []interface{}{testCase.arg}}},
			}
			err := query.Validate(PanelTypeGraph)
			require.Error(t, err)
			assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
		})
	}
}

func TestBuilderQuerySetShiftByFromFunc(t *testing.T) {
	testCases := []struct {
		name string
		args []interface{}
		want int64
	}{
		{name: "BareNumber", args: []interface{}{3600.0}, want: 3600},
		{name: "NumericString", args: []interface{}{"60"}, want: 60},
		{name: "ObjectWithNumber", args: []interface{}{map[string]interface{}{"value": 86400.0}}, want: 86400},
		{name: "Bool", args: []interface{}{true}, want: 0},
		{name: "MissingArg", args: nil, want: 0},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			query := &BuilderQuery{Functions: []Function{{Name: FunctionNameAbsolute}, {Name: FunctionNameTimeShift, Args: testCase.args}}}
			require.NotPanics(t, query.SetShiftByFromFunc)
			assert.Equal(t, testCase.want, query.ShiftBy)
			assert.Equal(t, FunctionNameTimeShift, query.Functions[0].Name)
		})
	}
}
