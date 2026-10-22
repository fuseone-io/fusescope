package querier

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseRawStreamStart(t *testing.T) {
	testCases := []struct {
		name     string
		param    string
		expected uint64
	}{
		{name: "Empty", param: "", expected: 0},
		{name: "NotANumber", param: "yesterday", expected: 0},
		{name: "Negative", param: "-5", expected: 0},
		{name: "Milliseconds", param: "1761148800000", expected: 1761148800000},
		{name: "MaxInt64", param: "9223372036854775807", expected: 9223372036854775807},
		{name: "AboveMaxInt64", param: "9223372036854775808", expected: 0},
		{name: "MaxUint64", param: "18446744073709551615", expected: 0},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, parseRawStreamStart(testCase.param))
		})
	}
}
