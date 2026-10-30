package rumtypes

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// ExceptionTypeANR is the exception.type of an Application Not Responding
// event, whose stack trace is the main thread's.
const (
	ExceptionTypeANR    = "ANR"
	jvmFingerprintDepth = 3
)

var (
	ErrorCauseRelationCausedBy   = ErrorCauseRelation{valuer.NewString("caused_by")}
	ErrorCauseRelationSuppressed = ErrorCauseRelation{valuer.NewString("suppressed")}
)

// JVMStackFrameLinePattern matches the lines of a JVM stack trace an error
// key keeps: frames, with or without "at", and the cause headers. It is RE2,
// for ClickHouse match() as well.
const JVMStackFrameLinePattern = `^\s*(at\s+)?\S+\.[^\s.(]+\([^()]*\)\s*$|^\s*(Caused by|Suppressed): `

// JVMCauseTypePattern captures a cause line up to its type, dropping the
// message, for ClickHouse replaceRegexpOne with \1.
const JVMCauseTypePattern = `^(\s*(?:Caused by|Suppressed):\s*[^\s:]+).*$`

var (
	jvmFrame           = regexp.MustCompile(`^\s*(at\s+)?(?:\S*/)?([^\s/(]+)\.([^\s./(]+)\(([^()]*)\)\s*$`)
	jvmHeader          = regexp.MustCompile(`^([A-Za-z_$][\w$]*(?:\.[\w$]+)*)(?::\s?(.*))?$`)
	jvmCause           = regexp.MustCompile(`^\s*(Caused by|Suppressed):\s*(.*)$`)
	jvmOmitted         = regexp.MustCompile(`^\s*\.\.\. (\d+) (?:more|common frames omitted)\s*$`)
	jvmLibraryPrefixes = []string{
		"java.", "javax.", "jdk.", "sun.", "com.sun.", "dalvik.", "libcore.", "android.", "androidx.", "com.android.",
		"com.google.android.", "kotlin.", "kotlinx.", "org.jetbrains.", "org.json.", "okhttp3.", "okio.", "retrofit2.",
		"io.opentelemetry.", "io.fuseone.fusescope.android.",
	}
)

// retraceBudget is what a retrace may still keep and walk.
type retraceBudget struct {
	frames  int
	entries int
}

// ErrorCauseRelation is how an exception of a JVM stack trace relates to the
// one before it.
type ErrorCauseRelation struct{ valuer.String }

// ErrorCause is one exception of a JVM stack trace.
type ErrorCause struct {
	Type          string             `json:"type" required:"true" description:"Deobfuscated when a mapping resolves it."`
	Message       string             `json:"message" required:"true"`
	Relation      ErrorCauseRelation `json:"relation" required:"true"`
	Frames        []StackFrame       `json:"frames" required:"true"`
	OmittedFrames int                `json:"omittedFrames" required:"true" description:"Frames the JVM printed as \"... N more\": the last N of the enclosing exception's."`
}

// JVMStackTrace is a parsed Throwable.printStackTrace output: the thrown
// exception first, then its causes and suppressed exceptions in print order.
type JVMStackTrace struct {
	Exceptions []*ErrorCause
	// Truncated is set when parsing stopped at MaxStackFrames frames or
	// maxJVMExceptions exceptions.
	Truncated bool
}

func (ErrorCauseRelation) Enum() []any {
	return []any{ErrorCauseRelationCausedBy, ErrorCauseRelationSuppressed}
}

// ParseJVMStackTrace parses a JVM stack trace up to MaxStackFrames frames
// and maxJVMExceptions exceptions. A trace of frames only, as for an ANR,
// takes the type and message given.
func ParseJVMStackTrace(stacktrace string, exceptionType string, message string) *JVMStackTrace {
	lines := strings.Split(strings.ReplaceAll(stacktrace, "\r\n", "\n"), "\n")
	thrown := &ErrorCause{Type: exceptionType, Message: message, Frames: []StackFrame{}}
	trace := &JVMStackTrace{Exceptions: []*ErrorCause{thrown}}

	first := slices.IndexFunc(lines, func(line string) bool { return strings.TrimSpace(line) != "" })
	headed := first >= 0 && !jvmFrame.MatchString(lines[first]) && jvmHeader.MatchString(strings.TrimSpace(lines[first]))
	if headed {
		thrown.Type, thrown.Message = parseJVMHeader(lines[first])
		lines = lines[first+1:]
	}

	current, inMessage, frames := thrown, headed, 0
	for _, line := range lines {
		if match := jvmFrame.FindStringSubmatch(line); match != nil && (match[1] != "" || !headed) {
			if frames == MaxStackFrames {
				trace.Truncated = true
				break
			}
			frames++
			current.Frames = append(current.Frames, newJVMStackFrame(match[2]+"."+match[3], match[4]))
			inMessage = false
			continue
		}
		if match := jvmCause.FindStringSubmatch(line); match != nil {
			if len(trace.Exceptions) == maxJVMExceptions {
				trace.Truncated = true
				break
			}
			relation := ErrorCauseRelationCausedBy
			if match[1] == "Suppressed" {
				relation = ErrorCauseRelationSuppressed
			}
			current = &ErrorCause{Relation: relation, Frames: []StackFrame{}}
			current.Type, current.Message = parseJVMHeader(match[2])
			trace.Exceptions = append(trace.Exceptions, current)
			inMessage = true
			continue
		}
		if match := jvmOmitted.FindStringSubmatch(line); match != nil {
			current.OmittedFrames, _ = strconv.Atoi(match[1])
			continue
		}
		if inMessage && line != "" {
			current.Message += "\n" + line
		}
	}
	return trace
}

// String prints the trace as the JVM does, with original frames where a
// mapping resolved them.
func (trace *JVMStackTrace) String() string {
	builder := strings.Builder{}
	for _, exception := range trace.Exceptions {
		switch exception.Relation {
		case ErrorCauseRelationCausedBy:
			builder.WriteString("Caused by: ")
		case ErrorCauseRelationSuppressed:
			builder.WriteString("Suppressed: ")
		}
		builder.WriteString(exception.Type)
		if exception.Message != "" {
			builder.WriteString(": " + exception.Message)
		}
		builder.WriteString("\n")
		for _, frame := range exception.Frames {
			function, file, line := frame.Function, frame.File, frame.Line
			if frame.Original != nil {
				function, file, line = frame.Original.Function, frame.Original.File, frame.Original.Line
			}
			builder.WriteString("\tat " + function + "(" + file)
			if line > 0 {
				builder.WriteString(":" + strconv.Itoa(line))
			}
			builder.WriteString(")\n")
		}
		if exception.OmittedFrames > 0 {
			builder.WriteString("\t... " + strconv.Itoa(exception.OmittedFrames) + " more\n")
		}
	}
	return builder.String()
}

// OriginalFunction is the deobfuscated function when a mapping resolved the
// frame, else the function as reported.
func (frame StackFrame) OriginalFunction() string {
	if frame.Original != nil {
		return frame.Original.Function
	}
	return frame.Function
}

// RetraceJVMStackTrace returns a copy of trace with types and frames mapped
// back to the original code, and whether the mapping resolved anything.
// Frames of classes outside the mapping are kept as they are. Inlined frames
// expand the trace; across its exceptions it keeps at most MaxStackFrames
// frames and walks at most maxRetraceEntries mapping entries.
func RetraceJVMStackTrace(trace *JVMStackTrace, mapping *R8Mapping, mappingPath string) (*JVMStackTrace, bool) {
	retraced := &JVMStackTrace{Exceptions: make([]*ErrorCause, 0, len(trace.Exceptions)), Truncated: trace.Truncated}
	resolved, budget := false, &retraceBudget{frames: MaxStackFrames, entries: maxRetraceEntries}
	for _, exception := range trace.Exceptions {
		copied := *exception
		var ok bool
		copied.Type, ok = mapping.RetraceClass(exception.Type)
		frames, framesResolved, truncated := retraceJVMFrames(exception.Frames, copied.Type, mapping, mappingPath, budget)
		copied.Frames = frames
		resolved = resolved || ok || framesResolved
		retraced.Truncated = retraced.Truncated || truncated
		retraced.Exceptions = append(retraced.Exceptions, &copied)
	}
	return retraced, resolved
}

// R8MapID is the map id of the build that threw, from the first frame whose
// source file R8 named r8-map-id-<id>, or "".
func (trace *JVMStackTrace) R8MapID() string {
	for _, exception := range trace.Exceptions {
		for _, frame := range exception.Frames {
			if mapID, ok := strings.CutPrefix(frame.File, r8MapIDSourceFile); ok && mapID != "" {
				return strings.ToLower(mapID)
			}
		}
	}
	return ""
}

// IsJVMLibraryClass reports whether a class belongs to the platform or a
// common library rather than the application.
func IsJVMLibraryClass(class string) bool {
	for _, prefix := range jvmLibraryPrefixes {
		if strings.HasPrefix(class, prefix) {
			return true
		}
	}
	return false
}

// JVMTopInAppFrames returns the first limit frames of the application's own
// classes, across the thrown exception and then its causes; without any, the
// first limit frames.
func JVMTopInAppFrames(trace *JVMStackTrace, limit int) []StackFrame {
	inApp, all := []StackFrame{}, []StackFrame{}
	for _, exception := range trace.Exceptions {
		for _, frame := range exception.Frames {
			class, _ := splitJVMFunction(frame.OriginalFunction())
			if !IsJVMLibraryClass(class) && len(inApp) < limit {
				inApp = append(inApp, frame)
			}
			if len(all) < limit {
				all = append(all, frame)
			}
		}
	}
	if len(inApp) > 0 {
		return inApp
	}
	return all
}

// NewJVMErrorFingerprint groups JVM errors by source, the thrown type and
// the functions of the top in-app frames, which survive new builds and line
// changes; without frames, by the normalized message. The source keeps a
// crash apart from the same exception caught and reported.
func NewJVMErrorFingerprint(trace *JVMStackTrace, source string) string {
	thrown := trace.Exceptions[0]
	parts := []string{source, thrown.Type}
	frames := JVMTopInAppFrames(trace, jvmFingerprintDepth)
	for _, frame := range frames {
		parts = append(parts, frame.OriginalFunction())
	}
	if len(frames) == 0 {
		parts = append(parts, NormalizeErrorMessage(thrown.Message))
	}

	sum := sha256.Sum256([]byte("jvm\x1f" + strings.Join(parts, "\x1f")))
	return hex.EncodeToString(sum[:])[:ErrorFingerprintLength]
}

// retraceJVMFrames spends budget on the frames it keeps and the mapping
// entries it walks, and reports whether it ran out before the last frame.
// Synthesized frames are dropped unless every frame is synthesized.
func retraceJVMFrames(frames []StackFrame, exceptionType string, mapping *R8Mapping, mappingPath string, budget *retraceBudget) ([]StackFrame, bool, bool) {
	kept, synthesized := make([]StackFrame, 0, min(len(frames), budget.frames)), []StackFrame{}
	resolved, truncated, synthesizedOverflow, outlinePosition := false, false, false, 0
	for i, frame := range frames {
		if budget.frames <= 0 || budget.entries <= 0 {
			truncated = true
			break
		}
		class, method := splitJVMFunction(frame.Function)
		line := frame.Line
		if outlinePosition > 0 {
			if mapped, ok := mapping.OutlineCallsiteLine(class, method, line, outlinePosition); ok {
				line = mapped
			}
			outlinePosition = 0
		}

		throwing := ""
		if i == 0 {
			throwing = exceptionType
		}
		first, outline := true, false
		found := mapping.LookupFrame(class, method, line, throwing, func(original R8Frame) bool {
			if budget.entries <= 0 {
				truncated = true
				return false
			}
			budget.entries--
			if first && !original.Inlined && original.Outline && frame.Line > 0 {
				outline = true
				return false
			}
			first = false

			copied := frame
			copied.Original = &OriginalFrame{
				Function:  original.Class + "." + original.Method,
				File:      original.File,
				Line:      original.Line,
				InApp:     !IsJVMLibraryClass(original.Class),
				SourceMap: mappingPath,
				Inlined:   original.Inlined,
			}
			if original.Synthesized {
				if len(synthesized) < budget.frames {
					synthesized = append(synthesized, copied)
				} else {
					synthesizedOverflow = true
				}
				return true
			}
			if budget.frames <= 0 {
				truncated = true
				return false
			}
			kept = append(kept, copied)
			budget.frames--
			return true
		})
		if !found {
			kept = append(kept, frame)
			budget.frames, budget.entries = budget.frames-1, budget.entries-1
			continue
		}
		resolved = true
		if outline {
			outlinePosition = frame.Line
		}
	}

	if len(kept) > 0 {
		return kept, resolved, truncated
	}
	if len(synthesized) > budget.frames {
		synthesized, synthesizedOverflow = synthesized[:budget.frames], true
	}
	budget.frames -= len(synthesized)
	return synthesized, resolved, truncated || synthesizedOverflow
}

func parseJVMHeader(line string) (string, string) {
	match := jvmHeader.FindStringSubmatch(strings.TrimSpace(line))
	if match == nil {
		return strings.TrimSpace(line), ""
	}
	return match[1], match[2]
}

func newJVMStackFrame(function string, location string) StackFrame {
	frame := StackFrame{Function: function, File: location}
	if colon := strings.LastIndex(location, ":"); colon >= 0 {
		if line, err := strconv.Atoi(location[colon+1:]); err == nil {
			frame.File, frame.Line = location[:colon], line
		}
	}
	return frame
}

func splitJVMFunction(function string) (string, string) {
	dot := strings.LastIndex(function, ".")
	if dot < 0 {
		return "", function
	}
	return function[:dot], function[dot+1:]
}
