package telemetrystore

import (
	"reflect"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var (
	ErrCodeUnsupported     = errors.MustNewCode("telemetrystore_unsupported")
	ErrCodeArgsUnsupported = errors.MustNewCode("telemetrystore_args_unsupported")
	ErrCodeNullInNonNull   = errors.MustNewCode("telemetrystore_null_in_non_null")
	ErrCodeTypeUnsupported = errors.MustNewCode("telemetrystore_type_unsupported")
)

// Rows reads a result one row at a time, whatever the provider. Values handed to Scan are copies:
// they stay valid after Next and Close.
type Rows interface {
	Columns() []string
	ColumnTypes() []ColumnType
	Next() bool
	// Scan copies the current row into dest, one pointer per column of the column's ScanType. A
	// null in a nullable column, whose ScanType is a pointer, sets it to nil.
	Scan(dest ...any) error
	// Err is the error that ended Next early, if any.
	Err() error
	// Close releases the result. It may be called more than once; only the first releases.
	Close() error
	// Warnings are the reasons the result may be partial, such as an ingester that did not answer.
	Warnings() []string
}

type ColumnType interface {
	Name() string
	DatabaseTypeName() string
	ScanType() reflect.Type
	Nullable() bool
}
