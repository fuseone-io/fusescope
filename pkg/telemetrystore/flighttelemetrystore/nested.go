package flighttelemetrystore

import (
	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
)

// mapKind reads a map with string keys as map[string]V when its items cannot be null, and as
// map[string]any with nil for a null item otherwise.
func mapKind(field arrow.Field, dt *arrow.MapType) (kind, error) {
	if !isString(dt.KeyType()) {
		return kind{}, unsupported(field)
	}
	item := dt.ItemField()
	itemKind, err := kindOfField(item)
	if err != nil {
		return kind{}, err
	}
	if !item.Nullable {
		switch item.Type.ID() {
		case arrow.STRING, arrow.LARGE_STRING:
			return kindOf(mapOf(field.Name, getString)), nil
		case arrow.FLOAT64:
			return kindOf(mapOf(field.Name, value[float64, *array.Float64]())), nil
		case arrow.BOOL:
			return kindOf(mapOf(field.Name, value[bool, *array.Boolean]())), nil
		case arrow.INT64:
			return kindOf(mapOf(field.Name, value[int64, *array.Int64]())), nil
		}
	}
	return kindOf(mapOf(field.Name, itemKind.boxed)), nil
}

func mapOf[V any](name string, get getter[V]) getter[map[string]V] {
	return func(arr arrow.Array, i int) (map[string]V, error) {
		m := arr.(*array.Map)
		start, end := m.ValueOffsets(i)
		keys, items := m.Keys(), m.Items()
		out := make(map[string]V, end-start)
		for j := int(start); j < int(end); j++ {
			key, err := getString(keys, j)
			if err != nil {
				return nil, err
			}
			v, err := element(name, items, j, get)
			if err != nil {
				return nil, err
			}
			out[key] = v
		}
		return out, nil
	}
}

// listKind reads a list or a large list as []V when its elements cannot be null, and as []any
// otherwise.
func listKind(field arrow.Field, elem arrow.Field) (kind, error) {
	elemKind, err := kindOfField(elem)
	if err != nil {
		return kind{}, err
	}
	if !elem.Nullable {
		switch elem.Type.ID() {
		case arrow.STRING, arrow.LARGE_STRING:
			return kindOf(listOf(field.Name, getString)), nil
		case arrow.FLOAT64:
			return kindOf(listOf(field.Name, value[float64, *array.Float64]())), nil
		case arrow.INT64:
			return kindOf(listOf(field.Name, value[int64, *array.Int64]())), nil
		}
	}
	return kindOf(listOf(field.Name, elemKind.boxed)), nil
}

func listOf[V any](name string, get getter[V]) getter[[]V] {
	return func(arr arrow.Array, i int) ([]V, error) {
		l := arr.(interface {
			ValueOffsets(int) (int64, int64)
			ListValues() arrow.Array
		})
		start, end := l.ValueOffsets(i)
		values := l.ListValues()
		out := make([]V, 0, end-start)
		for j := int(start); j < int(end); j++ {
			v, err := element(name, values, j, get)
			if err != nil {
				return nil, err
			}
			out = append(out, v)
		}
		return out, nil
	}
}

// structKind reads a struct as map[string]any keyed by field name, nil for a null field.
func structKind(field arrow.Field, dt *arrow.StructType) (kind, error) {
	fields := dt.Fields()
	getters := make([]getter[any], len(fields))
	for n, f := range fields {
		k, err := kindOfField(f)
		if err != nil {
			return kind{}, err
		}
		getters[n] = k.boxed
	}
	return kindOf(func(arr arrow.Array, i int) (map[string]any, error) {
		s := arr.(*array.Struct)
		out := make(map[string]any, len(fields))
		for n, f := range fields {
			v, err := element(field.Name, s.Field(n), i, getters[n])
			if err != nil {
				return nil, err
			}
			if v == nil && !f.Nullable {
				return nil, nullInNonNull(field.Name + "." + f.Name)
			}
			out[f.Name] = v
		}
		return out, nil
	}), nil
}

// element reads the value at j of a nested array. A null reads as nil when V is any, and is
// refused otherwise.
func element[V any](name string, arr arrow.Array, j int, get getter[V]) (V, error) {
	var zero V
	if isNull(arr, j) {
		if _, boxed := any(&zero).(*any); boxed {
			return zero, nil
		}
		return zero, nullInNonNull(name)
	}
	return get(arr, j)
}
