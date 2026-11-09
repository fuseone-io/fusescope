package datafusionsql

import (
	"math"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestString(t *testing.T) {
	testCases := []struct {
		name  string
		value string
		want  string
	}{
		{name: "Plain", value: "GET /api", want: `'GET /api'`},
		{name: "Empty", value: "", want: `''`},
		{name: "QuoteDoubled", value: "o'brien", want: `'o''brien'`},
		{name: "InjectionStaysALiteral", value: "x' OR '1'='1", want: `'x'' OR ''1''=''1'`},
		{name: "BackslashIsPlain", value: `C:\temp\'`, want: `'C:\temp\'''`},
		{name: "Unicode", value: "café ☕", want: `'café ☕'`},
		{name: "DollarQuoteIsPlain", value: "$$; drop$$", want: `'$$; drop$$'`},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := String(testCase.value)
			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}

func TestIdent(t *testing.T) {
	testCases := []struct {
		name  string
		value string
		want  string
	}{
		{name: "Plain", value: "service_name", want: `"service_name"`},
		{name: "KeepsCase", value: "serviceName", want: `"serviceName"`},
		{name: "QuoteDoubled", value: `a"b`, want: `"a""b"`},
		{name: "Dotted_IsOneIdentifier", value: "http.method", want: `"http.method"`},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := Ident(testCase.value)
			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}

func TestRefusals(t *testing.T) {
	testCases := []struct {
		name   string
		render func() (string, error)
	}{
		{name: "String_NUL", render: func() (string, error) { return String("a\x00b") }},
		{name: "String_InvalidUTF8", render: func() (string, error) { return String("\xff") }},
		{name: "Ident_Empty", render: func() (string, error) { return Ident("") }},
		{name: "Ident_NUL", render: func() (string, error) { return Ident("a\x00") }},
		{name: "Ident_InvalidUTF8", render: func() (string, error) { return Ident("\xfe") }},
		{name: "Float_NaN", render: func() (string, error) { return Float(math.NaN()) }},
		{name: "Float_Inf", render: func() (string, error) { return Float(math.Inf(-1)) }},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := testCase.render()
			assert.True(t, errors.Asc(err, ErrCodeUnrenderable), "%v", err)
		})
	}
}

func TestNumbersAndBools(t *testing.T) {
	assert.Equal(t, "-42", Int(-42))
	assert.Equal(t, "18446744073709551615", Uint(math.MaxUint64))
	got, err := Float(0.1)
	require.NoError(t, err)
	assert.Equal(t, "0.1", got)
	got, err = Float(1e21)
	require.NoError(t, err)
	assert.Equal(t, "1e+21", got)
	assert.Equal(t, "true", Bool(true))
	assert.Equal(t, "false", Bool(false))
}
