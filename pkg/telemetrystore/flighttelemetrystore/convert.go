package flighttelemetrystore

import (
	"bytes"
	"encoding/hex"
	"reflect"
	"strings"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

// column reads one field of a batch into Scan destinations of its scanType: *T for a
// non-nullable field, **T for a nullable one, which a null sets to nil. Every value is a copy.
type column struct {
	field    arrow.Field
	scanType reflect.Type
	scan     func(arr arrow.Array, i int, dest any) error
}

type getter[T any] func(arr arrow.Array, i int) (T, error)

// newColumn maps a field to Go as the ClickHouse driver would: ids in fixed-size binary as
// lowercase hex, dictionary strings as strings, maps with string keys as Go maps, lists as
// slices. A map item or list element that may be null comes out as any, with nil for the null.
func newColumn(field arrow.Field) (column, error) {
	k, err := kindOfField(field)
	if err != nil {
		return column{}, err
	}
	return k.column(field), nil
}

func kindOfField(field arrow.Field) (kind, error) {
	switch dt := field.Type.(type) {
	case *arrow.MapType:
		return mapKind(field, dt)
	case *arrow.ListType:
		return listKind(field, dt)
	case *arrow.StructType:
		return structKind(field, dt)
	}
	if k, ok := scalar(field.Type); ok {
		return k, nil
	}
	return kind{}, unsupported(field)
}

func typed[T any](field arrow.Field, get getter[T]) column {
	scanType := reflect.TypeFor[T]()
	if field.Nullable {
		scanType = reflect.PointerTo(scanType)
	}
	return column{field: field, scanType: scanType, scan: func(arr arrow.Array, i int, dest any) error {
		if field.Nullable {
			d, ok := dest.(**T)
			if !ok {
				return wrongDestination(field, scanType, dest)
			}
			if arr.IsNull(i) {
				*d = nil
				return nil
			}
			v, err := get(arr, i)
			if err != nil {
				return err
			}
			*d = &v
			return nil
		}
		d, ok := dest.(*T)
		if !ok {
			return wrongDestination(field, scanType, dest)
		}
		if arr.IsNull(i) {
			return nullInNonNull(field.Name)
		}
		v, err := get(arr, i)
		if err != nil {
			return err
		}
		*d = v
		return nil
	}}
}

// kind is how a type reads: as a column of its own Go type, or boxed inside a nested value.
type kind struct {
	column func(arrow.Field) column
	boxed  getter[any]
}

func kindOf[T any](get getter[T]) kind {
	return kind{
		column: func(f arrow.Field) column { return typed(f, get) },
		boxed: func(arr arrow.Array, i int) (any, error) {
			if arr.IsNull(i) {
				return nil, nil
			}
			return get(arr, i)
		},
	}
}

// scalar returns the kind of a scalar type.
func scalar(dt arrow.DataType) (kind, bool) {
	switch dt := dt.(type) {
	case *arrow.StringType, *arrow.LargeStringType:
		return kindOf(getString), true
	case *arrow.DictionaryType:
		if isString(dt.ValueType) {
			return kindOf(getDictionaryString), true
		}
	case *arrow.FixedSizeBinaryType:
		return kindOf(getHex), true
	case *arrow.BinaryType:
		return kindOf(getBytes), true
	case *arrow.TimestampType:
		return kindOf(getTime(dt.Unit)), true
	case *arrow.BooleanType:
		return kindOf(value[bool, *array.Boolean]()), true
	}
	return numeric(dt)
}

func numeric(dt arrow.DataType) (kind, bool) {
	switch dt.ID() {
	case arrow.INT8:
		return kindOf(value[int8, *array.Int8]()), true
	case arrow.INT16:
		return kindOf(value[int16, *array.Int16]()), true
	case arrow.INT32:
		return kindOf(value[int32, *array.Int32]()), true
	case arrow.INT64:
		return kindOf(value[int64, *array.Int64]()), true
	case arrow.UINT8:
		return kindOf(value[uint8, *array.Uint8]()), true
	case arrow.UINT16:
		return kindOf(value[uint16, *array.Uint16]()), true
	case arrow.UINT32:
		return kindOf(value[uint32, *array.Uint32]()), true
	case arrow.UINT64:
		return kindOf(value[uint64, *array.Uint64]()), true
	case arrow.FLOAT32:
		return kindOf(value[float32, *array.Float32]()), true
	case arrow.FLOAT64:
		return kindOf(value[float64, *array.Float64]()), true
	}
	return kind{}, false
}

func value[T any, A interface{ Value(int) T }]() getter[T] {
	return func(arr arrow.Array, i int) (T, error) { return arr.(A).Value(i), nil }
}

func getString(arr arrow.Array, i int) (string, error) {
	switch a := arr.(type) {
	case *array.String:
		return strings.Clone(a.Value(i)), nil
	case *array.LargeString:
		return strings.Clone(a.Value(i)), nil
	}
	return "", unexpectedArray(arr)
}

func getDictionaryString(arr arrow.Array, i int) (string, error) {
	d := arr.(*array.Dictionary)
	return getString(d.Dictionary(), d.GetValueIndex(i))
}

func getHex(arr arrow.Array, i int) (string, error) {
	return hex.EncodeToString(arr.(*array.FixedSizeBinary).Value(i)), nil
}

func getBytes(arr arrow.Array, i int) ([]byte, error) {
	return bytes.Clone(arr.(*array.Binary).Value(i)), nil
}

func getTime(unit arrow.TimeUnit) getter[time.Time] {
	return func(arr arrow.Array, i int) (time.Time, error) {
		return arr.(*array.Timestamp).Value(i).ToTime(unit).UTC(), nil
	}
}

func isString(dt arrow.DataType) bool {
	return dt.ID() == arrow.STRING || dt.ID() == arrow.LARGE_STRING
}

func unsupported(field arrow.Field) error {
	return errors.Newf(errors.TypeUnsupported, telemetrystore.ErrCodeTypeUnsupported, "column %s of type %s has no Go representation", field.Name, field.Type)
}

func nullInNonNull(name string) error {
	return errors.NewInternalf(telemetrystore.ErrCodeNullInNonNull, "null in non-nullable column %s", name)
}

func wrongDestination(field arrow.Field, want reflect.Type, dest any) error {
	return errors.NewInternalf(errors.CodeInternal, "column %s scans into *%s, not %T", field.Name, want, dest)
}

func unexpectedArray(arr arrow.Array) error {
	return errors.NewInternalf(errors.CodeInternal, "unexpected array %T", arr)
}
