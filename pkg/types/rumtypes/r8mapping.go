package rumtypes

import (
	"bufio"
	"bytes"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// The R8/ProGuard mapping.txt format, per the ProGuard manual and R8's
// retrace documentation: "original -> obfuscated:" class lines, indented
// field and method lines, and "# {json}" metadata comments that apply to the
// line above them.
const (
	r8MetadataSourceFile      = "sourceFile"
	r8MetadataMapping         = "com.android.tools.r8.mapping"
	r8MetadataSynthesized     = "com.android.tools.r8.synthesized"
	r8MetadataOutline         = "com.android.tools.r8.outline"
	r8MetadataOutlineCallsite = "com.android.tools.r8.outlineCallsite"
	r8MetadataRewriteFrame    = "com.android.tools.r8.rewriteFrame"
	r8MapIDPrefix             = "pg_map_id:"
	r8EntryBytes              = 96
)

// r8SupportedVersion is the newest mapping version whose metadata is read;
// metadata under a newer version is ignored, as the format requires.
var r8SupportedVersion = [2]int{2, 2}

var ErrCodeR8MappingInvalid = errors.MustNewCode("rum_mapping_invalid")

var (
	r8ClassLine   = regexp.MustCompile(`^(\S+) -> (\S+):$`)
	r8MethodLine  = regexp.MustCompile(`^(?:(\d+):(\d+):)?(\S+) ([^\s(]+)\(([^)]*)\)(?::(\d+)(?::(\d+))?)? -> (\S+)$`)
	r8FieldLine   = regexp.MustCompile(`^(\S+) (\S+) -> (\S+)$`)
	r8Throws      = regexp.MustCompile(`^throws\(L([^;]+);\)$`)
	r8RemoveInner = regexp.MustCompile(`^removeInnerFrames\((\d+)\)$`)
)

// R8Mapping is a parsed mapping file. It is immutable once parsed and safe
// for concurrent use.
type R8Mapping struct {
	mapID      string
	version    string
	classes    map[string]*r8Class
	byOriginal map[string]*r8Class
	size       int64
}

// R8Frame is one original frame of an obfuscated one, innermost first when
// R8 inlined several methods into it.
type R8Frame struct {
	Class       string
	Method      string
	File        string
	Line        int
	Inlined     bool
	Synthesized bool
	Outline     bool
	// RewriteThrows and RewriteRemove carry a rewriteFrame rule: when the
	// frame is the first under an exception of one of these types, drop
	// that many innermost frames.
	RewriteThrows []string
	RewriteRemove int
}

type r8Class struct {
	original    string
	sourceFile  string
	synthesized bool
	fields      map[string]string
	methods     map[string][]*r8Chain
}

// r8Chain is the method lines sharing one obfuscated range: the inlined
// methods first, the method that holds the code last.
type r8Chain struct {
	entries         []*r8Method
	outlineCallsite map[int]int
	rewriteThrows   []string
	rewriteRemove   int
}

type r8Method struct {
	class       string
	name        string
	obfStart    int
	obfEnd      int
	origStart   int
	origEnd     int
	synthesized bool
	outline     bool
}

type r8Metadata struct {
	ID         string         `json:"id"`
	Version    string         `json:"version"`
	FileName   string         `json:"fileName"`
	Positions  map[string]int `json:"positions"`
	Conditions []string       `json:"conditions"`
	Actions    []string       `json:"actions"`
}

type r8Parser struct {
	mapping    *R8Mapping
	class      *r8Class
	member     *r8Method
	chain      *r8Chain
	lastObf    string
	metadataOK bool
	hasClasses bool
}

// ParseR8Mapping parses and validates a mapping.txt.
func ParseR8Mapping(data []byte) (*R8Mapping, error) {
	parser := &r8Parser{
		mapping:    &R8Mapping{classes: map[string]*r8Class{}, byOriginal: map[string]*r8Class{}},
		metadataOK: true,
	}

	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 0, 64*1024), 16<<20)
	number := 0
	for scanner.Scan() {
		number++
		if err := parser.line(scanner.Text()); err != nil {
			return nil, errors.NewInvalidInputf(ErrCodeR8MappingInvalid, "mapping line %d: %s", number, err.Error())
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, errors.NewInvalidInputf(ErrCodeR8MappingInvalid, "mapping line %d: %s", number+1, err.Error())
	}
	if !parser.hasClasses {
		return nil, errors.NewInvalidInputf(ErrCodeR8MappingInvalid, "the mapping has no class mappings")
	}
	parser.mapping.size += int64(len(data))
	return parser.mapping, nil
}

// MapID is the pg_map_id header R8 writes, or "".
func (mapping *R8Mapping) MapID() string {
	return mapping.mapID
}

// Version is the mapping format version, or "" before versioning.
func (mapping *R8Mapping) Version() string {
	return mapping.version
}

// Size estimates the memory the parsed mapping holds, in bytes.
func (mapping *R8Mapping) Size() int64 {
	return mapping.size
}

func (mapping *R8Mapping) RetraceClass(obfuscated string) (string, bool) {
	if class, ok := mapping.classes[obfuscated]; ok {
		return class.original, true
	}
	return obfuscated, false
}

func (mapping *R8Mapping) RetraceField(class string, obfuscated string) (string, bool) {
	mapped, ok := mapping.classes[class]
	if !ok {
		return obfuscated, false
	}
	original, ok := mapped.fields[obfuscated]
	if !ok {
		return obfuscated, false
	}
	return original, true
}

// LookupFrame returns the original frames of an obfuscated one, or nil when
// the class is not in the mapping. line is 0 when unknown. A line inside no
// range resolves to the method name alone, with line 0.
func (mapping *R8Mapping) LookupFrame(class string, method string, line int) []R8Frame {
	mapped, ok := mapping.classes[class]
	if !ok {
		return nil
	}
	chains := mapped.methods[method]
	if len(chains) == 0 {
		return []R8Frame{{Class: mapped.original, Method: method, File: mapping.sourceFile(mapped.original), Line: line}}
	}

	if chain := findChain(chains, line, true); chain != nil {
		return mapping.expand(mapped, chain, line)
	}
	if chain := findChain(chains, line, false); chain != nil {
		return mapping.expand(mapped, chain, line)
	}
	outer := chains[0].entries[len(chains[0].entries)-1]
	return []R8Frame{mapping.frame(mapped, outer, 0)}
}

// OutlineCallsiteLine maps the position an outline frame reported to the
// line of its call site in the frame below it, at line.
func (mapping *R8Mapping) OutlineCallsiteLine(class string, method string, line int, position int) (int, bool) {
	mapped, ok := mapping.classes[class]
	if !ok {
		return 0, false
	}
	chain := findChain(mapped.methods[method], line, true)
	if chain == nil || chain.outlineCallsite == nil {
		return 0, false
	}
	mappedLine, ok := chain.outlineCallsite[position]
	return mappedLine, ok
}

// findChain returns the first chain whose range holds line, or with ranged
// false the first chain without a range.
func findChain(chains []*r8Chain, line int, ranged bool) *r8Chain {
	for _, chain := range chains {
		entry := chain.entries[0]
		if ranged && entry.obfStart >= 0 && line >= entry.obfStart && line <= entry.obfEnd {
			return chain
		}
		if !ranged && entry.obfStart < 0 {
			return chain
		}
	}
	return nil
}

func (mapping *R8Mapping) expand(mapped *r8Class, chain *r8Chain, line int) []R8Frame {
	frames := make([]R8Frame, 0, len(chain.entries))
	for i, entry := range chain.entries {
		frame := mapping.frame(mapped, entry, entry.originalLine(line))
		frame.Inlined = i < len(chain.entries)-1
		frames = append(frames, frame)
	}
	last := &frames[len(frames)-1]
	last.RewriteThrows, last.RewriteRemove = chain.rewriteThrows, chain.rewriteRemove
	return frames
}

func (mapping *R8Mapping) frame(mapped *r8Class, entry *r8Method, line int) R8Frame {
	class, synthesized := mapped.original, mapped.synthesized
	if entry.class != "" {
		class, synthesized = entry.class, false
		if other, ok := mapping.byOriginal[entry.class]; ok {
			synthesized = other.synthesized
		}
	}
	return R8Frame{Class: class, Method: entry.name, File: mapping.sourceFile(class), Line: line, Synthesized: synthesized || entry.synthesized, Outline: entry.outline}
}

// sourceFile is the class's sourceFile metadata, else its outer class's,
// else the outer class's simple name with .java.
func (mapping *R8Mapping) sourceFile(class string) string {
	outer, _, _ := strings.Cut(class, "$")
	for _, name := range []string{class, outer} {
		if mapped, ok := mapping.byOriginal[name]; ok && mapped.sourceFile != "" {
			return mapped.sourceFile
		}
	}
	return outer[strings.LastIndex(outer, ".")+1:] + ".java"
}

// originalLine maps an obfuscated line through the entry's ranges: a range
// of the same length maps line by line, a single original line is a call
// site, no original range keeps the line.
func (entry *r8Method) originalLine(line int) int {
	switch {
	case entry.origStart < 0:
		if entry.obfStart >= 0 && (line < entry.obfStart || line > entry.obfEnd) {
			return 0
		}
		return line
	case entry.origEnd < 0, entry.origStart == entry.origEnd, entry.obfStart < 0:
		return entry.origStart
	case entry.origEnd-entry.origStart == entry.obfEnd-entry.obfStart:
		return entry.origStart + line - entry.obfStart
	}
	return entry.origStart
}

func (parser *r8Parser) line(text string) error {
	trimmed := strings.TrimSpace(text)
	switch {
	case trimmed == "":
		return nil
	case strings.HasPrefix(trimmed, "#"):
		return parser.comment(strings.TrimSpace(trimmed[1:]))
	case text[0] != ' ' && text[0] != '\t':
		return parser.classLine(trimmed)
	case parser.class == nil:
		return errors.NewInvalidInputf(ErrCodeR8MappingInvalid, "a member comes before any class")
	}
	return parser.memberLine(trimmed)
}

func (parser *r8Parser) classLine(text string) error {
	match := r8ClassLine.FindStringSubmatch(text)
	if match == nil {
		return errors.NewInvalidInputf(ErrCodeR8MappingInvalid, "expected a class mapping \"original -> obfuscated:\"")
	}
	class := &r8Class{original: match[1], fields: map[string]string{}, methods: map[string][]*r8Chain{}}
	parser.mapping.classes[match[2]] = class
	parser.mapping.byOriginal[match[1]] = class
	parser.mapping.size += int64(len(text)) + r8EntryBytes
	parser.class, parser.member, parser.chain, parser.hasClasses = class, nil, nil, true
	return nil
}

func (parser *r8Parser) memberLine(text string) error {
	parser.mapping.size += int64(len(text)) + r8EntryBytes
	if match := r8MethodLine.FindStringSubmatch(text); match != nil {
		return parser.method(match)
	}
	if match := r8FieldLine.FindStringSubmatch(text); match != nil {
		if _, ok := parser.class.fields[match[3]]; !ok {
			parser.class.fields[match[3]] = match[2]
		}
		parser.member, parser.chain = nil, nil
		return nil
	}
	return errors.NewInvalidInputf(ErrCodeR8MappingInvalid, "expected a field or method mapping")
}

func (parser *r8Parser) method(match []string) error {
	entry := &r8Method{obfStart: atoiOr(match[1]), obfEnd: atoiOr(match[2]), origStart: atoiOr(match[6]), origEnd: atoiOr(match[7])}
	if entry.obfStart > entry.obfEnd {
		return errors.NewInvalidInputf(ErrCodeR8MappingInvalid, "the obfuscated range %d:%d is inverted", entry.obfStart, entry.obfEnd)
	}
	entry.name = match[4]
	if dot := strings.LastIndex(match[4], "."); dot >= 0 {
		entry.class, entry.name = match[4][:dot], match[4][dot+1:]
	}

	obfuscated := match[8]
	chains := parser.class.methods[obfuscated]
	previous := parser.chain
	if previous != nil && parser.lastObf == obfuscated && entry.obfStart >= 0 && previous.entries[0].obfStart == entry.obfStart && previous.entries[0].obfEnd == entry.obfEnd {
		previous.entries = append(previous.entries, entry)
	} else {
		parser.chain = &r8Chain{entries: []*r8Method{entry}}
		parser.class.methods[obfuscated] = append(chains, parser.chain)
	}
	parser.member, parser.lastObf = entry, obfuscated
	return nil
}

func (parser *r8Parser) comment(text string) error {
	if id, ok := strings.CutPrefix(text, r8MapIDPrefix); ok && !parser.hasClasses {
		parser.mapping.mapID = strings.TrimSpace(id)
		return nil
	}
	if !strings.HasPrefix(text, "{") {
		return nil
	}

	metadata := r8Metadata{}
	if err := json.Unmarshal([]byte(text), &metadata); err != nil {
		if err := json.Unmarshal([]byte(strings.ReplaceAll(text, "'", `"`)), &metadata); err != nil {
			return nil
		}
	}

	switch metadata.ID {
	case r8MetadataMapping:
		parser.mapping.version = metadata.Version
		parser.metadataOK = supportsR8Version(metadata.Version)
	case r8MetadataSourceFile:
		if parser.class != nil && parser.member == nil {
			parser.class.sourceFile = metadata.FileName
		}
	}
	if !parser.metadataOK {
		return nil
	}

	switch metadata.ID {
	case r8MetadataSynthesized:
		if parser.member != nil {
			parser.member.synthesized = true
		} else if parser.class != nil {
			parser.class.synthesized = true
		}
	case r8MetadataOutline:
		if parser.member != nil {
			parser.member.outline = true
		}
	case r8MetadataOutlineCallsite:
		if parser.chain != nil {
			parser.chain.outlineCallsite = map[int]int{}
			for position, line := range metadata.Positions {
				if key, err := strconv.Atoi(position); err == nil {
					parser.chain.outlineCallsite[key] = line
				}
			}
		}
	case r8MetadataRewriteFrame:
		parser.rewriteFrame(metadata)
	}
	return nil
}

// rewriteFrame keeps a rule whose conditions and actions are all understood.
func (parser *r8Parser) rewriteFrame(metadata r8Metadata) {
	if parser.chain == nil {
		return
	}
	throws, remove := []string{}, 0
	for _, condition := range metadata.Conditions {
		match := r8Throws.FindStringSubmatch(condition)
		if match == nil {
			return
		}
		throws = append(throws, strings.ReplaceAll(match[1], "/", "."))
	}
	for _, action := range metadata.Actions {
		match := r8RemoveInner.FindStringSubmatch(action)
		if match == nil {
			return
		}
		count, _ := strconv.Atoi(match[1])
		remove += count
	}
	if len(throws) > 0 && remove > 0 {
		parser.chain.rewriteThrows, parser.chain.rewriteRemove = throws, remove
	}
}

func supportsR8Version(version string) bool {
	major, minor, _ := strings.Cut(version, ".")
	majorNumber, err := strconv.Atoi(major)
	if err != nil {
		return false
	}
	minorNumber := 0
	if minor != "" {
		if minorNumber, err = strconv.Atoi(minor); err != nil {
			return false
		}
	}
	return majorNumber < r8SupportedVersion[0] || (majorNumber == r8SupportedVersion[0] && minorNumber <= r8SupportedVersion[1])
}

func atoiOr(value string) int {
	if value == "" {
		return -1
	}
	number, err := strconv.Atoi(value)
	if err != nil {
		return -1
	}
	return number
}
