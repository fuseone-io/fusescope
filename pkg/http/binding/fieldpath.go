package binding

import (
	"bytes"
	"encoding/json"
	"reflect"
	"slices"
	"strconv"
	"strings"
)

const (
	// maxCapturedBody bounds the bytes of a body kept to name a field; a
	// longer body keeps the type error's own field.
	maxCapturedBody = 256 << 10
	// maxWalkDepth and maxWalkNodes bound the search of a captured body.
	maxWalkDepth = 128
	maxWalkNodes = 50_000
)

// boundedCapture keeps the first maxCapturedBody bytes written to it and
// notes whether more came. It never fails a write, so the reader it tees is
// never cut short.
type boundedCapture struct {
	buf       bytes.Buffer
	truncated bool
}

func (capture *boundedCapture) Write(p []byte) (int, error) {
	if room := maxCapturedBody - capture.buf.Len(); room < len(p) {
		capture.truncated = true
		capture.buf.Write(p[:max(room, 0)])
		return len(p), nil
	}
	capture.buf.Write(p)
	return len(p), nil
}

// fieldPath is the path, from the body's root, of the value a type error is
// about. Under encoding/json v2 (Go 1.27's default) an error returned by a
// nested UnmarshalJSON names only its field within that method's value, and
// its offset is relative to that value too; the outer path is gone (#322).
//
// The body is walked alongside root, the type it was decoded into. A
// candidate is a value of the error's JSON kind, whose path ends with the
// error's field and whose Go type there is the error's type, so a value
// valid where it is never matches. Of the candidates, the first that ends at
// the error's offset from the root or from one of its containers is taken,
// else the first. A truncated capture, a walk past its budget with no
// candidate, or none at all keeps the error's own field.
func fieldPath(body []byte, truncated bool, root reflect.Type, typeError *json.UnmarshalTypeError) string {
	if truncated {
		return typeError.Field
	}
	want := dropIndexes(strings.Split(typeError.Field, "."))
	kind, _, _ := strings.Cut(typeError.Value, " ")
	first, exact := "", ""
	walkJSON(body, root, func(path []string, starts []int64, goType reflect.Type, valueKind string, end int64) bool {
		if valueKind != kind || deref(goType) != typeError.Type {
			return true
		}
		for k := range path {
			if !equalIgnoringIndexes(path[k:], want) {
				continue
			}
			if first == "" {
				first = strings.Join(path, ".")
			}
			if end == typeError.Offset || slices.ContainsFunc(starts, func(start int64) bool { return end-start == typeError.Offset }) {
				exact = strings.Join(path, ".")
				return false
			}
		}
		return true
	})
	switch {
	case exact != "":
		return exact
	case first != "":
		return first
	}
	return typeError.Field
}

// walkJSON calls visit with each value of body in document order: its path
// (keys, and array indexes in decimal), the start offset of each container
// on that path, the Go type root has there (nil when unknown), its kind as
// encoding/json names it, and its end offset. path and starts are reused:
// visit must not keep them. It stops when visit returns false, at a
// malformed token or past maxWalkDepth or maxWalkNodes, and reports whether
// it walked the whole body.
func walkJSON(body []byte, root reflect.Type, visit func(path []string, starts []int64, goType reflect.Type, kind string, end int64) bool) bool {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var (
		path   []string
		starts []int64
		nodes  int
		walk   func(goType reflect.Type) bool
	)
	complete := true
	walk = func(goType reflect.Type) bool {
		if nodes++; nodes > maxWalkNodes || len(starts) > maxWalkDepth {
			complete = false
			return false
		}
		token, err := decoder.Token()
		if err != nil {
			complete = false
			return false
		}
		var kind string
		switch value := token.(type) {
		case json.Delim:
			starts = append(starts, decoder.InputOffset()-1)
			if value == '{' {
				kind = "object"
				for decoder.More() {
					key, err := decoder.Token()
					if err != nil {
						complete = false
						return false
					}
					name, _ := key.(string)
					path = append(path, name)
					ok := walk(childType(goType, name, false))
					path = path[:len(path)-1]
					if !ok {
						return false
					}
				}
			} else {
				kind = "array"
				for i := 0; decoder.More(); i++ {
					path = append(path, strconv.Itoa(i))
					ok := walk(childType(goType, "", true))
					path = path[:len(path)-1]
					if !ok {
						return false
					}
				}
			}
			starts = starts[:len(starts)-1]
			if _, err := decoder.Token(); err != nil {
				complete = false
				return false
			}
		case string:
			kind = "string"
		case json.Number:
			kind = "number"
		case bool:
			kind = "bool"
		default:
			return true // null is never a type error
		}
		if len(path) == 0 {
			return true
		}
		if !visit(path, starts, goType, kind, decoder.InputOffset()) {
			complete = false
			return false
		}
		return true
	}
	walk(root)
	return complete
}

// childType is the Go type a JSON value under key (or an array element)
// decodes into within parent, as encoding/json resolves struct fields: by
// tag name, else by field name, case-insensitively, through embedded
// structs. It is nil when unknown.
func childType(parent reflect.Type, key string, element bool) reflect.Type {
	parent = deref(parent)
	if parent == nil {
		return nil
	}
	switch parent.Kind() {
	case reflect.Slice, reflect.Array:
		if element {
			return parent.Elem()
		}
	case reflect.Map:
		if !element {
			return parent.Elem()
		}
	case reflect.Struct:
		if !element {
			return structField(parent, key)
		}
	}
	return nil
}

// structField is the type of parent's field that key decodes into, chosen
// as encoding/json chooses: fields of embedded structs are promoted level by
// level, a field at a shallower level dominates deeper ones, a tagged field
// dominates an untagged one at its level, and a name left ambiguous is no
// field at all. An exact name is preferred to a case-insensitive one. It is
// nil when no field, or no unambiguous one, takes key.
func structField(parent reflect.Type, key string) reflect.Type {
	fields := jsonFields(parent)
	for _, field := range fields {
		if field.name == key {
			return field.typ
		}
	}
	for _, field := range fields {
		if strings.EqualFold(field.name, key) {
			return field.typ
		}
	}
	return nil
}

type jsonField struct {
	name   string
	tagged bool
	depth  int
	typ    reflect.Type
}

// jsonFields lists the fields encoding/json decodes into for a struct type,
// in field order, each name once, after dominance (encoding/json's
// typeFields and dominantField).
func jsonFields(root reflect.Type) []jsonField {
	type level struct {
		typ   reflect.Type
		depth int
	}
	var candidates []jsonField
	visited := map[reflect.Type]bool{}
	next := []level{{typ: root}}
	for len(next) > 0 {
		current := next
		next = nil
		// A struct embedded more than once at one level gives each of its
		// fields twice there, which annihilates them as encoding/json does.
		count := map[reflect.Type]int{}
		for _, embedded := range current {
			count[embedded.typ]++
		}
		for _, embedded := range current {
			if visited[embedded.typ] {
				continue
			}
			visited[embedded.typ] = true
			for i := range embedded.typ.NumField() {
				field := embedded.typ.Field(i)
				if field.Anonymous {
					inner := deref(field.Type)
					if !field.IsExported() && inner.Kind() != reflect.Struct {
						continue
					}
				} else if !field.IsExported() {
					continue
				}
				tag := field.Tag.Get("json")
				if tag == "-" {
					continue
				}
				name, _, _ := strings.Cut(tag, ",")
				inner := field.Type
				if inner.Name() == "" && inner.Kind() == reflect.Pointer {
					inner = inner.Elem()
				}
				if name != "" || !field.Anonymous || inner.Kind() != reflect.Struct {
					candidate := jsonField{name: name, tagged: name != "", depth: embedded.depth, typ: field.Type}
					if candidate.name == "" {
						candidate.name = field.Name
					}
					candidates = append(candidates, candidate)
					if count[embedded.typ] > 1 {
						candidates = append(candidates, candidate)
					}
					continue
				}
				next = append(next, level{typ: inner, depth: embedded.depth + 1})
			}
		}
	}

	byName := map[string][]jsonField{}
	var order []string
	for _, candidate := range candidates {
		if _, seen := byName[candidate.name]; !seen {
			order = append(order, candidate.name)
		}
		byName[candidate.name] = append(byName[candidate.name], candidate)
	}
	fields := make([]jsonField, 0, len(order))
	for _, name := range order {
		if field, ok := dominantField(byName[name]); ok {
			fields = append(fields, field)
		}
	}
	return fields
}

// dominantField is the field that takes a name among those sharing it: the
// only one at the shallowest level, or the only tagged one there.
func dominantField(fields []jsonField) (jsonField, bool) {
	shallowest := fields[0].depth
	for _, field := range fields[1:] {
		shallowest = min(shallowest, field.depth)
	}
	var top []jsonField
	for _, field := range fields {
		if field.depth == shallowest {
			top = append(top, field)
		}
	}
	if len(top) == 1 {
		return top[0], true
	}
	var tagged []jsonField
	for _, field := range top {
		if field.tagged {
			tagged = append(tagged, field)
		}
	}
	if len(tagged) == 1 {
		return tagged[0], true
	}
	return jsonField{}, false
}

func deref(t reflect.Type) reflect.Type {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t
}

// equalIgnoringIndexes compares two paths without their array indexes:
// encoding/json v1 leaves them out of a field's name, v2 puts them in.
func equalIgnoringIndexes(path, want []string) bool {
	return slices.Equal(dropIndexes(path), want)
}

func dropIndexes(path []string) []string {
	out := make([]string, 0, len(path))
	for _, segment := range path {
		if _, err := strconv.Atoi(segment); err != nil {
			out = append(out, segment)
		}
	}
	return out
}
