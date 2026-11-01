package rumtypes

import (
	"crypto/sha256"
	"encoding/hex"
	"path"
	"regexp"
	"strings"
)

// NativeStackFrameLinePattern filters ClickHouse keys before the stricter parser.
// Counted repetitions here make clickhouse-go mistake braces across regex literals
// for native query parameters ({name:type}).
const NativeStackFrameLinePattern = `^\s*#[0-9]+\s+pc\s+[0-9a-fA-F]+\s+\S+`

var (
	nativeFrameLine = regexp.MustCompile(`^\s*#([0-9]{1,5})\s+pc\s+([0-9a-fA-F]{1,16})\s+(\S+)(.*)$`)
	nativeBuildID   = regexp.MustCompile(`\s*\(BuildId:\s*([0-9a-fA-F]+)\)\s*$`)
)

// NativeStackTrace keeps the crashing thread's frames, without interpreting memory dumps.
type NativeStackTrace struct {
	Frames     []StackFrame
	Truncated  bool
	identities []string
}

func ParseNativeStackTrace(stack string) *NativeStackTrace {
	stack, truncated := TruncateStack(stack, MaxStackTraceBytes)
	trace := &NativeStackTrace{Frames: []StackFrame{}, Truncated: truncated}
	for line := range strings.SplitSeq(stack, "\n") {
		match := nativeFrameLine.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		if len(trace.Frames) > 0 && strings.TrimLeft(match[1], "0") == "" {
			break
		}
		if len(trace.Frames) == MaxStackFrames {
			trace.Truncated = true
			break
		}
		offset := strings.TrimLeft(strings.ToLower(match[2]), "0")
		if offset == "" {
			offset = "0"
		}
		rest, build := strings.TrimSpace(match[4]), ""
		if id := nativeBuildID.FindStringSubmatch(rest); id != nil {
			build = strings.ToLower(id[1])
			rest = nativeBuildID.ReplaceAllString(rest, "")
		}
		symbol := strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(rest), "("), ")")
		function := "pc 0x" + offset
		if symbol != "" {
			function = symbol + " · " + function
		}
		trace.Frames = append(trace.Frames, StackFrame{File: match[3], Function: function})
		trace.identities = append(trace.identities, path.Base(match[3])+"\x1f"+offset+"\x1f"+build)
	}
	return trace
}

// NewNativeErrorFingerprint uses library-relative PCs rather than process addresses or installation paths.
// A build id, when available, keeps different library builds from sharing an offset accidentally.
func NewNativeErrorFingerprint(trace *NativeStackTrace, exceptionType, message string) string {
	parts := []string{"native", exceptionType}
	for _, index := range nativeTopFrameIndexes(trace, 3) {
		parts = append(parts, trace.identities[index])
	}
	if len(trace.identities) == 0 {
		parts = append(parts, NormalizeErrorMessage(message))
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x1f")))
	return hex.EncodeToString(sum[:])[:ErrorFingerprintLength]
}

// NativeTopInAppFrames prefers application code over common abort/syscall frames.
func NativeTopInAppFrames(trace *NativeStackTrace, limit int) []StackFrame {
	frames := []StackFrame{}
	for _, index := range nativeTopFrameIndexes(trace, limit) {
		frames = append(frames, trace.Frames[index])
	}
	return frames
}

func nativeTopFrameIndexes(trace *NativeStackTrace, limit int) []int {
	app, all := []int{}, []int{}
	for index, frame := range trace.Frames {
		if len(all) < limit {
			all = append(all, index)
		}
		system := strings.HasPrefix(frame.File, "/apex/") || strings.HasPrefix(frame.File, "/system/") || strings.HasPrefix(frame.File, "/vendor/")
		if !system && len(app) < limit {
			app = append(app, index)
		}
	}
	if len(app) > 0 {
		return app
	}
	return all
}
