package rumtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeErrorMessage(t *testing.T) {
	testCases := []struct {
		name     string
		message  string
		expected string
	}{
		{name: "Plain_Unchanged", message: "Cannot read properties of undefined (reading 'price')", expected: "Cannot read properties of undefined (reading 'price')"},
		{name: "NumberAndURL", message: "Loading chunk 412 failed. (error: https://shop.example.com/assets/412.js)", expected: "Loading chunk <n> failed. (error: <url>)"},
		{name: "UUID", message: "Order 0d2e71c4-9f3a-4b8e-9d1c-6a2f7b80a4c9 not found", expected: "Order <id> not found"},
		{name: "HexID", message: "Session 5a77d2c9e8f1 expired", expected: "Session <id> expired"},
		{name: "StatusCode", message: "POST /api/cart returned 502", expected: "POST /api/cart returned <n>"},
		{name: "PathID", message: "GET /api/products/88213 failed", expected: "GET /api/products/<n> failed"},
		{name: "Decimal", message: "Took 1.25 s", expected: "Took <n> s"},
		{name: "DigitInsideWord_Kept", message: "e2e v2 failed", expected: "e2e v2 failed"},
		{name: "LongNumber_ID", message: "Job 1792711100 lost", expected: "Job <id> lost"},
		{name: "Whitespace_Collapsed", message: "  a \n\t b ", expected: "a b"},
		{name: "Empty", message: "", expected: ""},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			normalized := NormalizeErrorMessage(testCase.message)
			assert.Equal(t, testCase.expected, normalized)
			assert.Equal(t, normalized, NormalizeErrorMessage(normalized))
		})
	}
}

func TestParseStackFrames(t *testing.T) {
	testCases := []struct {
		name     string
		stack    string
		expected []StackFrame
	}{
		{
			name:  "V8",
			stack: "TypeError: Cannot read properties of undefined (reading 'price')\n    at Ue (https://shop.example.com/assets/main.4f9c2a.js:1:48213)\n    at async Object.mutationFn (https://shop.example.com/assets/cart.9b1e07.js:1:5012)\n    at http://localhost:3360/:50:68\n    at new Foo (foo.js:3:4)",
			expected: []StackFrame{
				{Function: "Ue", File: "https://shop.example.com/assets/main.4f9c2a.js", Line: 1, Column: 48213},
				{Function: "Object.mutationFn", File: "https://shop.example.com/assets/cart.9b1e07.js", Line: 1, Column: 5012},
				{Function: "", File: "http://localhost:3360/", Line: 50, Column: 68},
				{Function: "Foo", File: "foo.js", Line: 3, Column: 4},
			},
		},
		{
			name:     "V8_AnonymousMethod",
			stack:    "Error: Failed to fetch\n    at HTMLButtonElement.<anonymous> (http://localhost:3360/:53:22)",
			expected: []StackFrame{{Function: "HTMLButtonElement.<anonymous>", File: "http://localhost:3360/", Line: 53, Column: 22}},
		},
		{
			name:     "V8_NoLocation",
			stack:    "Error: x\n    at <anonymous>",
			expected: []StackFrame{{Function: "", File: "<anonymous>"}},
		},
		{
			name:  "Gecko",
			stack: "Ue@https://shop.example.com/assets/main.4f9c2a.js:1:48213\n@https://shop.example.com/assets/vendor.c2d81f.js:2:91544\n",
			expected: []StackFrame{
				{Function: "Ue", File: "https://shop.example.com/assets/main.4f9c2a.js", Line: 1, Column: 48213},
				{Function: "", File: "https://shop.example.com/assets/vendor.c2d81f.js", Line: 2, Column: 91544},
			},
		},
		{
			name:     "Safari_GlobalCode",
			stack:    "global code@https://shop.example.com/index.js:10:3",
			expected: []StackFrame{{Function: "global code", File: "https://shop.example.com/index.js", Line: 10, Column: 3}},
		},
		{name: "NoFrames", stack: "TypeError: boom", expected: []StackFrame{}},
		{name: "Empty", stack: "", expected: []StackFrame{}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, ParseStackFrames(testCase.stack))
		})
	}
}

func TestFirstStackFrameLine(t *testing.T) {
	testCases := []struct {
		name     string
		stack    string
		expected string
	}{
		{name: "V8", stack: "TypeError: a@b.c:1:2 is bad\n    at Ue (main.js:1:2)\n    at Ve (main.js:1:3)", expected: "    at Ue (main.js:1:2)"},
		{name: "Gecko", stack: "Ue@main.js:1:2\nVe@main.js:1:3", expected: "Ue@main.js:1:2"},
		{name: "None", stack: "TypeError: boom", expected: ""},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, FirstStackFrameLine(testCase.stack))
		})
	}
}

func TestNewErrorFingerprint(t *testing.T) {
	testCases := []struct {
		name  string
		left  [3]string
		right [3]string
		equal bool
	}{
		{
			name:  "DifferentIDsInMessage_Same",
			left:  [3]string{"ChunkLoadError", "Loading chunk 412 failed. (error: https://shop.example.com/assets/412.js)", "ChunkLoadError\n    at loadSearchPage (https://shop.example.com/assets/main.4f9c2a.js:1:100)"},
			right: [3]string{"ChunkLoadError", "Loading chunk 97 failed. (error: https://shop.example.com/assets/97.js)", "ChunkLoadError\n    at loadSearchPage (https://shop.example.com/assets/main.4f9c2a.js:1:100)"},
			equal: true,
		},
		{
			name:  "MinifiedLineAndColumnDiffer_Same",
			left:  [3]string{"TypeError", "x is undefined", "TypeError: x\n    at Ue (https://shop.example.com/assets/main.js:1:48213)"},
			right: [3]string{"TypeError", "x is undefined", "TypeError: x\n    at Ue (https://shop.example.com/assets/main.js:1:50001)"},
			equal: true,
		},
		{
			name:  "BundleHashAndOriginDiffer_Same",
			left:  [3]string{"TypeError", "x is undefined", "    at Ue (https://shop.example.com/assets/main.4f9c2a.js:1:1)"},
			right: [3]string{"TypeError", "x is undefined", "Ue@https://staging.example.com/assets/main.71be04.js?v=2:1:1"},
			equal: true,
		},
		{
			name:  "ViteHashDiffers_Same",
			left:  [3]string{"TypeError", "x", "    at f (https://a.example.com/assets/index-BdK3x9Qz.js:1:1)"},
			right: [3]string{"TypeError", "x", "    at f (https://a.example.com/assets/index-Zx81Qp0a.js:1:1)"},
			equal: true,
		},
		{
			name:  "DifferentFunction_Different",
			left:  [3]string{"TypeError", "x is undefined", "    at Ue (main.js:1:1)"},
			right: [3]string{"TypeError", "x is undefined", "    at Ve (main.js:1:1)"},
			equal: false,
		},
		{
			name:  "DifferentFile_Different",
			left:  [3]string{"TypeError", "x is undefined", "    at Ue (main.js:1:1)"},
			right: [3]string{"TypeError", "x is undefined", "    at Ue (cart.js:1:1)"},
			equal: false,
		},
		{
			name:  "DifferentType_Different",
			left:  [3]string{"TypeError", "boom", ""},
			right: [3]string{"RangeError", "boom", ""},
			equal: false,
		},
		{
			name:  "DifferentMessage_Different",
			left:  [3]string{"Error", "boom", ""},
			right: [3]string{"Error", "bang", ""},
			equal: false,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			left := NewErrorFingerprint(testCase.left[0], testCase.left[1], testCase.left[2])
			right := NewErrorFingerprint(testCase.right[0], testCase.right[1], testCase.right[2])
			assert.Len(t, left, ErrorFingerprintLength)
			assert.True(t, IsErrorFingerprint(left))
			assert.Equal(t, testCase.equal, left == right)
		})
	}
}

func TestStackFrameFileKey(t *testing.T) {
	testCases := []struct {
		name     string
		file     string
		expected string
	}{
		{name: "OriginAndHash_Dropped", file: "https://shop.example.com/assets/main.4f9c2a.js", expected: "/assets/main.js"},
		{name: "ViteHash_Dropped", file: "https://shop.example.com/assets/index-BdK3x9Qz.js", expected: "/assets/index.js"},
		{name: "Query_Dropped", file: "https://shop.example.com/app.js?v=3", expected: "/app.js"},
		{name: "Root", file: "http://localhost:3360/", expected: "/"},
		{name: "PlainName_Kept", file: "my-component.js", expected: "my-component.js"},
		{name: "NumericChunk_Kept", file: "/assets/412.js", expected: "/assets/412.js"},
		{name: "Anonymous", file: "<anonymous>", expected: "<anonymous>"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, StackFrameFileKey(testCase.file))
		})
	}
}

func TestIsErrorFingerprint(t *testing.T) {
	testCases := []struct {
		name     string
		value    string
		expected bool
	}{
		{name: "Valid", value: "3fa8b0150c41e7d2", expected: true},
		{name: "Uppercase_Invalid", value: "3FA8B0150C41E7D2", expected: false},
		{name: "Short_Invalid", value: "3fa8b015", expected: false},
		{name: "NotHex_Invalid", value: "3fa8b0150c41e7zz", expected: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, IsErrorFingerprint(testCase.value))
		})
	}
}
