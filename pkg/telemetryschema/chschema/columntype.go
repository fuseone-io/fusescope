package chschema

import (
	"fmt"
	"strings"
)

var (
	ColumnTypeString  = PrimitiveColumnType(ColumnTypeEnumString)
	ColumnTypeBool    = PrimitiveColumnType(ColumnTypeEnumBool)
	ColumnTypeUInt8   = PrimitiveColumnType(ColumnTypeEnumUInt8)
	ColumnTypeUInt32  = PrimitiveColumnType(ColumnTypeEnumUInt32)
	ColumnTypeUInt64  = PrimitiveColumnType(ColumnTypeEnumUInt64)
	ColumnTypeInt8    = PrimitiveColumnType(ColumnTypeEnumInt8)
	ColumnTypeInt16   = PrimitiveColumnType(ColumnTypeEnumInt16)
	ColumnTypeInt64   = PrimitiveColumnType(ColumnTypeEnumInt64)
	ColumnTypeFloat64 = PrimitiveColumnType(ColumnTypeEnumFloat64)
)

// PrimitiveColumnType is a type without parameters, named by its family.
type PrimitiveColumnType ColumnTypeEnum

type LowCardinalityColumnType struct {
	ElementType ColumnType
}

type ArrayColumnType struct {
	ElementType ColumnType
}

type MapColumnType struct {
	KeyType   ColumnType
	ValueType ColumnType
}

type FixedStringColumnType struct {
	Length int
}

// DateTime64ColumnType renders its timezone unquoted; the rendering is used in
// messages, not in DDL.
type DateTime64ColumnType struct {
	Precision int
	Timezone  string
}

// JSONColumnType leaves a nil limit at the ClickHouse default.
type JSONColumnType struct {
	MaxDynamicPaths *uint
	MaxDynamicTypes *uint
}

func (t PrimitiveColumnType) GetType() ColumnTypeEnum { return ColumnTypeEnum(t) }

func (t PrimitiveColumnType) String() string { return string(t) }

func (t LowCardinalityColumnType) GetType() ColumnTypeEnum { return ColumnTypeEnumLowCardinality }

func (t LowCardinalityColumnType) String() string {
	return fmt.Sprintf("LowCardinality(%s)", t.ElementType)
}

func (t ArrayColumnType) GetType() ColumnTypeEnum { return ColumnTypeEnumArray }

func (t ArrayColumnType) String() string { return fmt.Sprintf("Array(%s)", t.ElementType) }

func (t MapColumnType) GetType() ColumnTypeEnum { return ColumnTypeEnumMap }

func (t MapColumnType) String() string {
	return fmt.Sprintf("Map(%s, %s)", t.KeyType, t.ValueType)
}

func (t FixedStringColumnType) GetType() ColumnTypeEnum { return ColumnTypeEnumFixedString }

func (t FixedStringColumnType) String() string { return fmt.Sprintf("FixedString(%d)", t.Length) }

func (t DateTime64ColumnType) GetType() ColumnTypeEnum { return ColumnTypeEnumDateTime64 }

func (t DateTime64ColumnType) String() string {
	if t.Timezone == "" {
		return fmt.Sprintf("DateTime64(%d)", t.Precision)
	}
	return fmt.Sprintf("DateTime64(%d, %s)", t.Precision, t.Timezone)
}

func (t JSONColumnType) GetType() ColumnTypeEnum { return ColumnTypeEnumJSON }

func (t JSONColumnType) String() string {
	var params []string
	if t.MaxDynamicPaths != nil {
		params = append(params, fmt.Sprintf("max_dynamic_paths=%d", *t.MaxDynamicPaths))
	}
	if t.MaxDynamicTypes != nil {
		params = append(params, fmt.Sprintf("max_dynamic_types=%d", *t.MaxDynamicTypes))
	}
	return "JSON(" + strings.Join(params, ", ") + ")"
}
