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

func structField(parent reflect.Type, key string) reflect.Type {
	var folded reflect.Type
	for i := range parent.NumField() {
		field := parent.Field(i)
		tag, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if tag == "-" {
			continue
		}
		if field.Anonymous && tag == "" {
			if inner := structField(deref(field.Type), key); inner != nil {
				return inner
			}
			continue
		}
		if !field.IsExported() {
			continue
		}
		name := tag
		if name == "" {
			name = field.Name
		}
		if name == key {
			return field.Type
		}
		if folded == nil && strings.EqualFold(name, key) {
			folded = field.Type
		}
	}
	return folded
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
