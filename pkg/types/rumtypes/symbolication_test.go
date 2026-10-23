package rumtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSymbolicateFramesEsbuildFixture(t *testing.T) {
	sourceMap, err := ParseSourceMap(readSourceMapFixture(t, "main.js.map"))
	require.NoError(t, err)
	frames := ParseStackFrames(string(readSourceMapFixture(t, "stack.txt")))
	require.Len(t, frames, 5)

	resolved := []string{}
	symbolicated, ok := SymbolicateFrames(frames, func(file string) (*SourceMap, string) {
		resolved = append(resolved, file)
		if file == "https://shop.example.com/assets/main.js" {
			return sourceMap, "/assets/main.js.map"
		}
		return nil, ""
	}, 1)
	require.True(t, ok)
	require.Len(t, symbolicated, 5)

	expected := []*OriginalFrame{
		{Function: "formatPrice", File: "src/price.ts", Line: 3, Column: 11, InApp: true, SourceMap: "/assets/main.js.map", Context: &SourceContext{StartLine: 2, Lines: []string{"  if (amount === undefined) {", `    throw new TypeError("price is undefined");`, "  }"}}},
		{Function: "", File: "src/index.ts", Line: 8, Column: 35, InApp: true, SourceMap: "/assets/main.js.map", Context: &SourceContext{StartLine: 7, Lines: []string{"export function renderCart(cart: Cart): string[] {", "  return cart.items.map((item) => formatPrice(item.price));", "}"}}},
		nil,
		{Function: "renderCart", File: "src/index.ts", Line: 8, Column: 21, InApp: true, SourceMap: "/assets/main.js.map", Context: &SourceContext{StartLine: 7, Lines: []string{"export function renderCart(cart: Cart): string[] {", "  return cart.items.map((item) => formatPrice(item.price));", "}"}}},
		{Function: "", File: "src/index.ts", Line: 11, Column: 1, InApp: true, SourceMap: "/assets/main.js.map", Context: &SourceContext{StartLine: 10, Lines: []string{"", "renderCart({ items: [{ price: 3 }, {}] });", ""}}},
	}
	for i, frame := range symbolicated {
		assert.Equal(t, frames[i].Function, frame.Function, "minified frame %d is kept", i)
		assert.Equal(t, frames[i].File, frame.File)
		assert.Equal(t, expected[i], frame.Original, "frame %d", i)
	}
	assert.Nil(t, frames[0].Original, "input frames are not changed")
	assert.Equal(t, []string{"https://shop.example.com/assets/main.js", "https://shop.example.com/assets/main.js", "<anonymous>", "https://shop.example.com/assets/main.js", "https://shop.example.com/assets/main.js"}, resolved)
}

func TestSymbolicateFrames(t *testing.T) {
	sourceMap, err := ParseSourceMap([]byte(`{"version":3,"sources":["webpack://shop/./node_modules/react-dom/index.js","src/app.ts"],"names":["render"],"mappings":"AAAA,KCAAA"}`))
	require.NoError(t, err)
	resolve := func(file string) (*SourceMap, string) {
		if file == "https://shop.example.com/vendor.js" {
			return sourceMap, "/vendor.js.map"
		}
		return nil, ""
	}

	testCases := []struct {
		name         string
		frames       []StackFrame
		symbolicated bool
		expected     []*OriginalFrame
	}{
		{name: "NoFrames", frames: []StackFrame{}, expected: []*OriginalFrame{}},
		{name: "NoMap", frames: []StackFrame{{Function: "a", File: "https://shop.example.com/main.js", Line: 1, Column: 1}}, expected: []*OriginalFrame{nil}},
		{
			name:         "LibraryFrame_NotInApp_NoContext",
			frames:       []StackFrame{{Function: "a", File: "https://shop.example.com/vendor.js", Line: 1, Column: 1}},
			symbolicated: true,
			expected:     []*OriginalFrame{{Function: "a", File: "node_modules/react-dom/index.js", Line: 1, Column: 1, SourceMap: "/vendor.js.map"}},
		},
		{
			name:         "CallerName_FromNextFrame",
			frames:       []StackFrame{{Function: "a", File: "https://shop.example.com/vendor.js", Line: 1, Column: 1}, {Function: "b", File: "https://shop.example.com/vendor.js", Line: 1, Column: 6}},
			symbolicated: true,
			expected: []*OriginalFrame{
				{Function: "render", File: "node_modules/react-dom/index.js", Line: 1, Column: 1, SourceMap: "/vendor.js.map"},
				{Function: "b", File: "src/app.ts", Line: 1, Column: 1, InApp: true, SourceMap: "/vendor.js.map"},
			},
		},
		{name: "UnmappedPosition", frames: []StackFrame{{Function: "a", File: "https://shop.example.com/vendor.js", Line: 9, Column: 1}}, expected: []*OriginalFrame{nil}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			frames, symbolicated := SymbolicateFrames(testCase.frames, resolve, 3)
			assert.Equal(t, testCase.symbolicated, symbolicated)
			originals := make([]*OriginalFrame, 0, len(frames))
			for _, frame := range frames {
				originals = append(originals, frame.Original)
			}
			assert.Equal(t, testCase.expected, originals)
		})
	}
}
