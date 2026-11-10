package flighttelemetrystore

import (
	"reflect"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

// source is a stream of record batches, as an IPC or Flight reader is: the current batch is valid
// until the next call to Next, and Release frees the stream.
type source interface {
	Schema() *arrow.Schema
	Next() bool
	RecordBatch() arrow.RecordBatch
	Err() error
	Release()
}

// rows reads a source row by row. Scan copies each value out of the batch, so nothing handed out
// depends on Arrow buffers. The stream ends once, at its end, at its first error or at Close,
// whichever comes first, and onEnd learns how.
type rows struct {
	src      source
	columns  []column
	names    []string
	warnings []string
	onEnd    func(error)
	current  arrow.RecordBatch
	row      int
	err      error
	ended    bool
}

func newRows(src source, warnings []string, onEnd func(error)) (*rows, error) {
	r := &rows{src: src, warnings: warnings, onEnd: onEnd}
	for _, field := range src.Schema().Fields() {
		col, err := newColumn(field)
		if err != nil {
			r.end(err)
			return nil, err
		}
		r.columns = append(r.columns, col)
		r.names = append(r.names, field.Name)
	}
	return r, nil
}

// NewRows reads batches as an engine answer with these partial-result categories reads, for a
// stand-in of the engine. The batches share one schema; the rows release them at their end.
func NewRows(warnings []string, batches ...arrow.RecordBatch) (telemetrystore.Rows, error) {
	if len(batches) == 0 {
		return nil, errors.NewInternalf(errors.CodeInternal, "rows need a batch for their schema")
	}
	reader, err := array.NewRecordReader(batches[0].Schema(), batches)
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "batches of different schemas")
	}
	for _, batch := range batches {
		batch.Release()
	}
	return newRows(reader, warnings, func(error) {})
}

func (r *rows) Columns() []string { return r.names }

func (r *rows) ColumnTypes() []telemetrystore.ColumnType {
	out := make([]telemetrystore.ColumnType, len(r.columns))
	for i := range r.columns {
		out[i] = columnType{column: r.columns[i]}
	}
	return out
}

func (r *rows) Next() bool {
	if r.ended {
		return false
	}
	if r.current != nil && int64(r.row+1) < r.current.NumRows() {
		r.row++
		return true
	}
	for r.src.Next() {
		r.current, r.row = r.src.RecordBatch(), 0
		if r.current.NumRows() > 0 {
			return true
		}
	}
	r.err = r.src.Err()
	r.end(r.err)
	return false
}

func (r *rows) Scan(dest ...any) error {
	if r.ended || r.current == nil {
		return errors.NewInternalf(errors.CodeInternal, "scan without a current row")
	}
	if len(dest) != len(r.columns) {
		return errors.NewInternalf(errors.CodeInternal, "scan into %d destinations, the result has %d columns", len(dest), len(r.columns))
	}
	for i, col := range r.columns {
		if err := col.scan(r.current.Column(i), r.row, dest[i]); err != nil {
			return err
		}
	}
	return nil
}

func (r *rows) Err() error { return r.err }

func (r *rows) Warnings() []string { return r.warnings }

func (r *rows) Close() error {
	r.end(nil)
	return nil
}

func (r *rows) end(err error) {
	if r.ended {
		return
	}
	r.ended, r.current = true, nil
	r.src.Release()
	r.onEnd(err)
}

type columnType struct {
	column
}

func (c columnType) Name() string { return c.field.Name }

func (c columnType) DatabaseTypeName() string { return c.field.Type.String() }

func (c columnType) ScanType() reflect.Type { return c.scanType }

func (c columnType) Nullable() bool { return c.field.Nullable }
