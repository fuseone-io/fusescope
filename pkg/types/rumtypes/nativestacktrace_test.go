package rumtypes

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseNativeStackTrace(t *testing.T) {
	testCases := []struct {
		name, stack, file, function string
		count                       int
	}{
		{name: "Android64_WithSymbolAndBuildID", stack: "signal 6 (SIGABRT)\n    #00 pc 0000000000012a40 /apex/com.android.runtime/lib64/bionic/libc.so (abort+164) (BuildId: 12ab)\n    #01 pc 0000000000000042 /data/app/random/base.apk!lib/arm64-v8a/libshop.so (checkout+4) (BuildId: 34cd)", count: 2, file: "/apex/com.android.runtime/lib64/bionic/libc.so", function: "abort+164 · pc 0x12a40"},
		{name: "Android32_WithoutSymbol", stack: "#00 pc 0000000a /data/app/build/lib/arm/libsample.so", count: 1, file: "/data/app/build/lib/arm/libsample.so", function: "pc 0xa"},
		{name: "IgnoresNonFrames", stack: "registers x0 1234\n#00 pc nothex lib.so\nat shop.pay(SourceFile:1)", count: 0},
		{name: "StopsBeforeAnotherThread", stack: "#00 pc 12 /data/app/libone.so\n#01 pc 14 /data/app/libtwo.so\nother thread:\n#00 pc 16 /data/app/libthree.so", count: 2, file: "/data/app/libone.so", function: "pc 0x12"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			trace := ParseNativeStackTrace(testCase.stack)
			require.Len(t, trace.Frames, testCase.count)
			if testCase.count > 0 {
				assert.Equal(t, testCase.file, trace.Frames[0].File)
				assert.Equal(t, testCase.function, trace.Frames[0].Function)
				assert.Nil(t, trace.Frames[0].Original)
			}
		})
	}
}

func TestNativeFingerprint(t *testing.T) {
	first := ParseNativeStackTrace("#00 pc 00000012 /data/app/install-a/lib/arm64/libshop.so (pay+4) (BuildId: abcd)")
	relocated := ParseNativeStackTrace("#00 pc 12 /data/app/install-b/lib/arm64/libshop.so (renamed+8) (BuildId: abcd)")
	assert.Equal(t, NewNativeErrorFingerprint(first, "SIGSEGV", "address 123"), NewNativeErrorFingerprint(relocated, "SIGSEGV", "address 456"))
	testCases := []struct{ name, stack, kind string }{
		{"DifferentOffset", "#00 pc 14 /data/app/libshop.so (BuildId: abcd)", "SIGSEGV"},
		{"DifferentLibrary", "#00 pc 12 /data/app/libother.so (BuildId: abcd)", "SIGSEGV"},
		{"DifferentBuild", "#00 pc 12 /data/app/libshop.so (BuildId: ffff)", "SIGSEGV"},
		{"DifferentSignal", "#00 pc 12 /data/app/libshop.so (BuildId: abcd)", "SIGABRT"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.NotEqual(t, NewNativeErrorFingerprint(first, "SIGSEGV", "address"), NewNativeErrorFingerprint(ParseNativeStackTrace(testCase.stack), testCase.kind, "address"))
		})
	}
}

func TestNativeStackBounds(t *testing.T) {
	trace := ParseNativeStackTrace(strings.Repeat("#01 pc 42 /data/app/libbounded.so\n", MaxStackFrames+100))
	assert.Len(t, trace.Frames, MaxStackFrames)
	assert.True(t, trace.Truncated)
	oversized := ParseNativeStackTrace(strings.Repeat("not a frame\n", MaxStackTraceBytes))
	assert.Empty(t, oversized.Frames)
	assert.True(t, oversized.Truncated)
}

func TestNativeFingerprintPrefersApplicationFrames(t *testing.T) {
	common := "#00 pc 10 /apex/com.android.runtime/lib64/bionic/libc.so\n#01 pc 20 /system/lib64/libcutils.so\n#02 pc 30 /vendor/lib64/libcommon.so\n"
	first := ParseNativeStackTrace(common + "#03 pc 40 /data/app/install/libshop.so")
	second := ParseNativeStackTrace(common + "#03 pc 50 /data/app/install/libshop.so")
	assert.NotEqual(t, NewNativeErrorFingerprint(first, "SIGABRT", "abort"), NewNativeErrorFingerprint(second, "SIGABRT", "abort"))
}
