package querybuildertypesv5

import (
	"math"
	"strconv"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeInvalidFunctionArg = errors.MustNewCode("invalid_function_arg")

// ParseFunctionArgNumber accepts a number, a numeric string, or an object
// `{"value": number | numeric string}`. Non-finite values are rejected.
func ParseFunctionArgNumber(value any) (float64, error) {
	if obj, ok := value.(map[string]any); ok {
		inner, ok := obj["value"]
		if !ok {
			return 0, errors.NewInvalidInputf(ErrCodeInvalidFunctionArg, "function argument object must have a `value` field")
		}
		if _, nested := inner.(map[string]any); nested {
			return 0, errors.NewInvalidInputf(ErrCodeInvalidFunctionArg, "function argument value must be a number, got a nested object")
		}
		value = inner
	}

	var number float64
	switch v := value.(type) {
	case float64:
		number = v
	case int64:
		number = float64(v)
	case int:
		number = float64(v)
	case string:
		parsed, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return 0, errors.NewInvalidInputf(ErrCodeInvalidFunctionArg, "function argument %q is not a number", v)
		}
		number = parsed
	default:
		return 0, errors.NewInvalidInputf(ErrCodeInvalidFunctionArg, "function argument must be a number, got %T", value)
	}

	if math.IsNaN(number) || math.IsInf(number, 0) {
		return 0, errors.NewInvalidInputf(ErrCodeInvalidFunctionArg, "function argument must be a finite number")
	}
	return number, nil
}
