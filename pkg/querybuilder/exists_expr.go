package querybuilder

import (
	"fmt"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

// ExistsExpression renders the existence predicate for a key resolved to the given
// columns (negated when exists is false). Comparisons are against constants rendered
// as literals, so the expression carries no bind args and can guard column expressions
// directly. Signal-specific presence checks (body JSON paths, label maps) are handled
// by the field mappers before falling through to this.
func ExistsExpression(columns []*chschema.Column, key *telemetrytypes.TelemetryFieldKey, tsStart, tsEnd uint64, fieldExpression string, exists bool) (string, error) {
	newColumns, evolutionsEntries, err := qbtypes.SelectEvolutionsForColumns(columns, key.Evolutions, tsStart, tsEnd)
	if err != nil {
		return "", err
	}
	if len(newColumns) == 0 {
		return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "no valid evolution found for field %s in the given time range", key.Name)
	}

	comparison := func(operator string, value string) string {
		return fmt.Sprintf("%s %s %s", fieldExpression, operator, value)
	}

	if len(newColumns) > 1 {
		if exists {
			return fieldExpression + " IS NOT NULL", nil
		}
		return fieldExpression + " IS NULL", nil
	}

	column := newColumns[0]
	switch column.Type.GetType() {
	case chschema.ColumnTypeEnumJSON:
		// the ::String cast in the value expression folds NULL to '', so the
		// presence check must address the raw JSON path
		columnName := column.Name
		if len(evolutionsEntries) > 0 && evolutionsEntries[0] != nil {
			columnName = evolutionsEntries[0].ColumnName
		}
		rawPath := fmt.Sprintf("%s.%s", columnName, clickhousesql.Identifier(key.Name))
		if exists {
			return rawPath + " IS NOT NULL", nil
		}
		return rawPath + " IS NULL", nil
	case chschema.ColumnTypeEnumString,
		chschema.ColumnTypeEnumFixedString:
		if exists {
			return comparison("<>", "''"), nil
		}
		return comparison("=", "''"), nil
	case chschema.ColumnTypeEnumDateTime64:
		zero := fmt.Sprintf("toDateTime64(0, %d)", column.Type.(chschema.DateTime64ColumnType).Precision)
		if exists {
			return comparison("<>", zero), nil
		}
		return comparison("=", zero), nil
	case chschema.ColumnTypeEnumLowCardinality:
		switch elementType := column.Type.(chschema.LowCardinalityColumnType).ElementType; elementType.GetType() {
		case chschema.ColumnTypeEnumString:
			if exists {
				return comparison("<>", "''"), nil
			}
			return comparison("=", "''"), nil
		default:
			return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "exists operator is not supported for low cardinality column type %s", elementType)
		}
	case chschema.ColumnTypeEnumUInt64,
		chschema.ColumnTypeEnumUInt32,
		chschema.ColumnTypeEnumUInt8,
		chschema.ColumnTypeEnumInt8,
		chschema.ColumnTypeEnumInt16,
		chschema.ColumnTypeEnumBool:
		if exists {
			return comparison("<>", "0"), nil
		}
		return comparison("=", "0"), nil
	case chschema.ColumnTypeEnumArray:
		if exists {
			return fmt.Sprintf("notEmpty(%s)", fieldExpression), nil
		}
		return fmt.Sprintf("empty(%s)", fieldExpression), nil
	case chschema.ColumnTypeEnumMap:
		keyType := column.Type.(chschema.MapColumnType).KeyType
		if _, ok := keyType.(chschema.LowCardinalityColumnType); !ok {
			return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "key type %s is not supported for map column type %s", keyType, column.Type)
		}

		switch valueType := column.Type.(chschema.MapColumnType).ValueType; valueType.GetType() {
		case chschema.ColumnTypeEnumString, chschema.ColumnTypeEnumBool, chschema.ColumnTypeEnumFloat64:
			if key.Materialized {
				return telemetrytypes.FieldKeyToMaterializedExistsCondition(key, exists), nil
			}
			leftOperand := fmt.Sprintf("mapContains(%s, %s)", column.Name, clickhousesql.StringLiteral(key.Name))
			if exists {
				return leftOperand, nil
			}
			return "NOT " + leftOperand, nil
		default:
			return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "exists operator is not supported for map column type %s", valueType)
		}
	default:
		return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "exists operator is not supported for column type %s", column.Type)
	}
}
