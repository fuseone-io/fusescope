package rumtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewComponentStack(t *testing.T) {
	testCases := []struct {
		name     string
		stack    string
		expected *ComponentStack
	}{
		{
			name:  "V8_LeadingNewline_Trimmed",
			stack: "\n    at Coupon (http://rum-react-sample:3000/app.js:12:27994)\n    at Product (http://rum-react-sample:3000/app.js:12:28411)\n    at RenderedRoute (http://rum-react-sample:3000/vendor.js:3:1201)\n",
			expected: &ComponentStack{
				Stack: "at Coupon (http://rum-react-sample:3000/app.js:12:27994)\n    at Product (http://rum-react-sample:3000/app.js:12:28411)\n    at RenderedRoute (http://rum-react-sample:3000/vendor.js:3:1201)",
				Frames: []StackFrame{
					{Function: "Coupon", File: "http://rum-react-sample:3000/app.js", Line: 12, Column: 27994},
					{Function: "Product", File: "http://rum-react-sample:3000/app.js", Line: 12, Column: 28411},
					{Function: "RenderedRoute", File: "http://rum-react-sample:3000/vendor.js", Line: 3, Column: 1201},
				},
			},
		},
		{name: "Empty_Nil", stack: "", expected: nil},
		{name: "Whitespace_Nil", stack: " \n\t\n", expected: nil},
		{
			name:  "TruncatedLastLine_KeepsName",
			stack: "\n    at Coupon (http://shop.example.com/app.js:12:27994)\n    at ErrorBoundary (http://shop.example.com/ap",
			expected: &ComponentStack{
				Stack: "at Coupon (http://shop.example.com/app.js:12:27994)\n    at ErrorBoundary (http://shop.example.com/ap",
				Frames: []StackFrame{
					{Function: "Coupon", File: "http://shop.example.com/app.js", Line: 12, Column: 27994},
					{Function: "ErrorBoundary"},
				},
			},
		},
		{
			name:  "TruncatedName",
			stack: "\n    at Coupon (http://cart.example.com/app.js:1:2)\n    at Error",
			expected: &ComponentStack{
				Stack:  "at Coupon (http://cart.example.com/app.js:1:2)\n    at Error",
				Frames: []StackFrame{{Function: "Coupon", File: "http://cart.example.com/app.js", Line: 1, Column: 2}, {Function: "Error"}},
			},
		},
		{
			name:  "NoLocation",
			stack: "\n    at div\n    at Suspense\n    at App (http://web.example.com/main.js:1:9)",
			expected: &ComponentStack{
				Stack:  "at div\n    at Suspense\n    at App (http://web.example.com/main.js:1:9)",
				Frames: []StackFrame{{Function: "div"}, {Function: "Suspense"}, {Function: "App", File: "http://web.example.com/main.js", Line: 1, Column: 9}},
			},
		},
		{
			name:  "React16_InFormat",
			stack: "\n    in Coupon (at Coupon.js:12)\n    in div (created by Product)\n    in Product",
			expected: &ComponentStack{
				Stack:  "in Coupon (at Coupon.js:12)\n    in div (created by Product)\n    in Product",
				Frames: []StackFrame{{Function: "Coupon", File: "Coupon.js", Line: 12}, {Function: "div"}, {Function: "Product"}},
			},
		},
		{
			name:  "Gecko",
			stack: "\nCoupon@http://store.example.com/app.js:12:27994\ndiv\nProduct@http://store.example.com/app.js:12:2",
			expected: &ComponentStack{
				Stack:  "Coupon@http://store.example.com/app.js:12:27994\ndiv\nProduct@http://store.example.com/app.js:12:2",
				Frames: []StackFrame{{Function: "Coupon", File: "http://store.example.com/app.js", Line: 12, Column: 27994}, {Function: "div"}, {Function: "Product", File: "http://store.example.com/app.js", Line: 12, Column: 2}},
			},
		},
		{
			name:  "GeckoTruncated_KeepsName",
			stack: "Coupon@http://store.example.com/app.js:12:27994\nProduct@http://store.exa",
			expected: &ComponentStack{
				Stack:  "Coupon@http://store.example.com/app.js:12:27994\nProduct@http://store.exa",
				Frames: []StackFrame{{Function: "Coupon", File: "http://store.example.com/app.js", Line: 12, Column: 27994}, {Function: "Product"}},
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, NewComponentStack(testCase.stack))
		})
	}
}

func TestComponentStackSymbolicateFixture(t *testing.T) {
	sourceMap, err := ParseSourceMap(readSourceMapFixture(t, "main.js.map"))
	require.NoError(t, err)
	stack := NewComponentStack("\n    at PriceTag (https://shop.example.com/assets/main.js:1:41)\n    at div\n    at Cart (https://shop.example.com/assets/main.js:1:131)\n    at Router (https://shop.example.com/assets/vendor.js:1:1)")
	require.NotNil(t, stack)

	frames, ok := SymbolicateFrames(stack.Frames, func(file string) (*SourceMap, string) {
		if file == "https://shop.example.com/assets/main.js" {
			return sourceMap, "/assets/main.js.map"
		}
		return nil, ""
	}, -1)
	stack.SetSymbolication(&Symbolication{Frames: frames, Symbolicated: ok})

	assert.True(t, stack.Symbolicated)
	assert.Nil(t, stack.MissingSourceMap)
	require.Len(t, stack.Frames, 4)
	expected := []*OriginalFrame{
		{Function: "PriceTag", File: "src/price.ts", Line: 3, Column: 11, InApp: true, SourceMap: "/assets/main.js.map"},
		nil,
		{Function: "Cart", File: "src/index.ts", Line: 8, Column: 21, InApp: true, SourceMap: "/assets/main.js.map"},
		nil,
	}
	for i, frame := range stack.Frames {
		assert.Equal(t, expected[i], frame.Original, "frame %d", i)
	}
	assert.Equal(t, "Cart", stack.Frames[2].Function, "the component name is kept")
}
