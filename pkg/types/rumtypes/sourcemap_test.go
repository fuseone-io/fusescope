package rumtypes

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func readSourceMapFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "sourcemap", name))
	require.NoError(t, err)
	return data
}

func TestDecodeVLQ(t *testing.T) {
	testCases := []struct {
		name     string
		segment  string
		expected []int32
		fails    bool
	}{
		{name: "Zero", segment: "A", expected: []int32{0}},
		{name: "One", segment: "C", expected: []int32{1}},
		{name: "MinusOne", segment: "D", expected: []int32{-1}},
		{name: "Fifteen", segment: "e", expected: []int32{15}},
		{name: "MinusFifteen", segment: "f", expected: []int32{-15}},
		{name: "Continuation_Sixteen", segment: "gB", expected: []int32{16}},
		{name: "Continuation_MinusSixteen", segment: "hB", expected: []int32{-16}},
		{name: "Continuation_OneHundredTwentyThree", segment: "2H", expected: []int32{123}},
		{name: "FourFields", segment: "AACA", expected: []int32{0, 0, 1, 0}},
		{name: "FiveFields_Mixed", segment: "MAAO", expected: []int32{6, 0, 0, 7}},
		{name: "InvalidCharacter_Fails", segment: "A!", fails: true},
		{name: "TruncatedContinuation_Fails", segment: "g", fails: true},
		{name: "Overflow_Fails", segment: "gggggggggB", fails: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			values, err := decodeVLQ(testCase.segment, nil)
			if testCase.fails {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, values)
		})
	}
}

func TestParseSourceMapRejects(t *testing.T) {
	testCases := []struct {
		name string
		data string
	}{
		{name: "NotJSON", data: `{"version":3,`},
		{name: "NotAnObject", data: `[1,2]`},
		{name: "VersionTwo", data: `{"version":2,"sources":[],"names":[],"mappings":""}`},
		{name: "VersionMissing", data: `{"sources":[],"names":[],"mappings":""}`},
		{name: "MappingsMissing", data: `{"version":3,"sources":[]}`},
		{name: "IndexMap", data: `{"version":3,"sections":[]}`},
		{name: "SourceOutOfRange", data: `{"version":3,"sources":[],"names":[],"mappings":"AAAA"}`},
		{name: "NameOutOfRange", data: `{"version":3,"sources":["a.ts"],"names":[],"mappings":"AAAAA"}`},
		{name: "NegativeLine", data: `{"version":3,"sources":["a.ts"],"names":[],"mappings":"AADA"}`},
		{name: "TwoFieldSegment", data: `{"version":3,"sources":["a.ts"],"names":[],"mappings":"AA"}`},
		{name: "BadVLQ", data: `{"version":3,"sources":["a.ts"],"names":[],"mappings":"A$AA"}`},
		{name: "SourcesContentLonger", data: `{"version":3,"sources":["a.ts"],"sourcesContent":["a","b"],"names":[],"mappings":""}`},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := ParseSourceMap([]byte(testCase.data))
			assert.Error(t, err)
		})
	}
}

func TestParseSourceMapDebugID(t *testing.T) {
	testCases := []struct {
		name     string
		data     string
		expected string
	}{
		{name: "DebugID_Lowercased", data: `{"version":3,"sources":[],"names":[],"mappings":"","debugId":"85314830-023F-4CF1-A267-535F4E37BB17"}`, expected: "85314830-023f-4cf1-a267-535f4e37bb17"},
		{name: "LegacyDebugID", data: `{"version":3,"sources":[],"names":[],"mappings":"","debug_id":"c2d1a1b0-0000-4000-8000-000000000001"}`, expected: "c2d1a1b0-0000-4000-8000-000000000001"},
		{name: "NotUUID_Ignored", data: `{"version":3,"sources":[],"names":[],"mappings":"","debugId":"build-42"}`, expected: ""},
		{name: "Absent", data: `{"version":3,"sources":[],"names":[],"mappings":""}`, expected: ""},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			sourceMap, err := ParseSourceMap([]byte(testCase.data))
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, sourceMap.DebugID())
		})
	}
}

// The expected positions were read with the source-map-js reference decoder
// from the esbuild bundle in testdata/sourcemap; the columns come from the
// stack node printed running it.
func TestSourceMapLookupEsbuildFixture(t *testing.T) {
	sourceMap, err := ParseSourceMap(readSourceMapFixture(t, "main.js.map"))
	require.NoError(t, err)

	testCases := []struct {
		name     string
		line     int
		column   int
		expected OriginalPosition
		found    bool
	}{
		{name: "Throw", line: 1, column: 41, expected: OriginalPosition{Source: "src/price.ts", Line: 3, Column: 11}, found: true},
		{name: "CallWithName", line: 1, column: 138, expected: OriginalPosition{Source: "src/index.ts", Line: 8, Column: 35, Name: "formatPrice"}, found: true},
		{name: "MapCall", line: 1, column: 131, expected: OriginalPosition{Source: "src/index.ts", Line: 8, Column: 21}, found: true},
		{name: "TopLevelCall", line: 1, column: 150, expected: OriginalPosition{Source: "src/index.ts", Line: 11, Column: 1, Name: "renderCart"}, found: true},
		{name: "InsideSegment_GreatestLowerBound", line: 1, column: 20, expected: OriginalPosition{Source: "src/price.ts", Line: 1, Column: 65}, found: true},
		{name: "BeforeFirstSegment_NotFound", line: 1, column: 1},
		{name: "LineWithoutMappings_NotFound", line: 2, column: 1},
		{name: "LineZero_NotFound", line: 0, column: 1},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			position, found := sourceMap.Lookup(testCase.line, testCase.column)
			assert.Equal(t, testCase.found, found)
			if testCase.found {
				assert.Equal(t, testCase.expected, position)
			}
		})
	}
}

func TestSourceMapLookupSynthetic(t *testing.T) {
	// Line 1: col 0 → a.ts 1:0, col 4 unmapped, col 8 → b.ts 2:2 "x".
	// Line 2: empty. Line 3: col 2 → b.ts 5:0, given out of order after col 6 → a.ts 9:3.
	sourceMap, err := ParseSourceMap([]byte(`{"version":3,"sources":["a.ts","b.ts"],"names":["x"],"mappings":"AAAA,I,ICCEA;;MDOC,JCJH"}`))
	require.NoError(t, err)

	testCases := []struct {
		name     string
		line     int
		column   int
		expected OriginalPosition
		found    bool
	}{
		{name: "FirstSegment", line: 1, column: 1, expected: OriginalPosition{Source: "a.ts", Line: 1, Column: 1}, found: true},
		{name: "SourcelessSegment_NotFound", line: 1, column: 6},
		{name: "NamedSegment", line: 1, column: 9, expected: OriginalPosition{Source: "b.ts", Line: 2, Column: 3, Name: "x"}, found: true},
		{name: "PastLastSegment", line: 1, column: 200, expected: OriginalPosition{Source: "b.ts", Line: 2, Column: 3, Name: "x"}, found: true},
		{name: "EmptyLine_NotFound", line: 2, column: 1},
		{name: "UnsortedSegments_Sorted", line: 3, column: 4, expected: OriginalPosition{Source: "b.ts", Line: 5, Column: 1}, found: true},
		{name: "UnsortedSegments_Later", line: 3, column: 7, expected: OriginalPosition{Source: "a.ts", Line: 9, Column: 4}, found: true},
		{name: "UnknownColumn_FirstSegment", line: 3, column: 0, expected: OriginalPosition{Source: "b.ts", Line: 5, Column: 1}, found: true},
		{name: "PastLastLine_NotFound", line: 4, column: 1},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			position, found := sourceMap.Lookup(testCase.line, testCase.column)
			assert.Equal(t, testCase.found, found)
			if testCase.found {
				assert.Equal(t, testCase.expected, position)
			}
		})
	}
}

func TestNormalizeSourceMapSource(t *testing.T) {
	testCases := []struct {
		name       string
		sourceRoot string
		source     string
		expected   string
	}{
		{name: "Relative", source: "src/price.ts", expected: "src/price.ts"},
		{name: "DotSlash", source: "./src/price.ts", expected: "src/price.ts"},
		{name: "ParentDirectories", source: "../../src/price.ts", expected: "src/price.ts"},
		{name: "Webpack_Namespace", source: "webpack://shop/./src/cart.tsx", expected: "src/cart.tsx"},
		{name: "Webpack_NoNamespace", source: "webpack:///./node_modules/react/index.js", expected: "node_modules/react/index.js"},
		{name: "HTTPURL", source: "https://shop.example.com/src/app.ts", expected: "src/app.ts"},
		{name: "SourceRoot", sourceRoot: "/app/", source: "src/a.ts", expected: "app/src/a.ts"},
		{name: "SourceRoot_URLSourceWins", sourceRoot: "/app/", source: "webpack://x/src/a.ts", expected: "src/a.ts"},
		{name: "Absolute", source: "/home/ci/build/src/a.ts", expected: "home/ci/build/src/a.ts"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, normalizeSourceMapSource(testCase.sourceRoot, testCase.source))
		})
	}
}

func TestSourceMapContext(t *testing.T) {
	long := strings.Repeat("x", maxContextLineLength+10)
	sourceMap, err := ParseSourceMap([]byte(`{"version":3,"sources":["a.ts","b.ts"],"sourcesContent":["one\ntwo\r\nthree\nfour\nfive\n` + long + `",null],"names":[],"mappings":"AAAA,CCAA"}`))
	require.NoError(t, err)

	testCases := []struct {
		name     string
		source   string
		line     int
		radius   int
		expected *SourceContext
	}{
		{name: "Middle", source: "a.ts", line: 3, radius: 1, expected: &SourceContext{StartLine: 2, Lines: []string{"two", "three", "four"}}},
		{name: "ClampedAtStart", source: "a.ts", line: 1, radius: 2, expected: &SourceContext{StartLine: 1, Lines: []string{"one", "two", "three"}}},
		{name: "LongLine_Truncated", source: "a.ts", line: 6, radius: 0, expected: &SourceContext{StartLine: 6, Lines: []string{long[:maxContextLineLength]}}},
		{name: "ZeroRadius", source: "a.ts", line: 4, radius: 0, expected: &SourceContext{StartLine: 4, Lines: []string{"four"}}},
		{name: "LineOutOfRange_Nil", source: "a.ts", line: 40, radius: 2},
		{name: "NoContent_Nil", source: "b.ts", line: 1, radius: 2},
		{name: "NegativeRadius_Nil", source: "a.ts", line: 1, radius: -1},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, sourceMap.Context(testCase.source, testCase.line, testCase.radius))
		})
	}
}

func TestSourceMapSize(t *testing.T) {
	small, err := ParseSourceMap([]byte(`{"version":3,"sources":["a.ts"],"names":[],"mappings":"AAAA"}`))
	require.NoError(t, err)
	fixture, err := ParseSourceMap(readSourceMapFixture(t, "main.js.map"))
	require.NoError(t, err)

	assert.Positive(t, small.Size())
	assert.Greater(t, fixture.Size(), small.Size())
}
