package flighttelemetrystore

import (
	"reflect"
	"testing"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// poisonAllocator overwrites every buffer it frees, so a value still pointing into one reads
// garbage instead of passing by luck.
type poisonAllocator struct {
	*memory.CheckedAllocator
}

func newPoisonAllocator() *poisonAllocator {
	return &poisonAllocator{CheckedAllocator: memory.NewCheckedAllocator(memory.NewGoAllocator())}
}

func (a *poisonAllocator) Free(b []byte) {
	for i := range b {
		b[i] = 0xAA
	}
	a.CheckedAllocator.Free(b)
}

// spans is one record shaped like the engine's spans table: two rows, the second with nulls in
// the nullable columns.
func spans(t *testing.T, mem memory.Allocator) arrow.RecordBatch {
	schema := arrow.NewSchema([]arrow.Field{
		{Name: "trace_id", Type: &arrow.FixedSizeBinaryType{ByteWidth: 4}},
		{Name: "parent_span_id", Type: &arrow.FixedSizeBinaryType{ByteWidth: 2}, Nullable: true},
		{Name: "name", Type: &arrow.DictionaryType{IndexType: arrow.PrimitiveTypes.Int32, ValueType: arrow.BinaryTypes.String}},
		{Name: "timestamp", Type: &arrow.TimestampType{Unit: arrow.Nanosecond, TimeZone: "UTC"}},
		{Name: "duration_nano", Type: arrow.PrimitiveTypes.Uint64},
		{Name: "kind", Type: arrow.PrimitiveTypes.Int8},
		{Name: "has_error", Type: arrow.FixedWidthTypes.Boolean},
		{Name: "status_message", Type: arrow.BinaryTypes.String, Nullable: true},
		{Name: "score", Type: arrow.PrimitiveTypes.Float64, Nullable: true},
		{Name: "attributes_string", Type: arrow.MapOfFields(arrow.Field{Name: "keys", Type: arrow.BinaryTypes.String}, arrow.Field{Name: "values", Type: arrow.BinaryTypes.String})},
		{Name: "attributes_number", Type: arrow.MapOf(arrow.BinaryTypes.String, arrow.PrimitiveTypes.Float64)},
		{Name: "services", Type: arrow.ListOfNonNullable(arrow.BinaryTypes.String)},
	}, nil)
	b := array.NewRecordBuilder(mem, schema)
	defer b.Release()

	b.Field(0).(*array.FixedSizeBinaryBuilder).AppendValues([][]byte{{0xde, 0xad, 0xbe, 0xef}, {0, 1, 2, 3}}, nil)
	b.Field(1).(*array.FixedSizeBinaryBuilder).Append([]byte{0xab, 0xcd})
	b.Field(1).AppendNull()
	require.NoError(t, b.Field(2).(*array.BinaryDictionaryBuilder).AppendString("GET /api"))
	require.NoError(t, b.Field(2).(*array.BinaryDictionaryBuilder).AppendString("POST /api"))
	b.Field(3).(*array.TimestampBuilder).AppendValues([]arrow.Timestamp{1_792_678_623_000_000_001, 1_792_678_624_000_000_000}, nil)
	b.Field(4).(*array.Uint64Builder).AppendValues([]uint64{500_000, 7}, nil)
	b.Field(5).(*array.Int8Builder).AppendValues([]int8{2, 3}, nil)
	b.Field(6).(*array.BooleanBuilder).AppendValues([]bool{false, true}, nil)
	b.Field(7).(*array.StringBuilder).Append("ok")
	b.Field(7).AppendNull()
	b.Field(8).(*array.Float64Builder).Append(0.5)
	b.Field(8).AppendNull()
	strs := b.Field(9).(*array.MapBuilder)
	strs.Append(true)
	strs.KeyBuilder().(*array.StringBuilder).Append("http.method")
	strs.ItemBuilder().(*array.StringBuilder).Append("GET")
	strs.Append(true)
	nums := b.Field(10).(*array.MapBuilder)
	nums.Append(true)
	nums.KeyBuilder().(*array.StringBuilder).Append("http.status_code")
	nums.ItemBuilder().(*array.Float64Builder).Append(200)
	nums.Append(true)
	nums.KeyBuilder().(*array.StringBuilder).Append("retries")
	nums.ItemBuilder().AppendNull()
	list := b.Field(11).(*array.ListBuilder)
	list.Append(true)
	list.ValueBuilder().(*array.StringBuilder).AppendValues([]string{"api", "db"}, nil)
	list.Append(true)
	return b.NewRecordBatch()
}

func TestRowsConvertEveryEngineTypeAndCopyIt(t *testing.T) {
	mem := newPoisonAllocator()
	record := spans(t, mem)
	rows, err := newRows(newSliceSource(record), nil, func(error) {})
	require.NoError(t, err)

	types := rows.ColumnTypes()
	expected := map[string]reflect.Type{
		"trace_id":          reflect.TypeFor[string](),
		"parent_span_id":    reflect.TypeFor[*string](),
		"name":              reflect.TypeFor[string](),
		"timestamp":         reflect.TypeFor[time.Time](),
		"duration_nano":     reflect.TypeFor[uint64](),
		"kind":              reflect.TypeFor[int8](),
		"has_error":         reflect.TypeFor[bool](),
		"status_message":    reflect.TypeFor[*string](),
		"score":             reflect.TypeFor[*float64](),
		"attributes_string": reflect.TypeFor[map[string]string](),
		"attributes_number": reflect.TypeFor[map[string]any](),
		"services":          reflect.TypeFor[[]string](),
	}
	require.Len(t, types, len(expected))
	for _, columnType := range types {
		assert.Equal(t, expected[columnType.Name()], columnType.ScanType(), columnType.Name())
		assert.Equal(t, columnType.ScanType().Kind() == reflect.Pointer, columnType.Nullable(), columnType.Name())
	}

	scanned := [][]any{}
	for rows.Next() {
		dest := make([]any, len(types))
		for i, columnType := range types {
			dest[i] = reflect.New(columnType.ScanType()).Interface()
		}
		require.NoError(t, rows.Scan(dest...))
		values := make([]any, len(dest))
		for i, d := range dest {
			values[i] = reflect.ValueOf(d).Elem().Interface()
		}
		scanned = append(scanned, values)
	}
	require.NoError(t, rows.Err())
	require.NoError(t, rows.Close())
	mem.AssertSize(t, 0)

	ok, parent := "ok", "abcd"
	half := 0.5
	assert.Equal(t, []any{
		"deadbeef", &parent, "GET /api", time.Unix(1_792_678_623, 1).UTC(), uint64(500_000), int8(2), false,
		&ok, &half, map[string]string{"http.method": "GET"}, map[string]any{"http.status_code": 200.0}, []string{"api", "db"},
	}, scanned[0], "values read before the buffers were poisoned")
	assert.Equal(t, []any{
		"00010203", (*string)(nil), "POST /api", time.Unix(1_792_678_624, 0).UTC(), uint64(7), int8(3), true,
		(*string)(nil), (*float64)(nil), map[string]string{}, map[string]any{"retries": nil}, []string{},
	}, scanned[1])
}

func TestRowsRefuseWhatTheyCannotRepresent(t *testing.T) {
	mem := memory.NewCheckedAllocator(memory.NewGoAllocator())
	nonNull := arrow.NewSchema([]arrow.Field{{Name: "service", Type: arrow.BinaryTypes.String}}, nil)
	b := array.NewRecordBuilder(mem, nonNull)
	b.Field(0).AppendNull()
	withNull := b.NewRecordBatch()
	b.Release()

	rows, err := newRows(newSliceSource(withNull), nil, func(error) {})
	require.NoError(t, err)
	require.True(t, rows.Next())
	var service string
	err = rows.Scan(&service)
	assert.True(t, errors.Asc(err, telemetrystore.ErrCodeNullInNonNull), "%v", err)
	var wrong int64
	assert.Error(t, rows.Scan(&wrong), "a destination of another type")
	assert.Error(t, rows.Scan(), "a destination per column")
	require.NoError(t, rows.Close())
	mem.AssertSize(t, 0)

	decimal := arrow.NewSchema([]arrow.Field{{Name: "price", Type: &arrow.Decimal128Type{Precision: 10, Scale: 2}}}, nil)
	db := array.NewRecordBuilder(mem, decimal)
	db.Field(0).AppendNull()
	unsupported := db.NewRecordBatch()
	db.Release()
	closed := 0
	_, err = newRows(newSliceSource(unsupported), nil, func(error) { closed++ })
	assert.True(t, errors.Asc(err, telemetrystore.ErrCodeTypeUnsupported), "%v", err)
	assert.Equal(t, 1, closed, "a refused schema ends the stream")
	mem.AssertSize(t, 0)
}

func TestRowsEndTheStreamExactlyOnce(t *testing.T) {
	testCases := []struct {
		name string
		use  func(*testing.T, telemetrystore.Rows)
		err  bool
	}{
		{name: "ReadToEnd_ClosedTwice", use: func(t *testing.T, rows telemetrystore.Rows) {
			for rows.Next() {
			}
			require.NoError(t, rows.Close())
			require.NoError(t, rows.Close())
		}},
		{name: "ClosedBeforeTheEnd", use: func(t *testing.T, rows telemetrystore.Rows) {
			require.True(t, rows.Next())
			require.NoError(t, rows.Close())
			assert.False(t, rows.Next(), "nothing after close")
		}},
		{name: "SourceFailsMidway_ClosedAfter", err: true, use: func(t *testing.T, rows telemetrystore.Rows) {
			for rows.Next() {
			}
			assert.Error(t, rows.Err())
			require.NoError(t, rows.Close())
		}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			mem := memory.NewCheckedAllocator(memory.NewGoAllocator())
			source := newSliceSource(spans(t, mem), spans(t, mem))
			if testCase.err {
				source.fail = errors.NewInternalf(errors.CodeInternal, "stream broke")
			}
			var ended []error
			rows, err := newRows(source, []string{"ingester-1 did not answer"}, func(err error) { ended = append(ended, err) })
			require.NoError(t, err)
			assert.Equal(t, []string{"ingester-1 did not answer"}, rows.Warnings())
			testCase.use(t, rows)
			require.Len(t, ended, 1, "the stream ends exactly once")
			assert.Equal(t, testCase.err, ended[0] != nil)
			assert.Equal(t, 1, source.released)
			mem.AssertSize(t, 0)
		})
	}
}
