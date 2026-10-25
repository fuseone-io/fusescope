package rumtypes

import (
	"regexp"
	"strconv"
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

// The expected traces are R8 retrace 9.x output for the same mapping.
func TestRetraceJVMStackTraceMatchesR8(t *testing.T) {
	sample, err := ParseR8Mapping([]byte(readR8Fixture(t, "sample/mapping.txt")))
	require.NoError(t, err)
	ranges, err := ParseR8Mapping([]byte("# {\"id\":\"com.android.tools.r8.mapping\",\"version\":\"2.2\"}\n" +
		"com.example.Foo -> a:\n" +
		"# {\"id\":\"sourceFile\",\"fileName\":\"Foo.kt\"}\n" +
		"    int $r8$clinit -> H\n" +
		"      # {\"id\":\"com.android.tools.r8.synthesized\"}\n" +
		"    1:3:void com.example.Bar.baz():10:10 -> a\n" +
		"    1:3:void syn():0 -> a\n" +
		"      # {\"id\":\"com.android.tools.r8.synthesized\"}\n" +
		"    7:9:void hidden():5:7 -> a\n" +
		"    1:2:int range(int):20:21 -> b\n" +
		"    3:3:int range(int):30 -> b\n" +
		"    4:6:int noOriginal(int) -> b\n" +
		"    1:4:void com.example.Bar.one():40:40 -> c\n" +
		"    1:4:void com.example.Baz.two():50 -> c\n" +
		"    1:4:void outer():12 -> c\n" +
		"    5:5:java.lang.Object get(long):70:70 -> g\n" +
		"    6:6:java.lang.Object get(long):0 -> g\n" +
		"      # {\"id\":\"com.android.tools.r8.synthesized\"}\n" +
		"    5:5:void com.example.Bar.next():143:143 -> g\n" +
		"    5:5:java.lang.Object get():481 -> g\n"))
	require.NoError(t, err)

	testCases := []struct {
		name       string
		mapping    *R8Mapping
		stacktrace string
		expected   string
	}{
		{name: "SampleCrash_InlinedIntoSyntheticLambda", mapping: sample, stacktrace: readR8Fixture(t, "sample/crash.txt"), expected: readR8Fixture(t, "sample/crash.retraced.txt")},
		{name: "SampleHandled_InlinedIntoSyntheticLambda", mapping: sample, stacktrace: readR8Fixture(t, "sample/handled.txt"), expected: readR8Fixture(t, "sample/handled.retraced.txt")},
		{name: "SampleANR_BelowLibraryFrames", mapping: sample, stacktrace: readR8Fixture(t, "sample/anr.txt"), expected: readR8Fixture(t, "sample/anr.retraced.txt")},
		{
			name:    "RangeForms_SynthesizedResidualSignatureHidden",
			mapping: ranges,
			stacktrace: "java.lang.RuntimeException: boom\n\tat a.a(SourceFile:2)\n\tat a.a(SourceFile:8)\n\tat a.b(SourceFile:2)\n\tat a.b(SourceFile:3)\n" +
				"\tat a.b(SourceFile:5)\n\tat a.c(SourceFile:3)\n\tat a.g(SourceFile:5)\n\tat a.g(SourceFile:6)\n\tat java.lang.Thread.run(Thread.java:1012)\n",
			expected: "java.lang.RuntimeException: boom\n" +
				"\tat com.example.Bar.baz(Bar.java:10)\n" +
				"\tat com.example.Foo.range(Foo.kt:21)\n" +
				"\tat com.example.Foo.range(Foo.kt:30)\n" +
				"\tat com.example.Foo.noOriginal(Foo.kt:5)\n" +
				"\tat com.example.Bar.one(Bar.java:40)\n" +
				"\tat com.example.Baz.two(Baz.java:50)\n" +
				"\tat com.example.Foo.outer(Foo.kt:12)\n" +
				"\tat com.example.Bar.next(Bar.java:143)\n" +
				"\tat com.example.Foo.get(Foo.kt:481)\n" +
				"\tat java.lang.Thread.run(Thread.java:1012)\n",
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			retraced, ok := RetraceJVMStackTrace(ParseJVMStackTrace(testCase.stacktrace, "", ""), testCase.mapping, "/mapping.txt")
			assert.True(t, ok)
			assert.Equal(t, testCase.expected, retraced.String())
		})
	}
}

func TestRetraceJVMStackTraceSampleFrames(t *testing.T) {
	mapping, err := ParseR8Mapping([]byte(readR8Fixture(t, "sample/mapping.txt")))
	require.NoError(t, err)

	testCases := []struct {
		name     string
		fixture  string
		expected []string
	}{
		{name: "Crash", fixture: "sample/crash.txt", expected: []string{"io.fusescope.sample.Checkout.pay:103:true", "io.fusescope.sample.MainActivity.onCreate$lambda$1:32:true", "io.fusescope.sample.MainActivity.onNewIntent:60:true"}},
		{name: "Handled", fixture: "sample/handled.txt", expected: []string{"io.fusescope.sample.MainActivity.onCreate$lambda$0:31:true", "io.fusescope.sample.MainActivity.onNewIntent:60:true", "android.app.Activity.onNewIntent:2418:false"}},
		{name: "ANR", fixture: "sample/anr.txt", expected: []string{"io.fusescope.sample.MainActivity.onCreate$lambda$2:33:true", "io.fusescope.sample.MainActivity.onNewIntent:60:true", "android.app.Activity.onNewIntent:2418:false"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			retraced, _ := RetraceJVMStackTrace(ParseJVMStackTrace(readR8Fixture(t, testCase.fixture), "", ""), mapping, "/mapping.txt")
			frames := []string{}
			for _, frame := range retraced.Exceptions[0].Frames {
				if frame.Original != nil || len(frames) > 0 {
					inApp, line := false, frame.Line
					if frame.Original != nil {
						inApp, line = frame.Original.InApp, frame.Original.Line
					}
					frames = append(frames, frame.OriginalFunction()+":"+strconv.Itoa(line)+":"+strconv.FormatBool(inApp))
				}
			}
			require.GreaterOrEqual(t, len(frames), len(testCase.expected))
			assert.Equal(t, testCase.expected, frames[:len(testCase.expected)])
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
	base := NewJVMErrorFingerprint(retraced, ErrorSourceCrash)

	testCases := []struct {
		name       string
		stacktrace string
		source     string
		same       bool
	}{
		{name: "OtherLinesAndMessage_Same", stacktrace: "com.example.shop.CartException: Cart 42 is empty\n\tat com.example.shop.Item.price(Item.kt:99)\n\tat com.example.shop.Cart.subtotal(Cart.kt:1)\n\tat android.os.Handler.run(Handler.java:1)\n\tat com.example.shop.Cart.checkout(Cart.kt:7)\n", source: ErrorSourceCrash, same: true},
		{name: "OtherInAppFrame_Differs", stacktrace: "com.example.shop.CartException: Cart is empty\n\tat com.example.shop.Item.price(Item.kt:15)\n\tat com.example.shop.Cart.add(Cart.kt:44)\n\tat com.example.shop.Cart.checkout(Cart.kt:51)\n", source: ErrorSourceCrash, same: false},
		{name: "OtherType_Differs", stacktrace: "java.lang.IllegalStateException: Cart is empty\n\tat com.example.shop.Item.price(Item.kt:15)\n\tat com.example.shop.Cart.subtotal(Cart.kt:44)\n\tat com.example.shop.Cart.checkout(Cart.kt:51)\n", source: ErrorSourceCrash, same: false},
		{name: "HandledSameTrace_Differs", stacktrace: "com.example.shop.CartException: Cart is empty\n\tat com.example.shop.Item.price(Item.kt:15)\n\tat com.example.shop.Cart.subtotal(Cart.kt:44)\n\tat com.example.shop.Cart.checkout(Cart.kt:51)\n", source: "manual", same: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fingerprint := NewJVMErrorFingerprint(ParseJVMStackTrace(testCase.stacktrace, "", ""), testCase.source)
			assert.True(t, IsErrorFingerprint(fingerprint))
			assert.Equal(t, testCase.same, fingerprint == base)
		})
	}
}

func TestNewJVMErrorFingerprintSample(t *testing.T) {
	mapping, err := ParseR8Mapping([]byte(readR8Fixture(t, "sample/mapping.txt")))
	require.NoError(t, err)

	testCases := []struct {
		name     string
		fixture  string
		source   string
		expected []string
	}{
		{name: "Crash", fixture: "sample/crash.txt", source: ErrorSourceCrash, expected: []string{"io.fusescope.sample.Checkout.pay", "io.fusescope.sample.MainActivity.onCreate$lambda$1", "io.fusescope.sample.MainActivity.onNewIntent"}},
		{name: "Handled", fixture: "sample/handled.txt", source: "manual", expected: []string{"io.fusescope.sample.MainActivity.onCreate$lambda$0", "io.fusescope.sample.MainActivity.onNewIntent"}},
		{name: "ANR", fixture: "sample/anr.txt", source: ErrorSourceANR, expected: []string{"io.fusescope.sample.MainActivity.onCreate$lambda$2", "io.fusescope.sample.MainActivity.onNewIntent"}},
	}
	fingerprints := map[string]string{}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			retraced, _ := RetraceJVMStackTrace(ParseJVMStackTrace(readR8Fixture(t, testCase.fixture), "", ""), mapping, "/mapping.txt")
			functions := []string{}
			for _, frame := range JVMTopInAppFrames(retraced, 3) {
				functions = append(functions, frame.OriginalFunction())
			}
			assert.Equal(t, testCase.expected, functions, "synthesized and library frames stay out of the fingerprint")
			fingerprints[NewJVMErrorFingerprint(retraced, testCase.source)] = testCase.name
		})
	}
	assert.Len(t, fingerprints, len(testCases), "crash, handled error and ANR group apart")
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
