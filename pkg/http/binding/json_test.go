package binding

import (
	"encoding/json"
	"io"
	"reflect"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type s struct {
	A int `json:"a"`
}

func (req *s) UnmarshalJSON(b []byte) error {
	type Alias s

	var temp Alias
	if err := json.Unmarshal(b, &temp); err != nil {
		return err
	}

	if temp.A <= 10 {
		return errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "a must be greater than 10")
	}

	*req = s(temp)
	return nil
}

type n struct {
	S s `json:"s"`
}

type l struct {
	Items []s `json:"items"`
}

type plain struct {
	P struct {
		B int `json:"b"`
	} `json:"p"`
}

type named struct {
	Name map[string]string `json:"name"`
	S    s                 `json:"s"`
}

type labelled struct {
	X map[string]string `json:"x"`
	S s                 `json:"s"`
}

type two struct {
	S s `json:"s"`
	T s `json:"t"`
}

func TestJSONBinding_BindBodyErrors(t *testing.T) {
	testCases := []struct {
		name    string
		body    string
		obj     any
		opts    []BindBodyOption
		code    errors.Code
		message string
		a       []string
	}{
		{name: "Empty", body: "", opts: nil, obj: &struct{}{}, code: ErrCodeInvalidRequestBody, message: ErrMessageInvalidJSON, a: []string{io.EOF.Error()}},
		{name: "String", body: "invalid json", opts: nil, obj: &struct{}{}, code: ErrCodeInvalidRequestBody, message: ErrMessageInvalidJSON, a: []string{"invalid character 'i' looking for beginning of value"}},
		{name: "Invalid", body: `{"a":"b}`, opts: nil, obj: &struct{}{}, code: ErrCodeInvalidRequestBody, message: ErrMessageInvalidJSON, a: []string{io.ErrUnexpectedEOF.Error()}},
		{name: "CustomValid", body: `{"a":9}`, opts: nil, obj: new(s), code: errors.CodeInvalidInput, message: "a must be greater than 10", a: []string{}},
		{name: "CustomInvalidJSON", body: `{"a:9}`, opts: nil, obj: new(s), code: ErrCodeInvalidRequestBody, message: ErrMessageInvalidJSON, a: []string{io.ErrUnexpectedEOF.Error()}},
		{name: "CustomMismatchedType", body: `{"a":"b"}`, opts: nil, obj: new(s), code: ErrCodeInvalidRequestField, message: ErrMessageInvalidField, a: []string{`value of type 'string' was received for field 'a', try sending 'int' instead?`}},
		{name: "CustomNestedMismatchedType", body: `{"s":{"a":"b"}}`, opts: nil, obj: new(n), code: ErrCodeInvalidRequestField, message: ErrMessageInvalidField, a: []string{`value of type 'string' was received for field 's.a', try sending 'int' instead?`}},
		// #322: under encoding/json v2 (Go 1.27's default) an error from a
		// nested UnmarshalJSON carries only its own field; the path comes
		// from the body, the same on every toolchain.
		{name: "CustomNestedInArrayMismatchedType", body: `{"items":[{"a":11},{"a":"b"}]}`, opts: nil, obj: new(l), code: ErrCodeInvalidRequestField, message: ErrMessageInvalidField, a: []string{`value of type 'string' was received for field 'items.1.a', try sending 'int' instead?`}},
		{name: "PlainNestedMismatchedType", body: `{"p":{"b":"x"}}`, opts: nil, obj: new(plain), code: ErrCodeInvalidRequestField, message: ErrMessageInvalidField, a: []string{`value of type 'string' was received for field 'p.b', try sending 'int' instead?`}},
		{name: "SameFieldValidElsewhere", body: `{"name":{"a":"ok"},"s":{"a":"b"}}`, opts: nil, obj: new(named), code: ErrCodeInvalidRequestField, message: ErrMessageInvalidField, a: []string{`value of type 'string' was received for field 's.a', try sending 'int' instead?`}},
		// Review of #323: x.a is a valid string; only s.a expects an int.
		{name: "SameShapeValidBefore", body: `{"x":{"a":"b"},"s":{"a":"c"}}`, opts: nil, obj: new(labelled), code: ErrCodeInvalidRequestField, message: ErrMessageInvalidField, a: []string{`value of type 'string' was received for field 's.a', try sending 'int' instead?`}},
		{name: "LeadingWhitespace", body: "  \n" + `{"p":{"b":"x"}}`, opts: nil, obj: new(plain), code: ErrCodeInvalidRequestField, message: ErrMessageInvalidField, a: []string{`value of type 'string' was received for field 'p.b', try sending 'int' instead?`}},
		{name: "AmbiguousNestedMismatchedType", body: `{"s":{"a":"b"},"t":{"a":"c"}}`, opts: nil, obj: new(two), code: ErrCodeInvalidRequestField, message: ErrMessageInvalidField, a: []string{`value of type 'string' was received for field 's.a', try sending 'int' instead?`}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := JSON.BindBody(strings.NewReader(testCase.body), testCase.obj, testCase.opts...)
			assert.Error(t, err)

			typ, c, m, _, _, _ := errors.Unwrapb(err)
			assert.Equal(t, errors.TypeInvalidInput, typ)
			assert.Equal(t, testCase.code, c)
			assert.Equal(t, testCase.message, m)

			messages := []string{}
			for _, additional := range errors.AsJSON(err).Errors {
				messages = append(messages, additional.Message)
			}
			assert.ElementsMatch(t, testCase.a, messages)
		})
	}
}

type widget struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func TestJSONBinding_BindBody_UnknownFieldSuggestions(t *testing.T) {
	testCases := []struct {
		name        string
		body        string
		opts        []BindBodyOption
		message     string
		suggestions []string
	}{
		{
			name:        "NoNearMatch",
			body:        `{"shape":"round"}`,
			opts:        []BindBodyOption{WithDisallowUnknownFields(true)},
			message:     `unknown field "shape"`,
			suggestions: []string{"valid fields are `name`, `color`"},
		},
		{
			name:        "WithContext",
			body:        `{"shape":"round"}`,
			opts:        []BindBodyOption{WithDisallowUnknownFields(true), WithUnknownFieldContext("widget spec")},
			message:     `unknown field "shape" in widget spec`,
			suggestions: []string{"valid fields are `name`, `color`"},
		},
		{
			name:        "NearMatch",
			body:        `{"nam":"x"}`,
			opts:        []BindBodyOption{WithDisallowUnknownFields(true)},
			message:     `unknown field "nam"`,
			suggestions: []string{"did you mean: `name`", "valid fields are `name`, `color`"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := JSON.BindBody(strings.NewReader(testCase.body), &widget{}, testCase.opts...)
			assert.Error(t, err)

			_, c, m, _, _, _ := errors.Unwrapb(err)

			if testCase.message != "" {
				assert.Equal(t, errors.CodeInvalidInput, c)
				assert.Equal(t, testCase.message, m)
			}

			assert.Equal(t, testCase.suggestions, errors.AsJSON(err).Suggestions)
		})
	}
}

type structuredUnknownField struct{}

func (*structuredUnknownField) UnmarshalJSON([]byte) error {
	return errors.
		NewInvalidInputf(errors.CodeInvalidInput, "unknown field %q in inner spec", "foo").
		WithSuggestions("did you mean: `bar`")
}

// A non-strict BindBody must pass through an already-structured "unknown field"
// error returned by a nested UnmarshalJSON, not re-wrap it with the outer field set.
func TestJSONBinding_BindBody_PassesThroughStructuredUnknownField(t *testing.T) {
	err := JSON.BindBody(strings.NewReader(`{}`), &structuredUnknownField{})
	assert.Error(t, err)

	_, c, m, _, _, _ := errors.Unwrapb(err)
	assert.Equal(t, errors.CodeInvalidInput, c)
	assert.Equal(t, `unknown field "foo" in inner spec`, m)
	assert.Equal(t, []string{"did you mean: `bar`"}, errors.AsJSON(err).Suggestions)
}

// Review of #323: the bytes kept to name a field are bounded, and a body
// past the bound, or a walk past its budget, keeps the error's own field.
func TestFieldPathFallsBackToTheErrorsField(t *testing.T) {
	typeError := &json.UnmarshalTypeError{Value: "string", Type: reflect.TypeOf(0), Field: "a", Offset: 8}
	body := []byte(`{"s":{"a":"b"}}`)
	assert.Equal(t, "s.a", fieldPath(body, false, reflect.TypeOf(n{}), typeError))
	assert.Equal(t, "a", fieldPath(body, true, reflect.TypeOf(n{}), typeError), "a truncated capture is not searched")

	deep := []byte(strings.Repeat(`{"d":`, maxWalkDepth) + `{"s":{"a":"b"}}` + strings.Repeat(`}`, maxWalkDepth))
	assert.Equal(t, "a", fieldPath(deep, false, nil, typeError), "past the depth budget")
}

func TestCaptureIsBounded(t *testing.T) {
	var capture boundedCapture
	n, err := capture.Write(make([]byte, maxCapturedBody-10))
	require.NoError(t, err)
	assert.Equal(t, maxCapturedBody-10, n)
	assert.False(t, capture.truncated)
	n, err = capture.Write(make([]byte, 20))
	require.NoError(t, err)
	assert.Equal(t, 20, n, "the reader is never cut short")
	assert.True(t, capture.truncated)
	assert.LessOrEqual(t, capture.buf.Len(), maxCapturedBody)
}

func TestWalkJSONBudget(t *testing.T) {
	visit := func([]string, []int64, reflect.Type, string, int64) bool { return true }
	deep := strings.Repeat(`[`, maxWalkDepth+5) + strings.Repeat(`]`, maxWalkDepth+5)
	assert.False(t, walkJSON([]byte(deep), nil, visit), "stops at the depth budget")

	wide := "[" + strings.TrimSuffix(strings.Repeat(`1,`, maxWalkNodes+5), ",") + "]"
	visited := 0
	complete := walkJSON([]byte(wide), nil, func([]string, []int64, reflect.Type, string, int64) bool { visited++; return true })
	assert.False(t, complete, "stops at the node budget")
	assert.LessOrEqual(t, visited, maxWalkNodes)

	assert.True(t, walkJSON([]byte(`{"a":[1,{"b":"c"}]}`), nil, visit))
}

type reviewMarker interface{ marker() }

type scalarMarker int

type withEmbeddedInterface struct {
	reviewMarker
	A int `json:"a"`
}

type withEmbeddedScalar struct {
	scalarMarker
	ScalarExported
	A int `json:"a"`
}

type ScalarExported string

// Untagged, so the shared name is the field name: vet refuses a tag
// repeated between a direct and a promoted field, and encoding/json applies
// the same rules either way.
type embeddedA struct {
	A string
}

type directDominates struct {
	embeddedA
	A int
}

type embeddedB struct {
	A int
}

type ambiguousPromoted struct {
	embeddedA
	embeddedB
}

// Both are named A at one level; the tagged one takes it.
type taggedWins struct {
	A string
	B int `json:"A"`
}

// Review of #323: the field a key decodes into is resolved as encoding/json
// resolves it, and an unresolvable one is unknown rather than guessed.
func TestChildTypeFollowsEncodingJSON(t *testing.T) {
	testCases := []struct {
		name   string
		parent reflect.Type
		key    string
		want   reflect.Type
	}{
		{name: "EmbeddedInterfaceIsNotWalked", parent: reflect.TypeOf(withEmbeddedInterface{}), key: "a", want: reflect.TypeOf(0)},
		{name: "EmbeddedScalarIsNotWalked", parent: reflect.TypeOf(withEmbeddedScalar{}), key: "a", want: reflect.TypeOf(0)},
		{name: "EmbeddedExportedScalarIsAField", parent: reflect.TypeOf(withEmbeddedScalar{}), key: "ScalarExported", want: reflect.TypeOf(ScalarExported(""))},
		{name: "DirectDominatesPromoted", parent: reflect.TypeOf(directDominates{}), key: "A", want: reflect.TypeOf(0)},
		{name: "AmbiguousPromotedIsUnknown", parent: reflect.TypeOf(ambiguousPromoted{}), key: "A", want: nil},
		{name: "TaggedWinsOverUntaggedAtOneLevel", parent: reflect.TypeOf(taggedWins{}), key: "A", want: reflect.TypeOf(0)},
		{name: "CaseInsensitiveName", parent: reflect.TypeOf(taggedWins{}), key: "a", want: reflect.TypeOf(0)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, childType(testCase.parent, testCase.key, false))
		})
	}

	// The same choices as encoding/json itself.
	var direct directDominates
	require.NoError(t, json.Unmarshal([]byte(`{"A":5}`), &direct))
	assert.Equal(t, 5, direct.A)
	var tagged taggedWins
	require.NoError(t, json.Unmarshal([]byte(`{"A":5}`), &tagged))
	assert.Equal(t, 5, tagged.B)
	var ambiguous ambiguousPromoted
	require.NoError(t, json.Unmarshal([]byte(`{"A":"x"}`), &ambiguous))
	assert.Equal(t, ambiguousPromoted{}, ambiguous, "an ambiguous name decodes into no field")
}

func TestJSONBinding_DirectFieldDominates(t *testing.T) {
	var value struct {
		D directDominates `json:"d"`
	}
	err := JSON.BindBody(strings.NewReader(`{"d":{"A":"bad"}}`), &value)
	require.Error(t, err)
	messages := []string{}
	for _, additional := range errors.AsJSON(err).Errors {
		messages = append(messages, additional.Message)
	}
	assert.Equal(t, []string{`value of type 'string' was received for field 'd.A', try sending 'int' instead?`}, messages)
}
