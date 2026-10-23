package rumtypes

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strconv"
	"strings"
)

// StackFrameLinePattern matches a V8 ("    at …") or Gecko/WebKit ("fn@file:1:2")
// frame line. It is RE2, so ClickHouse match() and Go regexp agree on it.
const StackFrameLinePattern = `^\s*at\s|@.*:[0-9]+:[0-9]+$`

const ErrorFingerprintLength = 16

// ErrorMessageReplacements normalize a message, applied in order and then
// trimmed of spaces. They are RE2 with plain replacements, so ClickHouse
// replaceRegexpAll() produces the same text.
var ErrorMessageReplacements = []RegexpReplacement{
	{Pattern: `[a-zA-Z][a-zA-Z0-9+.-]*://[^\s"'<>()\[\]]+`, Replacement: "<url>"},
	{Pattern: `[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`, Replacement: "<id>"},
	{Pattern: `\b[0-9a-fA-F]{8,}\b`, Replacement: "<id>"},
	{Pattern: `\b[0-9]+(?:\.[0-9]+)?\b`, Replacement: "<n>"},
	{Pattern: `\s+`, Replacement: " "},
}

var (
	stackFrameLine = regexp.MustCompile(StackFrameLinePattern)
	v8Frame        = regexp.MustCompile(`^\s*at\s+(?:async\s+)?(?:new\s+)?(?:(.+?)\s+\((.+)\)|(.+?))\s*$`)
	geckoFrame     = regexp.MustCompile(`^\s*(.*?)@(.*?)\s*$`)
	frameLocation  = regexp.MustCompile(`^(.*?)(?::([0-9]+))?(?::([0-9]+))?$`)
	fingerprint    = regexp.MustCompile(`^[0-9a-f]{16}$`)
)

var errorMessageReplacements = compileReplacements(ErrorMessageReplacements)

type RegexpReplacement struct {
	Pattern     string
	Replacement string
}

type StackFrame struct {
	Function string `json:"function" required:"true"`
	File     string `json:"file" required:"true"`
	Line     int    `json:"line" required:"true" description:"0 when unknown."`
	Column   int    `json:"column" required:"true" description:"0 when unknown."`
}

// NewErrorFingerprint groups error events by exception type, normalized
// message and the top frame's file and function. Line and column are left
// out because they move with every minified build.
func NewErrorFingerprint(exceptionType string, message string, stacktrace string) string {
	top := StackFrame{}
	if line := FirstStackFrameLine(stacktrace); line != "" {
		top = parseStackFrame(line)
	}

	sum := sha256.Sum256([]byte(strings.Join([]string{exceptionType, NormalizeErrorMessage(message), StackFrameFileKey(top.File), top.Function}, "\x1f")))
	return hex.EncodeToString(sum[:])[:ErrorFingerprintLength]
}

func IsErrorFingerprint(value string) bool {
	return fingerprint.MatchString(value)
}

// NormalizeErrorMessage replaces URLs, ids and numbers with placeholders. It
// is idempotent.
func NormalizeErrorMessage(message string) string {
	for _, replacement := range errorMessageReplacements {
		message = replacement.pattern.ReplaceAllLiteralString(message, replacement.replacement)
	}
	return strings.Trim(message, " ")
}

func FirstStackFrameLine(stacktrace string) string {
	for _, line := range strings.Split(stacktrace, "\n") {
		if stackFrameLine.MatchString(line) {
			return line
		}
	}
	return ""
}

func ParseStackFrames(stacktrace string) []StackFrame {
	frames := []StackFrame{}
	for _, line := range strings.Split(stacktrace, "\n") {
		if stackFrameLine.MatchString(line) {
			frames = append(frames, parseStackFrame(line))
		}
	}
	return frames
}

// StackFrameFileKey drops the origin, the query and content hashes from a
// bundle file name, so one file keeps its key across deploys.
func StackFrameFileKey(file string) string {
	if i := strings.Index(file, "://"); i >= 0 {
		rest := file[i+3:]
		if slash := strings.Index(rest, "/"); slash >= 0 {
			file = rest[slash:]
		} else {
			file = "/"
		}
	}
	if end := strings.IndexAny(file, "?#"); end >= 0 {
		file = file[:end]
	}

	dir, base := "", file
	if slash := strings.LastIndex(file, "/"); slash >= 0 {
		dir, base = file[:slash+1], file[slash+1:]
	}

	parts := strings.Split(base, ".")
	kept := []string{}
	for i, part := range parts {
		if i == 0 {
			if dash := strings.LastIndex(part, "-"); dash > 0 && isContentHash(part[dash+1:]) {
				part = part[:dash]
			}
		} else if i < len(parts)-1 && isContentHash(part) {
			continue
		}
		kept = append(kept, part)
	}
	return dir + strings.Join(kept, ".")
}

type compiledReplacement struct {
	pattern     *regexp.Regexp
	replacement string
}

func compileReplacements(replacements []RegexpReplacement) []compiledReplacement {
	compiled := make([]compiledReplacement, 0, len(replacements))
	for _, replacement := range replacements {
		compiled = append(compiled, compiledReplacement{pattern: regexp.MustCompile(replacement.Pattern), replacement: replacement.Replacement})
	}
	return compiled
}

func parseStackFrame(line string) StackFrame {
	if match := v8Frame.FindStringSubmatch(line); match != nil {
		if match[2] != "" {
			return newStackFrame(match[1], match[2])
		}
		return newStackFrame("", match[3])
	}
	if match := geckoFrame.FindStringSubmatch(line); match != nil {
		return newStackFrame(match[1], match[2])
	}
	return StackFrame{File: strings.TrimSpace(line)}
}

func newStackFrame(function string, location string) StackFrame {
	match := frameLocation.FindStringSubmatch(location)
	line, _ := strconv.Atoi(match[2])
	column, _ := strconv.Atoi(match[3])
	return StackFrame{Function: function, File: match[1], Line: line, Column: column}
}

// isContentHash reports whether a file name part looks like a bundler hash:
// hex of 6 or more characters, or 8 or more letters and digits mixed.
func isContentHash(part string) bool {
	if len(part) < 6 {
		return false
	}
	hasDigit, hasLetter, isHex := false, false, true
	for _, char := range part {
		switch {
		case char >= '0' && char <= '9':
			hasDigit = true
		case char >= 'a' && char <= 'f', char >= 'A' && char <= 'F':
			hasLetter = true
		case char >= 'g' && char <= 'z', char >= 'G' && char <= 'Z', char == '_':
			hasLetter, isHex = true, false
		default:
			return false
		}
	}
	if isHex {
		return hasDigit && hasLetter
	}
	return len(part) >= 8 && hasDigit && hasLetter
}
