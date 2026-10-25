package rumtypes

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func readR8Fixture(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "r8", name))
	require.NoError(t, err)
	return string(data)
}

func TestParseR8Mapping(t *testing.T) {
	mapping, err := ParseR8Mapping([]byte(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)

	assert.Equal(t, "7e4c1a9", mapping.MapID())
	assert.Equal(t, "2.2", mapping.Version())
	assert.Positive(t, mapping.Size())

	testCases := []struct {
		name       string
		obfuscated string
		original   string
		found      bool
	}{
		{name: "Renamed_Retraced", obfuscated: "a.b", original: "com.example.shop.Cart", found: true},
		{name: "Kept_Retraced", obfuscated: "com.example.shop.CheckoutActivity", original: "com.example.shop.CheckoutActivity", found: true},
		{name: "SynthesizedLambda_Retraced", obfuscated: "c.a", original: "com.example.shop.CheckoutActivity$$ExternalSyntheticLambda0", found: true},
		{name: "Unknown_NotFound", obfuscated: "z.z", original: "z.z", found: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			original, found := mapping.RetraceClass(testCase.obfuscated)
			assert.Equal(t, testCase.found, found)
			assert.Equal(t, testCase.original, original)
		})
	}

	field, ok := mapping.RetraceField("a.b", "a")
	assert.True(t, ok)
	assert.Equal(t, "items", field)
	_, ok = mapping.RetraceField("a.b", "zz")
	assert.False(t, ok)
}

func TestParseR8MappingRejects(t *testing.T) {
	testCases := []struct {
		name    string
		content string
		message string
	}{
		{name: "Empty_Rejected", content: "", message: "no class mappings"},
		{name: "OnlyComments_Rejected", content: "# compiler: R8\n# pg_map_id: 1\n", message: "no class mappings"},
		{name: "SourceMapJSON_Rejected", content: `{"version":3,"mappings":"AAAA"}`, message: "line 1"},
		{name: "MemberBeforeClass_Rejected", content: "    int a -> b\n", message: "line 1"},
		{name: "GarbageMember_Rejected", content: "a.B -> a:\n    this is not a member\n", message: "line 2"},
		{name: "InvertedRange_Rejected", content: "a.B -> a:\n    5:2:void m():1:1 -> a\n", message: "line 2"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := ParseR8Mapping([]byte(testCase.content))
			require.Error(t, err)
			_, code, message, _, _, _ := errors.Unwrapb(err)
			assert.Equal(t, ErrCodeR8MappingInvalid, code)
			assert.Contains(t, message, testCase.message)
		})
	}
}

func TestR8MappingLookupFrame(t *testing.T) {
	r8, err := ParseR8Mapping([]byte(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)
	proguard, err := ParseR8Mapping([]byte(readR8Fixture(t, "proguard.txt")))
	require.NoError(t, err)

	testCases := []struct {
		name     string
		mapping  *R8Mapping
		class    string
		method   string
		line     int
		expected []R8Frame
	}{
		{
			name: "InlinedChain_InnermostFirst", mapping: r8, class: "a.b", method: "a", line: 6,
			expected: []R8Frame{
				{Class: "com.example.shop.Item", Method: "price", File: "Item.kt", Line: 15, Inlined: true},
				{Class: "com.example.shop.Cart", Method: "subtotal", File: "Cart.kt", Line: 44, RewriteThrows: []string{"java.lang.NullPointerException"}, RewriteRemove: 1},
			},
		},
		{
			name: "InlinedFromOtherClass_ItsSourceFile", mapping: r8, class: "a.b", method: "a", line: 1,
			expected: []R8Frame{
				{Class: "com.example.shop.Money", Method: "check", File: "Money.kt", Line: 21, Inlined: true},
				{Class: "com.example.shop.Cart", Method: "add", File: "Cart.kt", Line: 34},
			},
		},
		{name: "Range_LineOffset", mapping: r8, class: "a.b", method: "a", line: 3, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "add", File: "Cart.kt", Line: 36}}},
		{name: "OverloadedObfuscatedName_ByRange", mapping: r8, class: "a.b", method: "a", line: 7, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "sync", File: "Cart.kt", Line: 90}}},
		{name: "OtherMethod_Range", mapping: r8, class: "a.b", method: "b", line: 2, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "checkout", File: "Cart.kt", Line: 51}}},
		{name: "Rangeless_LineKept", mapping: r8, class: "a.b", method: "c", line: 17, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "clear", File: "Cart.kt", Line: 17}}},
		{name: "CatchAll_UnknownLine", mapping: r8, class: "a.b", method: "d", line: 0, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "describe", File: "Cart.kt", Line: 60}}},
		{name: "CatchAll_AnyLine", mapping: r8, class: "a.b", method: "d", line: 999, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "describe", File: "Cart.kt", Line: 60}}},
		{name: "Synthesized_Marked", mapping: r8, class: "a.b", method: "e", line: 1, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "access$000", File: "Cart.kt", Line: 0, Synthesized: true}}},
		{name: "NoRangeMatch_FirstCandidateNoLine", mapping: r8, class: "a.b", method: "a", line: 99, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "add", File: "Cart.kt", Line: 0}}},
		{name: "UnmappedMethod_ClassRetraced", mapping: r8, class: "a.b", method: "zz", line: 4, expected: []R8Frame{{Class: "com.example.shop.Cart", Method: "zz", File: "Cart.kt", Line: 4}}},
		{name: "Outline_Marked", mapping: r8, class: "b.a", method: "a", line: 1, expected: []R8Frame{{Class: "com.example.shop.Outlines", Method: "outline0", File: "Outlines.java", Line: 0, Synthesized: true, Outline: true}}},
		{
			name: "SynthesizedClassCaller_Marked", mapping: r8, class: "c.a", method: "onClick", line: 1,
			expected: []R8Frame{
				{Class: "com.example.shop.CheckoutActivity", Method: "lambda$onCreate$0", File: "CheckoutActivity.kt", Line: 33, Inlined: true},
				{Class: "com.example.shop.CheckoutActivity$$ExternalSyntheticLambda0", Method: "onClick", File: "CheckoutActivity.kt", Line: 0, Synthesized: true},
			},
		},
		{name: "UnknownClass_Nil", mapping: r8, class: "android.app.Activity", method: "performCreate", line: 8595, expected: nil},
		{name: "ProGuardRangeWithoutOriginal_LineKept", mapping: proguard, class: "a", method: "main", line: 4, expected: []R8Frame{{Class: "com.example.legacy.Main", Method: "main", File: "Main.java", Line: 4}}},
		{name: "ProGuardRange_Offset", mapping: proguard, class: "b", method: "a", line: 11, expected: []R8Frame{{Class: "com.example.legacy.Util", Method: "parse", File: "Util.java", Line: 101}}},
		{name: "ProGuardOverloads_SameName", mapping: proguard, class: "a", method: "a", line: 0, expected: []R8Frame{{Class: "com.example.legacy.Main", Method: "helper", File: "Main.java", Line: 0}}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, testCase.mapping.LookupFrame(testCase.class, testCase.method, testCase.line))
		})
	}
}

func TestR8MappingOutlineCallsite(t *testing.T) {
	mapping, err := ParseR8Mapping([]byte(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)

	testCases := []struct {
		name     string
		position int
		line     int
		ok       bool
	}{
		{name: "KnownPosition_Mapped", position: 1, line: 7, ok: true},
		{name: "SecondPosition_Mapped", position: 2, line: 8, ok: true},
		{name: "UnknownPosition_NotMapped", position: 5, ok: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			line, ok := mapping.OutlineCallsiteLine("com.example.shop.CheckoutActivity", "a", 9, testCase.position)
			assert.Equal(t, testCase.ok, ok)
			assert.Equal(t, testCase.line, line)
		})
	}
}

func TestR8MappingVersionGatesMetadata(t *testing.T) {
	content := "# {\"id\":\"com.android.tools.r8.mapping\",\"version\":\"9.0\"}\na.B -> a:\n    1:1:void m():5:5 -> a\n    # {\"id\":\"com.android.tools.r8.synthesized\"}\n"
	mapping, err := ParseR8Mapping([]byte(content))
	require.NoError(t, err)
	assert.Equal(t, []R8Frame{{Class: "a.B", Method: "m", File: "B.java", Line: 5}}, mapping.LookupFrame("a", "a", 1), "metadata of an unsupported version is a comment")
}
