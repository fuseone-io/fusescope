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
// non-nullable field, **T for a nullable one, which a null sets to nil. A nullable field also
// scans into *T, as a computed column the ClickHouse caller read as non-null, and refuses an
// actual null there. Every value is a copy.
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
		return listKind(field, dt.ElemField())
	case *arrow.LargeListType:
		return listKind(field, dt.ElemField())
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
		if d, ok := dest.(**T); ok && field.Nullable {
			if isNull(arr, i) {
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
		if isNull(arr, i) {
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
	case *arrow.StringType, *arrow.LargeStringType, *arrow.StringViewType:
		return kindOf(getString), true
	case *arrow.DictionaryType:
		if isString(dt.ValueType) {
			return kindOf(dictionaryStrings()), true
		}
	case *arrow.FixedSizeBinaryType:
		return kindOf(getHex), true
	case *arrow.BinaryType, *arrow.LargeBinaryType, *arrow.BinaryViewType:
		return kindOf(getBytes), true
	case *arrow.TimestampType:
		return kindOf(getTime(dt.Unit)), true
	case *arrow.Date32Type:
		return kindOf(getDate), true
	case *arrow.Decimal128Type:
		return kindOf(getDecimal(dt.Scale)), true
	case *arrow.BooleanType:
		return kindOf(value[bool, *array.Boolean]()), true
	case *arrow.NullType:
		return kindOf(func(arrow.Array, int) (any, error) { return nil, nil }), true
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
	case *array.StringView:
		return strings.Clone(a.Value(i)), nil
	}
	return "", unexpectedArray(arr)
}

// dictionaryStrings copies each value of a dictionary once, however many rows point at it; the
// copies are kept until the next batch brings another dictionary.
func dictionaryStrings() getter[string] {
	var (
		dict   arrow.Array
		copies []string
		copied []bool
	)
	return func(arr arrow.Array, i int) (string, error) {
		d := arr.(*array.Dictionary)
		if values := d.Dictionary(); values != dict {
			dict, copies, copied = values, make([]string, values.Len()), make([]bool, values.Len())
		}
		at := d.GetValueIndex(i)
		if !copied[at] {
			s, err := getString(dict, at)
			if err != nil {
				return "", err
			}
			copies[at], copied[at] = s, true
		}
		return copies[at], nil
	}
}

func getHex(arr arrow.Array, i int) (string, error) {
	return hex.EncodeToString(arr.(*array.FixedSizeBinary).Value(i)), nil
}

func getBytes(arr arrow.Array, i int) ([]byte, error) {
	switch a := arr.(type) {
	case *array.Binary:
		return bytes.Clone(a.Value(i)), nil
	case *array.LargeBinary:
		return bytes.Clone(a.Value(i)), nil
	case *array.BinaryView:
		return bytes.Clone(a.Value(i)), nil
	}
	return nil, unexpectedArray(arr)
}

func getDate(arr arrow.Array, i int) (time.Time, error) {
	return arr.(*array.Date32).Value(i).ToTime().UTC(), nil
}

// getDecimal reads a decimal as its exact text, which no float holds.
func getDecimal(scale int32) getter[string] {
	return func(arr arrow.Array, i int) (string, error) {
		return arr.(*array.Decimal128).Value(i).ToString(scale), nil
	}
}

func getTime(unit arrow.TimeUnit) getter[time.Time] {
	return func(arr arrow.Array, i int) (time.Time, error) {
		return arr.(*array.Timestamp).Value(i).ToTime(unit).UTC(), nil
	}
}

func isString(dt arrow.DataType) bool {
	switch dt.ID() {
	case arrow.STRING, arrow.LARGE_STRING, arrow.STRING_VIEW:
		return true
	}
	return false
}

// isNull is whether the value at i is null: every value of a null array, and a dictionary entry
// pointing at a null value, included.
func isNull(arr arrow.Array, i int) bool {
	if arr.IsNull(i) || arr.DataType().ID() == arrow.NULL {
		return true
	}
	if d, ok := arr.(*array.Dictionary); ok {
		return d.Dictionary().IsNull(d.GetValueIndex(i))
	}
	return false
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
