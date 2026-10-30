package rumtypes

import "strings"

// Bounds on what an error event's client-sent stacks cost to parse,
// symbolicate and return. The browser SDK sends component stacks of at
// most 4 KiB.
const (
	MaxStackTraceBytes      = 64 << 10
	MaxStackFrames          = 200
	MaxComponentStackBytes  = 8 << 10
	MaxComponentStackFrames = 50
	maxJVMExceptions        = 32
	maxContextRadius        = 10
)

// TruncateStack cuts text to at most limit bytes on a rune boundary, and
// reports whether it cut.
func TruncateStack(text string, limit int) (string, bool) {
	if len(text) <= limit {
		return text, false
	}
	return truncateUTF8(text, limit), true
}

// ParseEventStackFrames parses at most MaxStackFrames frames of the first
// MaxStackTraceBytes of stacktrace, and reports whether it left any out.
func ParseEventStackFrames(stacktrace string) ([]StackFrame, bool) {
	stacktrace, truncated := TruncateStack(stacktrace, MaxStackTraceBytes)
	frames := []StackFrame{}
	for line := range strings.SplitSeq(stacktrace, "\n") {
		if !stackFrameLine.MatchString(line) {
			continue
		}
		if len(frames) == MaxStackFrames {
			return frames, true
		}
		frames = append(frames, parseStackFrame(line))
	}
	return frames, truncated
}
