package rumtypes

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseJVMStackTrace(t *testing.T) {
	testCases := []struct {
		name          string
		stacktrace    string
		exceptionType string
		message       string
		expected      []*ErrorCause
	}{
		{
			name:       "HeaderFramesAndCause",
			stacktrace: "java.lang.IllegalStateException: boom\n\tat a.b.c(SourceFile:3)\n\tat java.lang.reflect.Method.invoke(Native Method)\nCaused by: a.d: inner\n\tat a.e.f(Unknown Source:12)\n\t... 2 more\n",
			expected: []*ErrorCause{
				{Type: "java.lang.IllegalStateException", Message: "boom", Frames: []StackFrame{{Function: "a.b.c", File: "SourceFile", Line: 3}, {Function: "java.lang.reflect.Method.invoke", File: "Native Method"}}},
				{Type: "a.d", Message: "inner", Relation: ErrorCauseRelationCausedBy, Frames: []StackFrame{{Function: "a.e.f", File: "Unknown Source", Line: 12}}, OmittedFrames: 2},
			},
		},
		{
			name:       "HeaderWithoutMessage",
			stacktrace: "java.lang.NullPointerException\n    at a.b.c(SourceFile)\n",
			expected:   []*ErrorCause{{Type: "java.lang.NullPointerException", Frames: []StackFrame{{Function: "a.b.c", File: "SourceFile"}}}},
		},
		{
			name:       "MultiLineMessage",
			stacktrace: "java.lang.RuntimeException: first\nsecond line\n\tat a.b.c(SourceFile:1)",
			expected:   []*ErrorCause{{Type: "java.lang.RuntimeException", Message: "first\nsecond line", Frames: []StackFrame{{Function: "a.b.c", File: "SourceFile", Line: 1}}}},
		},
		{
			name:       "ModuleAndLoaderPrefixes_Stripped",
			stacktrace: "java.lang.Error\n\tat java.base/java.lang.Thread.run(Thread.java:833)\n\tat app//com.example.Main.main(Main.kt:4)\n",
			expected:   []*ErrorCause{{Type: "java.lang.Error", Frames: []StackFrame{{Function: "java.lang.Thread.run", File: "Thread.java", Line: 833}, {Function: "com.example.Main.main", File: "Main.kt", Line: 4}}}},
		},
		{
			name:       "Suppressed",
			stacktrace: "java.io.IOException: close\n\tat a.b.c(SourceFile:1)\n\tSuppressed: java.io.IOException: flush\n\t\tat a.b.d(SourceFile:2)\n",
			expected: []*ErrorCause{
				{Type: "java.io.IOException", Message: "close", Frames: []StackFrame{{Function: "a.b.c", File: "SourceFile", Line: 1}}},
				{Type: "java.io.IOException", Message: "flush", Relation: ErrorCauseRelationSuppressed, Frames: []StackFrame{{Function: "a.b.d", File: "SourceFile", Line: 2}}},
			},
		},
		{
			name:          "FramesOnly_TypeFromAttributes",
			stacktrace:    "java.lang.Thread.sleep(Native Method)\ncom.example.Main.run(Main.kt:9)\n",
			exceptionType: ExceptionTypeANR,
			message:       "Application Not Responding",
			expected:      []*ErrorCause{{Type: ExceptionTypeANR, Message: "Application Not Responding", Frames: []StackFrame{{Function: "java.lang.Thread.sleep", File: "Native Method"}, {Function: "com.example.Main.run", File: "Main.kt", Line: 9}}}},
		},
		{
			name:          "Empty_TypeFromAttributes",
			stacktrace:    "",
			exceptionType: "java.lang.OutOfMemoryError",
			expected:      []*ErrorCause{{Type: "java.lang.OutOfMemoryError", Frames: []StackFrame{}}},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			trace := ParseJVMStackTrace(testCase.stacktrace, testCase.exceptionType, testCase.message)
			assert.Equal(t, testCase.expected, trace.Exceptions)
		})
	}
}

func TestRetraceJVMStackTrace(t *testing.T) {
	mapping, err := ParseR8Mapping([]byte(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)

	testCases := []struct {
		name          string
		fixture       string
		exceptionType string
		expected      string
	}{
		{
			name:    "Crash_InlinedRewrittenAndSynthesizedFrames",
			fixture: "crash.txt",
			expected: "com.example.shop.CartException: Cart is empty\n" +
				"\tat com.example.shop.Item.price(Item.kt:15)\n" +
				"\tat com.example.shop.Cart.subtotal(Cart.kt:44)\n" +
				"\tat com.example.shop.Cart.checkout(Cart.kt:51)\n" +
				"\tat com.example.shop.CheckoutActivity.onCreate(CheckoutActivity.kt:27)\n" +
				"\tat android.app.Activity.performCreate(Activity.java:8595)\n" +
				"\tat android.app.ActivityThread.main(ActivityThread.java:8177)\n" +
				"\tat java.lang.reflect.Method.invoke(Native Method)\n" +
				"\tat com.android.internal.os.ZygoteInit.main(ZygoteInit.java:971)\n" +
				"Caused by: java.lang.NullPointerException: Attempt to invoke virtual method 'long a.d.a()' on a null object reference\n" +
				"\tat com.example.shop.Cart.subtotal(Cart.kt:44)\n" +
				"\t... 5 more\n",
		},
		{
			name:          "ANR_OutlineAndLambda",
			fixture:       "anr.txt",
			exceptionType: ExceptionTypeANR,
			expected: "ANR\n" +
				"\tat java.lang.Thread.sleep(Native Method)\n" +
				"\tat java.lang.Thread.sleep(Thread.java:450)\n" +
				"\tat com.example.shop.CheckoutActivity.onPay(CheckoutActivity.kt:40)\n" +
				"\tat com.example.shop.CheckoutActivity.lambda$onCreate$0(CheckoutActivity.kt:33)\n" +
				"\tat android.view.View.performClick(View.java:7659)\n" +
				"\tat android.os.Looper.loop(Looper.java:317)\n" +
				"\tat android.app.ActivityThread.main(ActivityThread.java:8177)\n",
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			trace := ParseJVMStackTrace(readR8Fixture(t, testCase.fixture), testCase.exceptionType, "")
			retraced, ok := RetraceJVMStackTrace(trace, mapping, "/mapping.txt")
			assert.True(t, ok)
			assert.Equal(t, testCase.expected, retraced.String())
		})
	}
}

func TestRetraceJVMStackTraceFrames(t *testing.T) {
	mapping, err := ParseR8Mapping([]byte(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)

	parsed := ParseJVMStackTrace(readR8Fixture(t, "crash.txt"), "", "")
	retraced, ok := RetraceJVMStackTrace(parsed, mapping, "/mapping.txt")
	require.True(t, ok)
	frames := retraced.Exceptions[0].Frames
	require.Len(t, frames, 8)

	assert.Equal(t, StackFrame{Function: "a.b.a", File: "SourceFile", Line: 6, Original: &OriginalFrame{Function: "com.example.shop.Item.price", File: "Item.kt", Line: 15, InApp: true, Inlined: true, SourceMap: "/mapping.txt"}}, frames[0])
	assert.Equal(t, "a.b.a", frames[1].Function, "an inlined frame keeps the obfuscated frame it came from")
	assert.False(t, frames[1].Original.Inlined)
	assert.Nil(t, frames[4].Original, "frames of classes outside the mapping stay as they are")
	assert.Equal(t, "a.a", parsed.Exceptions[0].Type, "retrace leaves its input as it is")
	assert.Equal(t, "com.example.shop.CartException", retraced.Exceptions[0].Type)

	_, ok = RetraceJVMStackTrace(ParseJVMStackTrace("java.lang.Error\n\tat android.app.Activity.performCreate(Activity.java:1)\n", "", ""), mapping, "/mapping.txt")
	assert.False(t, ok, "nothing in the mapping")
}

func TestNewJVMErrorFingerprint(t *testing.T) {
	mapping, err := ParseR8Mapping([]byte(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)
	retraced, _ := RetraceJVMStackTrace(ParseJVMStackTrace(readR8Fixture(t, "crash.txt"), "", ""), mapping, "/mapping.txt")
	base := NewJVMErrorFingerprint(retraced)

	testCases := []struct {
		name       string
		stacktrace string
		same       bool
	}{
		{name: "OtherLinesAndMessage_Same", stacktrace: "com.example.shop.CartException: Cart 42 is empty\n\tat com.example.shop.Item.price(Item.kt:99)\n\tat com.example.shop.Cart.subtotal(Cart.kt:1)\n\tat android.os.Handler.run(Handler.java:1)\n\tat com.example.shop.Cart.checkout(Cart.kt:7)\n", same: true},
		{name: "OtherInAppFrame_Differs", stacktrace: "com.example.shop.CartException: Cart is empty\n\tat com.example.shop.Item.price(Item.kt:15)\n\tat com.example.shop.Cart.add(Cart.kt:44)\n\tat com.example.shop.Cart.checkout(Cart.kt:51)\n", same: false},
		{name: "OtherType_Differs", stacktrace: "java.lang.IllegalStateException: Cart is empty\n\tat com.example.shop.Item.price(Item.kt:15)\n\tat com.example.shop.Cart.subtotal(Cart.kt:44)\n\tat com.example.shop.Cart.checkout(Cart.kt:51)\n", same: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fingerprint := NewJVMErrorFingerprint(ParseJVMStackTrace(testCase.stacktrace, "", ""))
			assert.True(t, IsErrorFingerprint(fingerprint))
			assert.Equal(t, testCase.same, fingerprint == base)
		})
	}
}

func TestJVMTopInAppFrames(t *testing.T) {
	testCases := []struct {
		name       string
		stacktrace string
		expected   []string
	}{
		{name: "LibraryFramesSkipped", stacktrace: "java.lang.Error\n\tat java.util.ArrayList.get(ArrayList.java:1)\n\tat androidx.recyclerview.widget.RecyclerView.a(RecyclerView.java:2)\n\tat com.example.Main.run(Main.kt:3)\n", expected: []string{"com.example.Main.run"}},
		{name: "CauseFramesFollow", stacktrace: "java.lang.RuntimeException: wrap\n\tat android.app.ActivityThread.main(ActivityThread.java:1)\nCaused by: java.lang.NullPointerException\n\tat com.example.A.a(A.kt:1)\n\tat com.example.B.b(B.kt:2)\n", expected: []string{"com.example.A.a", "com.example.B.b"}},
		{name: "OnlyLibrary_TopFrames", stacktrace: "java.lang.Error\n\tat android.os.Looper.loop(Looper.java:1)\n\tat android.app.ActivityThread.main(ActivityThread.java:2)\n", expected: []string{"android.os.Looper.loop", "android.app.ActivityThread.main"}},
		{name: "NoFrames_None", stacktrace: "java.lang.Error", expected: []string{}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			functions := []string{}
			for _, frame := range JVMTopInAppFrames(ParseJVMStackTrace(testCase.stacktrace, "", ""), 3) {
				functions = append(functions, frame.OriginalFunction())
			}
			assert.Equal(t, testCase.expected, functions)
		})
	}
}

func TestJVMKeyPatterns(t *testing.T) {
	frameLine, causeType := regexp.MustCompile(JVMStackFrameLinePattern), regexp.MustCompile(JVMCauseTypePattern)
	testCases := []struct {
		name string
		line string
		kept bool
		key  string
	}{
		{name: "AtFrame_Kept", line: "\tat a.b.c(SourceFile:3)", kept: true, key: "\tat a.b.c(SourceFile:3)"},
		{name: "BareFrame_Kept", line: "java.lang.Thread.sleep(Native Method)", kept: true, key: "java.lang.Thread.sleep(Native Method)"},
		{name: "CauseMessage_Dropped", line: "Caused by: java.lang.IllegalStateException: order 42 missing", kept: true, key: "Caused by: java.lang.IllegalStateException"},
		{name: "Suppressed_Kept", line: "\tSuppressed: java.io.IOException: flush", kept: true, key: "\tSuppressed: java.io.IOException"},
		{name: "Header_Dropped", line: "java.lang.IllegalStateException: Expected a.b(c)"},
		{name: "Omitted_Dropped", line: "\t... 5 more"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.kept, frameLine.MatchString(testCase.line))
			if testCase.kept {
				assert.Equal(t, testCase.key, causeType.ReplaceAllString(testCase.line, "$1"))
			}
		})
	}
}
