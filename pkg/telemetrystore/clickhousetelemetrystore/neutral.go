package clickhousetelemetrystore

import (
	"strings"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

// NewRows presents driver rows as telemetrystore.Rows.
func NewRows(rows driver.Rows) telemetrystore.Rows {
	return &neutralRows{rows: rows}
}

type neutralRows struct {
	rows     driver.Rows
	closed   bool
	closeErr error
}

func (r *neutralRows) Columns() []string { return r.rows.Columns() }

func (r *neutralRows) ColumnTypes() []telemetrystore.ColumnType {
	types := r.rows.ColumnTypes()
	out := make([]telemetrystore.ColumnType, len(types))
	for i, columnType := range types {
		out[i] = neutralColumnType{ColumnType: columnType}
	}
	return out
}

func (r *neutralRows) Next() bool { return r.rows.Next() }

func (r *neutralRows) Scan(dest ...any) error { return r.rows.Scan(dest...) }

func (r *neutralRows) Err() error { return r.rows.Err() }

func (r *neutralRows) Warnings() []string { return nil }

func (r *neutralRows) Close() error {
	if !r.closed {
		r.closed = true
		r.closeErr = r.rows.Close()
	}
	return r.closeErr
}

type neutralColumnType struct {
	driver.ColumnType
}

func (c neutralColumnType) Nullable() bool {
	return c.ColumnType.Nullable() || strings.HasPrefix(c.DatabaseTypeName(), "Nullable(")
}
