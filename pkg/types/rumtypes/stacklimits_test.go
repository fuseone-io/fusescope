package rumtypes

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTruncateStack(t *testing.T) {
	testCases := []struct {
		name      string
		text      string
		limit     int
		expected  string
		truncated bool
	}{
		{name: "Short_Kept", text: "at a (x.js:1:2)", limit: 64, expected: "at a (x.js:1:2)"},
		{name: "Exact_Kept", text: "abcd", limit: 4, expected: "abcd"},
		{name: "Long_Cut", text: "abcdef", limit: 4, expected: "abcd", truncated: true},
		{name: "MultiByte_CutOnRuneStart", text: "ab€cd", limit: 4, expected: "ab", truncated: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			text, truncated := TruncateStack(testCase.text, testCase.limit)
			assert.Equal(t, testCase.expected, text)
			assert.Equal(t, testCase.truncated, truncated)
		})
	}
}

func TestParseEventStackFrames(t *testing.T) {
	frameLines := func(count int) string {
		return "TypeError: x\n" + strings.Repeat("    at e (https://shop.example.com/assets/main.js:1:41)\n", count)
	}
	testCases := []struct {
		name      string
		stack     string
		frames    int
		truncated bool
	}{
		{name: "Normal_Untouched", stack: frameLines(12), frames: 12},
		{name: "AtLimit_NotTruncated", stack: frameLines(MaxStackFrames), frames: MaxStackFrames},
		{name: "FiftyThousandLines_Bounded", stack: frameLines(50_000), frames: MaxStackFrames, truncated: true},
		{name: "HugeSingleLine_OneFrame", stack: "    at e (https://shop.example.com/" + strings.Repeat("a", 4<<20) + ".js:1:2)", frames: 1, truncated: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			frames, truncated := ParseEventStackFrames(testCase.stack)
			assert.Len(t, frames, testCase.frames)
			assert.Equal(t, testCase.truncated, truncated)
		})
	}
}

func TestComponentStackLimits(t *testing.T) {
	testCases := []struct {
		name   string
		stack  string
		frames int
	}{
		{name: "FiftyThousandLines", stack: "\n" + strings.Repeat("    at Cart (https://shop.example.com/assets/main.js:1:131)\n", 50_000), frames: MaxComponentStackFrames},
		{name: "HugeSingleLine", stack: "\n    at Cart (https://shop.example.com/" + strings.Repeat("€", 1<<20), frames: 1},
		{name: "ManyShortLines_FrameCapBeforeByteCap", stack: strings.Repeat("at A\n", 60), frames: MaxComponentStackFrames},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			stack := NewComponentStack(testCase.stack)
			require.NotNil(t, stack)
			assert.True(t, stack.Truncated)
			assert.Len(t, stack.Frames, testCase.frames)
			assert.LessOrEqual(t, len(stack.Stack), MaxComponentStackBytes)
			assert.True(t, utf8.ValidString(stack.Stack))
		})
	}

	normal := NewComponentStack("\n    at Cart (https://shop.example.com/assets/main.js:1:131)")
	require.NotNil(t, normal)
	assert.False(t, normal.Truncated)
}

func TestComponentStackSymbolicationBounded(t *testing.T) {
	stack := NewComponentStack(strings.Repeat("    at Cart (https://shop.example.com/assets/main.js:1:131)\n", 50_000))
	require.NotNil(t, stack)

	resolved := 0
	_, _ = SymbolicateFrames(stack.Frames, func(string) (*SourceMap, string) {
		resolved++
		return nil, ""
	}, 5)
	assert.LessOrEqual(t, resolved, MaxComponentStackFrames)
}

func TestParseJVMStackTraceLimits(t *testing.T) {
	testCases := []struct {
		name       string
		stack      string
		frames     int
		exceptions int
	}{
		{name: "FiftyThousandFrames", stack: "a.a: boom\n" + strings.Repeat("\tat a.b.c(Unknown Source:1)\n", 50_000), frames: MaxStackFrames, exceptions: 1},
		{name: "TenThousandCauses", stack: "a.a: boom\n" + strings.Repeat("Caused by: b.b: inner\n\tat a.b.c(Unknown Source:1)\n", 10_000), frames: maxJVMExceptions - 1, exceptions: maxJVMExceptions},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			trace := ParseJVMStackTrace(testCase.stack, "", "")
			assert.True(t, trace.Truncated)
			assert.Len(t, trace.Exceptions, testCase.exceptions)
			frames := 0
			for _, exception := range trace.Exceptions {
				frames += len(exception.Frames)
			}
			assert.Equal(t, testCase.frames, frames)
		})
	}

	assert.False(t, ParseJVMStackTrace("a.a: boom\n\tat a.b.c(Unknown Source:1)", "", "").Truncated)
}

func TestSourceContextRadiusBounded(t *testing.T) {
	lines := make([]string, 200)
	for i := range lines {
		lines[i] = "x"
	}
	content, err := json.Marshal(strings.Join(lines, "\n"))
	require.NoError(t, err)
	sourceMap, err := ParseSourceMap([]byte(`{"version":3,"sources":["src/app.ts"],"sourcesContent":[` + string(content) + `],"names":[],"mappings":"AAAA"}`))
	require.NoError(t, err)

	context := sourceMap.Context("src/app.ts", 100, 1000)
	require.NotNil(t, context)
	assert.Len(t, context.Lines, 2*maxContextRadius+1)
}
