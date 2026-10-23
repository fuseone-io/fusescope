// Package chschema describes the ClickHouse columns and skip indexes the
// querier reads. The schema itself is owned by the schema migrator; these
// descriptors mirror it and are checked against it by the schema contract
// integration suite.
package chschema

// ColumnTypeEnum is the ClickHouse type family of a column type.
type ColumnTypeEnum string

const (
	ColumnTypeEnumString         ColumnTypeEnum = "String"
	ColumnTypeEnumBool           ColumnTypeEnum = "Bool"
	ColumnTypeEnumUInt8          ColumnTypeEnum = "UInt8"
	ColumnTypeEnumUInt16         ColumnTypeEnum = "UInt16"
	ColumnTypeEnumUInt32         ColumnTypeEnum = "UInt32"
	ColumnTypeEnumUInt64         ColumnTypeEnum = "UInt64"
	ColumnTypeEnumInt8           ColumnTypeEnum = "Int8"
	ColumnTypeEnumInt16          ColumnTypeEnum = "Int16"
	ColumnTypeEnumInt32          ColumnTypeEnum = "Int32"
	ColumnTypeEnumInt64          ColumnTypeEnum = "Int64"
	ColumnTypeEnumFloat32        ColumnTypeEnum = "Float32"
	ColumnTypeEnumFloat64        ColumnTypeEnum = "Float64"
	ColumnTypeEnumDate           ColumnTypeEnum = "Date"
	ColumnTypeEnumDate32         ColumnTypeEnum = "Date32"
	ColumnTypeEnumDateTime       ColumnTypeEnum = "DateTime"
	ColumnTypeEnumDateTime64     ColumnTypeEnum = "DateTime64"
	ColumnTypeEnumFixedString    ColumnTypeEnum = "FixedString"
	ColumnTypeEnumLowCardinality ColumnTypeEnum = "LowCardinality"
	ColumnTypeEnumArray          ColumnTypeEnum = "Array"
	ColumnTypeEnumMap            ColumnTypeEnum = "Map"
	ColumnTypeEnumJSON           ColumnTypeEnum = "JSON"
)

// ColumnType is a ClickHouse data type. Implementations are comparable, so
// two types can be compared with ==; String renders the type declaration.
type ColumnType interface {
	GetType() ColumnTypeEnum
	String() string
}

type Column struct {
	Name string
	Type ColumnType
}
