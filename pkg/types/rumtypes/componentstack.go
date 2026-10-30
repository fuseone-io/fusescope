package rumtypes

import (
	"regexp"
	"strings"
)

// AttributeReactComponentStack is React's component stack of an error an
// ErrorBoundary caught, sent by @fusescope/browser-react.
const AttributeReactComponentStack = "fusescope.rum.react.component_stack"

// componentLocation requires a line, so a location cut by the SDK's
// truncation is dropped rather than misread.
var componentLocation = regexp.MustCompile(`:[0-9]+(?::[0-9]+)?$`)

type ComponentStack struct {
	Stack            string            `json:"stack" required:"true" description:"fusescope.rum.react.component_stack as received, trimmed of surrounding whitespace and cut to 8 KiB."`
	Frames           []StackFrame      `json:"frames" required:"true" description:"One frame per component, innermost first, at most 50; function is the component name React reported."`
	Truncated        bool              `json:"truncated" required:"true" description:"Whether the stack was cut to 8 KiB or its frames to 50."`
	Symbolicated     bool              `json:"symbolicated" required:"true" description:"Whether frames were mapped through an uploaded source map."`
	MissingSourceMap *MissingSourceMap `json:"missingSourceMap" required:"true" nullable:"true" description:"Set when the event's release has no uploaded source maps and a frame points at a script file."`
}

// NewComponentStack parses V8 ("at Name (location)"), React 16 ("in Name
// (at location)") and Gecko ("Name@location") lines within the size limits;
// nil when stack is blank.
func NewComponentStack(stack string) *ComponentStack {
	stack, truncated := TruncateStack(strings.TrimSpace(stack), MaxComponentStackBytes)
	if stack == "" {
		return nil
	}

	frames := []StackFrame{}
	for line := range strings.SplitSeq(stack, "\n") {
		frame, ok := parseComponentFrame(strings.TrimSpace(line))
		if !ok {
			continue
		}
		if len(frames) == MaxComponentStackFrames {
			truncated = true
			break
		}
		frames = append(frames, frame)
	}
	return &ComponentStack{Stack: stack, Frames: frames, Truncated: truncated}
}

// SetSymbolication keeps the component names React reported: the source
// map names the caller's call site, not the component.
func (stack *ComponentStack) SetSymbolication(symbolication *Symbolication) {
	stack.Frames, stack.Symbolicated, stack.MissingSourceMap = symbolication.Frames, symbolication.Symbolicated, symbolication.MissingSourceMap
	for i := range stack.Frames {
		if original := stack.Frames[i].Original; original != nil {
			original.Function = stack.Frames[i].Function
		}
	}
}

func parseComponentFrame(line string) (StackFrame, bool) {
	var name, location string
	if rest, ok := cutComponentPrefix(line); ok {
		var parenthesized bool
		name, location, parenthesized = strings.Cut(rest, " (")
		if parenthesized {
			location = strings.TrimPrefix(location, "at ")
			if trimmed, closed := strings.CutSuffix(location, ")"); closed {
				location = trimmed
			} else {
				location = ""
			}
		}
	} else {
		name, location, _ = strings.Cut(line, "@")
	}

	name = strings.TrimSpace(name)
	if name == "" {
		return StackFrame{}, false
	}
	if !componentLocation.MatchString(location) {
		return StackFrame{Function: name}, true
	}
	return newStackFrame(name, location), true
}

func cutComponentPrefix(line string) (string, bool) {
	if rest, ok := strings.CutPrefix(line, "at "); ok {
		return rest, true
	}
	return strings.CutPrefix(line, "in ")
}
