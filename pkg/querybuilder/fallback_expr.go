package querybuilder

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strconv"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/huandu/go-sqlbuilder"
)

func GroupByKeys(keys []qbtypes.GroupByKey) []string {
	k := make([]string, 0, len(keys))
	for _, key := range keys {
		k = append(k, sqlbuilder.Escape(clickhousesql.Identifier(key.Name)))
	}
	return k
}

func FormatValueForContains(value any) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case string:
		return v
	case []byte:
		return string(v)

	case json.Number:
		return v.String()

	case float64:
		if v == math.Trunc(v) && v >= -1e15 && v <= 1e15 {
			return fmt.Sprintf("%.0f", v)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)

	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 32)

	case int, int8, int16, int32, int64:
		return fmt.Sprintf("%d", v)

	case uint, uint8, uint16, uint32, uint64:
		return fmt.Sprintf("%d", v)

	case bool:
		return strconv.FormatBool(v)

	case fmt.Stringer:
		return v.String()

	default:
		// fallback - try to convert through reflection
		rv := reflect.ValueOf(value)
		switch rv.Kind() {
		case reflect.Float32, reflect.Float64:
			f := rv.Float()
			if f == math.Trunc(f) && f >= -1e15 && f <= 1e15 {
				return fmt.Sprintf("%.0f", f)
			}
			return strconv.FormatFloat(f, 'f', -1, 64)
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			return strconv.FormatInt(rv.Int(), 10)
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			return strconv.FormatUint(rv.Uint(), 10)
		default:
			return fmt.Sprintf("%v", value)
		}
	}
}

func FormatFullTextSearch(input string) string {
	if _, err := regexp.Compile(input); err != nil {
		// Not a valid regex -> treat as literal substring
		return regexp.QuoteMeta(input)
	}
	return input
}

func DataTypeCollisionHandledFieldName(key *telemetrytypes.TelemetryFieldKey, value any, tblFieldName string, operator qbtypes.FilterOperator) (string, any) {
	return DataTypeCollisionHandledFieldNameIn(ClickHouse{}, key, value, tblFieldName, operator)
}

// DataTypeCollisionHandledFieldNameIn is DataTypeCollisionHandledFieldName with the casts of d.
func DataTypeCollisionHandledFieldNameIn(d qbtypes.Dialect, key *telemetrytypes.TelemetryFieldKey, value any, tblFieldName string, operator qbtypes.FilterOperator) (string, any) {
	// This block of code exists to handle the data type collisions
	// We don't want to fail the requests when there is a key with more than one data type
	// Let's take an example of `http.status_code`, and consider user sent a string value and number value
	// When they search for `http.status_code=200`, we will search across both the number columns and string columns
	// and return the results from both the columns
	// While we expect user not to send the mixed data types, it inevitably happens
	// So we handle the data type collisions here
	switch key.FieldDataType {
	case telemetrytypes.FieldDataTypeString, telemetrytypes.FieldDataTypeArrayString:
		switch v := value.(type) {
		case float64:
			// try to convert the string value to to number
			tblFieldName = d.FloatOrNull(tblFieldName)
		case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
			tblFieldName = d.FloatOrNull(tblFieldName)
		case []any:
			if allFloats(v) {
				tblFieldName = d.FloatOrNull(tblFieldName)
			} else {
				// Any mix that is not all-floats (e.g. [bool, float64], [bool], all-strings)
				// must be stringified: passing a Go bool as UInt8 against a String column
				// causes ClickHouse error 386 "no supertype for String and UInt8".
				_, value = d.ToText(tblFieldName), toStrings(v)
			}
		case bool:
			// we don't have a toBoolOrNull in ClickHouse, so we need to convert the bool to a string
			value = fmt.Sprintf("%t", v)
		}
	case telemetrytypes.FieldDataTypeInt64,
		telemetrytypes.FieldDataTypeArrayInt64,
		telemetrytypes.FieldDataTypeNumber,
		telemetrytypes.FieldDataTypeArrayNumber,
		telemetrytypes.FieldDataTypeFloat64,
		telemetrytypes.FieldDataTypeArrayFloat64:
		switch v := value.(type) {
		// why? ; CH returns an error for a simple check
		// attributes_number['http.status_code'] = 200 but not for attributes_number['http.status_code'] >= 200
		// DB::Exception: Bad get: has UInt64, requested Float64.
		// How is it working in v4? v4 prepares the full query with values in query string
		// When we format the float it becomes attributes_number['http.status_code'] = 200.000
		// Which CH gladly accepts and doesn't throw error
		// However, when passed as query args, the default formatter
		// https://github.com/ClickHouse/clickhouse-go/blob/757e102f6d8c6059d564ce98795b4ce2a101b1a5/bind.go#L393
		// is used which prepares the
		// final query as attributes_number['http.status_code'] = 200 giving this error
		// This following is one way to workaround it

		// if the key is a number, the value is a string, we will let clickHouse handle the conversion
		// and clickhouse float64 has a 53-bit mantissa, so values above 2^53 rounds to the nearest representable double
		// breaking the equality filters for large integers
		case float32, float64:
			tblFieldName = d.Float(tblFieldName)
		case string:
			// check if it's a number inside a string
			isNumber := false
			if _, err := strconv.ParseFloat(v, 64); err == nil {
				isNumber = true
			}

			if !operator.IsComparisonOperator() || !isNumber {
				// try to convert the number attribute to string
				tblFieldName = d.ToText(tblFieldName) // numeric col vs string literal
			} else {
				tblFieldName = d.Float(tblFieldName)
			}
		case []any:
			if allFloats(v) {
				tblFieldName = d.Float(tblFieldName)
			} else if hasString(v) {
				tblFieldName, value = d.ToText(tblFieldName), toStrings(v)
			}
		case bool:
			// a bool can't equal a number; compare as strings (type-safe, matches
			// nothing) instead of erroring with "Bad get: ... Float64" (CH 170).
			tblFieldName, value = d.ToText(tblFieldName), fmt.Sprintf("%t", v)
		}

	case telemetrytypes.FieldDataTypeBool,
		telemetrytypes.FieldDataTypeArrayBool:
		switch v := value.(type) {
		case string:
			tblFieldName = d.ToText(tblFieldName)
		case []any:
			if hasString(v) {
				tblFieldName, value = d.ToText(tblFieldName), toStrings(v)
			}
		}
	case telemetrytypes.FieldDataTypeArrayDynamic:
		switch v := value.(type) {
		case string:
			tblFieldName = d.ToText(tblFieldName)
		case float32, float64, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
			tblFieldName = d.ExactFloatOrNull(tblFieldName)
		case bool:
			tblFieldName = d.BoolOrNull(tblFieldName)
		case []any:
			// dynamic array elements will be default casted to string
			tblFieldName, value = d.ToText(tblFieldName), toStrings(v)
		}
	case telemetrytypes.FieldDataTypeUnspecified:
		if operator == qbtypes.FilterOperatorUnknown {
			switch value.(type) {
			case float32, float64, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, json.Number:
				tblFieldName = d.ExactFloatOrNull(tblFieldName)
			case string:
				tblFieldName = d.ToText(tblFieldName)
			}
		}
	}
	return tblFieldName, value
}

// ColumnIsTemporal reports whether a column carries a time value.
func ColumnIsTemporal(col *chschema.Column) bool {
	switch col.Type.GetType() {
	case chschema.ColumnTypeEnumDateTime64, chschema.ColumnTypeEnumDateTime,
		chschema.ColumnTypeEnumDate, chschema.ColumnTypeEnumDate32:
		return true
	}
	return false
}

func allFloats(in []any) bool {
	for _, x := range in {
		if _, ok := x.(float64); !ok {
			return false
		}
	}
	return true
}

func hasString(in []any) bool {
	for _, x := range in {
		if _, ok := x.(string); ok {
			return true
		}
	}
	return false
}

func toStrings(in []any) []any {
	out := make([]any, len(in))
	for i, x := range in {
		out[i] = fmt.Sprintf("%v", x)
	}
	return out
}
