package rumtypes

import (
	"path"
	"strings"
)

var scriptExtensions = []string{".js", ".mjs", ".cjs"}

// OriginalFrame is a frame's position in the original source, read from
// the release's source map.
type OriginalFrame struct {
	Function  string         `json:"function" required:"true" description:"Original name of the function, from the caller's call site; the minified name when unknown."`
	File      string         `json:"file" required:"true" description:"Source path relative to the project, as the map names it."`
	Line      int            `json:"line" required:"true"`
	Column    int            `json:"column" required:"true"`
	InApp     bool           `json:"inApp" required:"true" description:"False for sources under node_modules."`
	SourceMap string         `json:"sourceMap" required:"true" description:"Path of the map that resolved the frame."`
	Context   *SourceContext `json:"context" required:"true" nullable:"true" description:"Lines around the position when the map embeds sourcesContent."`
}

// IsScriptFile reports whether a frame's file is a script a source map can
// describe. Code in an inline <script> reports the page's URL instead.
func IsScriptFile(file string) bool {
	file, _, _ = strings.Cut(file, "#")
	file, _, _ = strings.Cut(file, "?")
	extension := strings.ToLower(path.Ext(file))
	for _, script := range scriptExtensions {
		if extension == script {
			return true
		}
	}
	return false
}

// HasScriptFrame reports whether any frame could be resolved by a source map.
func HasScriptFrame(frames []StackFrame) bool {
	for _, frame := range frames {
		if IsScriptFile(frame.File) {
			return true
		}
	}
	return false
}

type MissingSourceMap struct {
	Release string `json:"release" required:"true" description:"The event's service.version, empty when it has none."`
}

type Symbolication struct {
	Frames           []StackFrame
	Symbolicated     bool
	MissingSourceMap *MissingSourceMap
}

// SourceMapResolver returns the map of a frame file and the path it was
// uploaded at, or nil.
type SourceMapResolver func(file string) (*SourceMap, string)

// SymbolicateFrames returns copies of frames with their original position
// set where a map resolves them, and whether any was. A minified frame has
// no name of its own in the map; its caller's call site, the next frame,
// usually names it.
func SymbolicateFrames(frames []StackFrame, resolve SourceMapResolver, contextLines int) ([]StackFrame, bool) {
	type resolution struct {
		sourceMap *SourceMap
		path      string
		position  OriginalPosition
	}

	resolutions := make([]*resolution, len(frames))
	for i, frame := range frames {
		sourceMap, path := resolve(frame.File)
		if sourceMap == nil {
			continue
		}
		if position, ok := sourceMap.Lookup(frame.Line, frame.Column); ok {
			resolutions[i] = &resolution{sourceMap: sourceMap, path: path, position: position}
		}
	}

	symbolicated := make([]StackFrame, len(frames))
	mapped := false
	for i, frame := range frames {
		symbolicated[i] = frame
		current := resolutions[i]
		if current == nil {
			continue
		}
		mapped = true

		function := frame.Function
		if i+1 < len(frames) && resolutions[i+1] != nil && resolutions[i+1].position.Name != "" {
			function = resolutions[i+1].position.Name
		}
		symbolicated[i].Original = &OriginalFrame{
			Function:  function,
			File:      current.position.Source,
			Line:      current.position.Line,
			Column:    current.position.Column,
			InApp:     !strings.Contains("/"+current.position.Source, "/node_modules/"),
			SourceMap: current.path,
			Context:   current.sourceMap.Context(current.position.Source, current.position.Line, contextLines),
		}
	}
	return symbolicated, mapped
}
