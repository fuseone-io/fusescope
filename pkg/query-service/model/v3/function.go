package v3

import (
	signozerrors "github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
)

func (f Function) FirstNumericArg() (float64, error) {
	if len(f.Args) == 0 {
		return 0, signozerrors.NewInvalidInputf(qbtypes.ErrCodeInvalidFunctionArg, "function %s requires an argument", f.Name)
	}
	return qbtypes.ParseFunctionArgNumber(f.Args[0])
}

// validateArgs rewrites the first argument of numeric functions to float64,
// which later stages assume.
func (f *Function) validateArgs() error {
	var param string
	switch f.Name {
	case FunctionNameTimeShift:
		param = "timeShiftBy"
	case FunctionNameEWMA3, FunctionNameEWMA5, FunctionNameEWMA7:
		param = "alpha"
	case FunctionNameCutOffMax, FunctionNameCutOffMin, FunctionNameClampMax, FunctionNameClampMin:
		param = "threshold"
	default:
		return nil
	}

	if len(f.Args) == 0 {
		return signozerrors.NewInvalidInputf(qbtypes.ErrCodeInvalidFunctionArg, "%s param missing in query", param)
	}
	value, err := f.FirstNumericArg()
	if err != nil {
		return signozerrors.NewInvalidInputf(qbtypes.ErrCodeInvalidFunctionArg, "%s param of function %s should be a number", param, f.Name).WithAdditional(err.Error())
	}
	if param == "alpha" && (value < 0 || value > 1) {
		return signozerrors.NewInvalidInputf(qbtypes.ErrCodeInvalidFunctionArg, "alpha param should be between 0 and 1")
	}
	f.Args[0] = value
	return nil
}
