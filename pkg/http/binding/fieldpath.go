package binding

import (
	"bytes"
	"encoding/json"
	"slices"
	"strconv"
	"strings"
)

// fieldPath is the path, from the body's root, of the value a type error is
// about. Under encoding/json v2 (Go 1.27's default) an error returned by a
// nested UnmarshalJSON names only its field within that method's value, and
// its offset is relative to that value too; the outer path is gone (#322).
// The body is walked for the first value of the error's kind whose path ends
// with the error's field and that ends at the error's offset from the root
// or from one of its containers. Without one, the error's own field is kept.
func fieldPath(body []byte, typeError *json.UnmarshalTypeError) string {
	want := dropIndexes(strings.Split(typeError.Field, "."))
	kind, _, _ := strings.Cut(typeError.Value, " ")
	found := ""
	walkJSON(body, func(path []string, starts []int64, valueKind string, end int64) bool {
		if valueKind != kind {
			return true
		}
		for k := range path {
			if !slices.Equal(dropIndexes(path[k:]), want) {
				continue
			}
			if end == typeError.Offset || slices.ContainsFunc(starts, func(start int64) bool { return end-start == typeError.Offset }) {
				found = strings.Join(path, ".")
				return false
			}
		}
		return true
	})
	if found == "" {
		return typeError.Field
	}
	return found
}

// walkJSON calls visit with each value of body in document order: its path
// (keys, and array indexes in decimal), the start offset of each container
// on that path, its kind as encoding/json names it, and its end offset. It
// stops when visit returns false or at the first malformed token.
func walkJSON(body []byte, visit func(path []string, starts []int64, kind string, end int64) bool) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var walk func(path []string, starts []int64) bool
	walk = func(path []string, starts []int64) bool {
		token, err := decoder.Token()
		if err != nil {
			return false
		}
		kind := ""
		switch value := token.(type) {
		case json.Delim:
			start := decoder.InputOffset() - 1
			inner := append(slices.Clone(starts), start)
			if value == '{' {
				kind = "object"
				for decoder.More() {
					key, err := decoder.Token()
					if err != nil {
						return false
					}
					name, _ := key.(string)
					if !walk(append(slices.Clone(path), name), inner) {
						return false
					}
				}
			} else {
				kind = "array"
				for i := 0; decoder.More(); i++ {
					if !walk(append(slices.Clone(path), strconv.Itoa(i)), inner) {
						return false
					}
				}
			}
			if _, err := decoder.Token(); err != nil {
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
		return visit(path, starts, kind, decoder.InputOffset())
	}
	walk(nil, nil)
}

// dropIndexes removes the array indexes from a path: encoding/json v1
// leaves them out of a field's name, v2 puts them in.
func dropIndexes(path []string) []string {
	return slices.DeleteFunc(slices.Clone(path), func(segment string) bool {
		_, err := strconv.Atoi(segment)
		return err == nil
	})
}
