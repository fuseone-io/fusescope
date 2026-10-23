package rumtypes

import (
	"encoding/json"
	"math"
	"path"
	"regexp"
	"slices"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

const (
	sourceMapVersion     = 3
	maxContextLineLength = 512
	// mappingBytes is the memory of one decoded segment.
	mappingBytes = 20
)

var ErrCodeSourceMapInvalid = errors.MustNewCode("rum_source_map_invalid")

var (
	debugIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	urlScheme      = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9+.-]*://`)
	base64Values   = newBase64Values()
)

// SourceMap is a decoded version 3 source map. It is immutable once parsed
// and safe for concurrent use.
type SourceMap struct {
	debugID  string
	sources  []string
	contents [][]string
	names    []string
	// lineStarts[i] is the index in mappings of generated line i's first
	// segment; mappings of a line are sorted by generated column.
	lineStarts []int32
	mappings   []mapping
	size       int64
}

// OriginalPosition has 1-based lines and columns.
type OriginalPosition struct {
	Source string
	Line   int
	Column int
	Name   string
}

type SourceContext struct {
	StartLine int      `json:"startLine" required:"true" description:"Line number of the first line."`
	Lines     []string `json:"lines" required:"true" description:"Original source lines, each cut at 512 bytes."`
}

type mapping struct {
	generatedColumn int32
	source          int32
	originalLine    int32
	originalColumn  int32
	name            int32
}

type rawSourceMap struct {
	Version        *int              `json:"version"`
	SourceRoot     string            `json:"sourceRoot"`
	Sources        []*string         `json:"sources"`
	SourcesContent []*string         `json:"sourcesContent"`
	Names          []string          `json:"names"`
	Mappings       *string           `json:"mappings"`
	Sections       []json.RawMessage `json:"sections"`
	DebugID        string            `json:"debugId"`
	LegacyDebugID  string            `json:"debug_id"`
}

// ParseSourceMap decodes and validates a version 3 source map. Index maps
// (sections) are not supported.
func ParseSourceMap(data []byte) (*SourceMap, error) {
	raw := rawSourceMap{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "not a source map: %s", err.Error())
	}
	if raw.Version == nil || *raw.Version != sourceMapVersion {
		return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map version must be %d", sourceMapVersion)
	}
	if raw.Sections != nil {
		return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "index source maps with sections are not supported")
	}
	if raw.Mappings == nil {
		return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map has no mappings")
	}
	if len(raw.SourcesContent) > len(raw.Sources) {
		return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map has more sourcesContent than sources")
	}

	sourceMap := &SourceMap{
		sources:  make([]string, len(raw.Sources)),
		contents: make([][]string, len(raw.Sources)),
		names:    raw.Names,
	}
	for i, source := range raw.Sources {
		if source != nil {
			sourceMap.sources[i] = normalizeSourceMapSource(raw.SourceRoot, *source)
		}
		sourceMap.size += int64(len(sourceMap.sources[i]))
	}
	for i, content := range raw.SourcesContent {
		if content == nil {
			continue
		}
		sourceMap.contents[i] = strings.Split(strings.ReplaceAll(*content, "\r\n", "\n"), "\n")
		sourceMap.size += int64(len(*content)) + int64(len(sourceMap.contents[i]))*16
	}
	for _, name := range raw.Names {
		sourceMap.size += int64(len(name)) + 16
	}
	for _, id := range []string{raw.DebugID, raw.LegacyDebugID} {
		if sourceMap.debugID = NewSourceMapDebugID(id); sourceMap.debugID != "" {
			break
		}
	}

	if err := sourceMap.decodeMappings(*raw.Mappings); err != nil {
		return nil, err
	}
	sourceMap.size += int64(len(sourceMap.mappings))*mappingBytes + int64(len(sourceMap.lineStarts))*4
	return sourceMap, nil
}

// NewSourceMapDebugID lowercases a debug ID, or returns "" when it is not a UUID.
func NewSourceMapDebugID(raw string) string {
	if !debugIDPattern.MatchString(raw) {
		return ""
	}
	return strings.ToLower(raw)
}

func (sourceMap *SourceMap) DebugID() string {
	return sourceMap.debugID
}

// Size estimates the memory the decoded map holds, in bytes.
func (sourceMap *SourceMap) Size() int64 {
	return sourceMap.size
}

// Lookup maps a 1-based generated position to its original position: the
// last segment of the line at or before the column. Column 0, unknown, maps
// to the line's first segment.
func (sourceMap *SourceMap) Lookup(line int, column int) (OriginalPosition, bool) {
	if line < 1 || line > len(sourceMap.lineStarts) {
		return OriginalPosition{}, false
	}
	start := sourceMap.lineStarts[line-1]
	end := int32(len(sourceMap.mappings))
	if line < len(sourceMap.lineStarts) {
		end = sourceMap.lineStarts[line]
	}
	segments := sourceMap.mappings[start:end]
	if len(segments) == 0 {
		return OriginalPosition{}, false
	}

	index := 0
	if column > 0 {
		target := int32(min(column-1, math.MaxInt32))
		index = sort.Search(len(segments), func(i int) bool { return segments[i].generatedColumn > target }) - 1
		if index < 0 {
			return OriginalPosition{}, false
		}
	}

	segment := segments[index]
	if segment.source < 0 {
		return OriginalPosition{}, false
	}
	position := OriginalPosition{Source: sourceMap.sources[segment.source], Line: int(segment.originalLine) + 1, Column: int(segment.originalColumn) + 1}
	if segment.name >= 0 {
		position.Name = sourceMap.names[segment.name]
	}
	return position, true
}

// Context returns the original lines of source within radius of line, or
// nil when the map embeds no content for it.
func (sourceMap *SourceMap) Context(source string, line int, radius int) *SourceContext {
	if radius < 0 {
		return nil
	}
	index := slices.Index(sourceMap.sources, source)
	if index < 0 || sourceMap.contents[index] == nil {
		return nil
	}
	lines := sourceMap.contents[index]
	if line < 1 || line > len(lines) {
		return nil
	}

	first, last := max(line-radius, 1), min(line+radius, len(lines))
	context := &SourceContext{StartLine: first, Lines: make([]string, 0, last-first+1)}
	for _, text := range lines[first-1 : last] {
		context.Lines = append(context.Lines, truncateUTF8(text, maxContextLineLength))
	}
	return context
}

func (sourceMap *SourceMap) decodeMappings(encoded string) error {
	var source, originalLine, originalColumn, name int32
	fields := make([]int32, 0, 5)
	line := 0
	sorted := true

	sourceMap.lineStarts = append(sourceMap.lineStarts, 0)
	for {
		var segment string
		end := strings.IndexAny(encoded, ",;")
		if end < 0 {
			segment, encoded = encoded, ""
		} else {
			segment = encoded[:end]
		}

		if segment != "" {
			var err error
			fields, err = decodeVLQ(segment, fields[:0])
			if err != nil {
				return err
			}
			current := mapping{source: -1, name: -1}
			lineStart := sourceMap.lineStarts[len(sourceMap.lineStarts)-1]
			previous := int32(0)
			if int32(len(sourceMap.mappings)) > lineStart {
				previous = sourceMap.mappings[len(sourceMap.mappings)-1].generatedColumn
			}
			current.generatedColumn = previous + fields[0]

			switch len(fields) {
			case 1:
			case 4, 5:
				source, originalLine, originalColumn = source+fields[1], originalLine+fields[2], originalColumn+fields[3]
				if source < 0 || int(source) >= len(sourceMap.sources) || originalLine < 0 || originalColumn < 0 {
					return errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map mapping on generated line %d points outside its sources", line+1)
				}
				current.source, current.originalLine, current.originalColumn = source, originalLine, originalColumn
				if len(fields) == 5 {
					name += fields[4]
					if name < 0 || int(name) >= len(sourceMap.names) {
						return errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map mapping on generated line %d points outside its names", line+1)
					}
					current.name = name
				}
			default:
				return errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map segment on generated line %d has %d fields", line+1, len(fields))
			}
			if current.generatedColumn < 0 {
				return errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map segment on generated line %d has a negative column", line+1)
			}
			if int32(len(sourceMap.mappings)) > lineStart && current.generatedColumn < previous {
				sorted = false
			}
			sourceMap.mappings = append(sourceMap.mappings, current)
		}

		if end < 0 {
			break
		}
		if encoded[end] == ';' {
			line++
			sourceMap.lineStarts = append(sourceMap.lineStarts, int32(len(sourceMap.mappings)))
		}
		encoded = encoded[end+1:]
	}

	if !sorted {
		sourceMap.sortLines()
	}
	return nil
}

func (sourceMap *SourceMap) sortLines() {
	for i, start := range sourceMap.lineStarts {
		end := int32(len(sourceMap.mappings))
		if i+1 < len(sourceMap.lineStarts) {
			end = sourceMap.lineStarts[i+1]
		}
		slices.SortStableFunc(sourceMap.mappings[start:end], func(a, b mapping) int { return int(a.generatedColumn - b.generatedColumn) })
	}
}

// decodeVLQ appends the base64 VLQ values of one segment to values.
func decodeVLQ(segment string, values []int32) ([]int32, error) {
	var value int64
	shift := 0
	for i := 0; i < len(segment); i++ {
		digit := base64Values[segment[i]]
		if digit < 0 {
			return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map mappings contain %q, which is not base64", segment[i])
		}
		if shift > 30 {
			return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map mappings hold a value too large")
		}
		value |= int64(digit&31) << shift
		if value > math.MaxInt32*2+1 {
			return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map mappings hold a value too large")
		}
		if digit&32 != 0 {
			shift += 5
			continue
		}

		decoded := int32(value >> 1)
		if value&1 != 0 {
			decoded = -decoded
		}
		values = append(values, decoded)
		value, shift = 0, 0
	}
	if shift != 0 {
		return nil, errors.NewInvalidInputf(ErrCodeSourceMapInvalid, "source map mappings end inside a value")
	}
	return values, nil
}

// normalizeSourceMapSource turns a source into a path relative to the
// project: bundler schemes and namespaces, hosts and leading ./ and ../ go.
func normalizeSourceMapSource(sourceRoot string, source string) string {
	if sourceRoot != "" && !urlScheme.MatchString(source) {
		source = strings.TrimSuffix(sourceRoot, "/") + "/" + source
	}
	if location := urlScheme.FindStringIndex(source); location != nil {
		rest := source[location[1]:]
		if slash := strings.Index(rest, "/"); slash >= 0 {
			rest = rest[slash:]
		} else {
			rest = ""
		}
		source = rest
	}

	cleaned := strings.TrimLeft(path.Clean("/"+source), "/")
	for strings.HasPrefix(cleaned, "../") {
		cleaned = cleaned[3:]
	}
	return cleaned
}

func truncateUTF8(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	cut := limit
	for cut > 0 && !utf8.RuneStart(text[cut]) {
		cut--
	}
	return text[:cut]
}

func newBase64Values() [256]int8 {
	values := [256]int8{}
	for i := range values {
		values[i] = -1
	}
	for i, char := range "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/" {
		values[char] = int8(i)
	}
	return values
}
