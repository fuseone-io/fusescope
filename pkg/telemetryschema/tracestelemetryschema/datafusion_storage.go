package tracestelemetryschema

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/datafusionsql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/huandu/go-sqlbuilder"
)

// DataFusionSpansTable is the spans table of every fusescope-engine session.
const DataFusionSpansTable = "spans"

var (
	// dataFusionPromoted maps a key to the flat column fusescope-engine
	// promotes it to, every semconv spelling the engine tries included
	// (fs-schema PROMOTED). The key also stays in its map.
	dataFusionPromotedResource = map[string]string{
		"service.name":                "service_name",
		"deployment.environment.name": "deployment_environment",
		"deployment.environment":      "deployment_environment",
	}
	dataFusionPromotedAttribute = map[string]string{
		"http.route":               "http_route",
		"http.request.method":      "http_method",
		"http.method":              "http_method",
		"db.system.name":           "db_system",
		"db.system":                "db_system",
		"db.namespace":             "db_name",
		"db.name":                  "db_name",
		"db.operation.name":        "db_operation",
		"db.operation":             "db_operation",
		"rpc.system":               "rpc_system",
		"rpc.service":              "rpc_service",
		"rpc.method":               "rpc_method",
		"messaging.system":         "messaging_system",
		"messaging.operation.type": "messaging_operation",
		"messaging.operation.name": "messaging_operation",
		"messaging.operation":      "messaging_operation",
		"peer.service":             "peer_service",
	}

	// dataFusionSpanColumns are the span columns of the engine that read as
	// the ClickHouse column of the same name.
	dataFusionSpanColumns = map[string]string{
		"timestamp":          "timestamp",
		"trace_state":        "trace_state",
		"flags":              "flags",
		"name":               "name",
		"kind":               "kind",
		"kind_string":        "kind_string",
		"duration_nano":      "duration_nano",
		"status_code":        "status_code",
		"status_message":     "status_message",
		"status_code_string": "status_code_string",
		"has_error":          "has_error",
		"events":             "events",
		"links":              "links",
		"ts_bucket_start":    "ts_bucket_start",
		// Derived by the engine when read, from kind and the attribute maps.
		"http_url":             "http_url",
		"http_host":            "http_host",
		"external_http_method": "external_http_method",
		"external_http_url":    "external_http_url",
	}

	// dataFusionEmpty is the value a plain span column holds when it is unset.
	dataFusionEmpty = map[string]string{
		"timestamp":            "to_timestamp_nanos(0)",
		"trace_state":          "''",
		"flags":                "0",
		"name":                 "''",
		"kind":                 "0",
		"kind_string":          "''",
		"duration_nano":        "0",
		"status_code":          "0",
		"status_message":       "''",
		"status_code_string":   "''",
		"has_error":            "false",
		"ts_bucket_start":      "0",
		"http_url":             "''",
		"http_host":            "''",
		"external_http_method": "''",
		"external_http_url":    "''",
	}

	// dataFusionNullableColumns are promoted columns, NULL when the span
	// has none of their keys, that read as the ClickHouse column that
	// held '' then.
	dataFusionNullableColumns = map[string]string{
		"response_status_code":                  "response_status_code",
		"http_method":                           "http_method",
		"db_name":                               "db_name",
		"db_operation":                          "db_operation",
		"resource_string_service$$name":         "service_name",
		"attribute_string_http$$route":          "http_route",
		"attribute_string_messaging$$system":    "messaging_system",
		"attribute_string_messaging$$operation": "messaging_operation",
		"attribute_string_db$$system":           "db_system",
		"attribute_string_rpc$$system":          "rpc_system",
		"attribute_string_rpc$$service":         "rpc_service",
		"attribute_string_rpc$$method":          "rpc_method",
		"attribute_string_peer$$service":        "peer_service",
	}

	// dataFusionIDs are the identity columns, stored as bytes and read as
	// lowercase hex, with their width in hex digits.
	dataFusionIDs = map[string]int{
		"trace_id":       32,
		"span_id":        16,
		"parent_span_id": 16,
	}

	hexDigits = regexp.MustCompile(`^[0-9a-fA-F]+$`)
)

// dataFusionIsRemote reads the engine's is_remote, the OTLP flags as ”, 'true' or 'false', in the
// backend's vocabulary, 'unknown', 'yes' or 'no', for selection and every filter operator alike.
// The engine's own top-level rule compares the canonical value.
const dataFusionLinksWithIDs = "named_struct('trace_id', encode(trace_id, 'hex'), 'parent_span_id', coalesce(encode(parent_span_id, 'hex'), ''), 'links', links)"

const dataFusionIsRemote = "CASE is_remote WHEN 'true' THEN 'yes' WHEN 'false' THEN 'no' ELSE 'unknown' END"

type dataFusionStorage struct {
	clickhouse *storage
}

var _ qbtypes.Storage = (*dataFusionStorage)(nil)

// NewDataFusionStorage resolves trace keys to the columns of a
// fusescope-engine spans table.
func NewDataFusionStorage() qbtypes.Storage {
	return &dataFusionStorage{clickhouse: &storage{}}
}

// DataFusionTarget is the target of a trace builder that renders for fusescope-engine.
func DataFusionTarget() querybuilder.Target {
	return querybuilder.Target{
		Dialect:        querybuilder.DataFusion{},
		Storage:        NewDataFusionStorage(),
		SpansTable:     DataFusionSpansTable,
		ContextColumns: []string{SpanAttributesStringColumn, SpanAttributesNumberColumn, SpanAttributesBoolColumn, SpanResourcesStringColumn},
		InlineResource: true,
	}
}

func (m *dataFusionStorage) Read(ctx context.Context, q qbtypes.QueryInfo, key *telemetrytypes.TelemetryFieldKey) (qbtypes.Read, error) {
	if isSpanSearchScopeField(key.Name) {
		return qbtypes.Read{SQL: key.Name, Presence: "true", Absence: "false", WhenAbsent: qbtypes.AlwaysPresent}, nil
	}
	switch key.FieldContext {
	case telemetrytypes.FieldContextResource:
		if column, ok := dataFusionPromotedResource[key.Name]; ok {
			return nullableRead(column), nil
		}
		return mapRead(SpanResourcesStringColumn, key.Name, "''")
	case telemetrytypes.FieldContextAttribute:
		if column, ok := dataFusionPromotedAttribute[key.Name]; ok && key.FieldDataType == telemetrytypes.FieldDataTypeString {
			return nullableRead(column), nil
		}
		switch key.FieldDataType {
		case telemetrytypes.FieldDataTypeString:
			return mapRead(SpanAttributesStringColumn, key.Name, "''")
		case telemetrytypes.FieldDataTypeInt64, telemetrytypes.FieldDataTypeFloat64, telemetrytypes.FieldDataTypeNumber:
			return mapRead(SpanAttributesNumberColumn, key.Name, "0")
		case telemetrytypes.FieldDataTypeBool:
			return mapRead(SpanAttributesBoolColumn, key.Name, "false")
		}
		return qbtypes.Read{}, qbtypes.ErrColumnNotFound
	case telemetrytypes.FieldContextScope:
		switch key.Name {
		case "scope.name", "scope.version":
			column := strings.ReplaceAll(key.Name, ".", "_")
			return qbtypes.Read{SQL: column, Presence: column + " <> ''", Absence: column + " = ''", WhenAbsent: qbtypes.AbsentIsSentinel}, nil
		}
		return mapRead("scope_string", key.Name, "''")
	case telemetrytypes.FieldContextSpan, telemetrytypes.FieldContextTrace:
		return spanColumnRead(key.Name)
	}
	return qbtypes.Read{}, qbtypes.ErrColumnNotFound
}

func spanColumnRead(name string) (qbtypes.Read, error) {
	if current, ok := oldToNew[name]; ok {
		name = current
	}
	if _, ok := dataFusionIDs[name]; ok {
		if name == SpanParentSpanIDColumn {
			return presentRead(fmt.Sprintf("coalesce(encode(%s, 'hex'), '')", name), "''"), nil
		}
		return presentRead(fmt.Sprintf("encode(%s, 'hex')", name), "''"), nil
	}
	if name == SpanIsRemoteColumn {
		return presentRead(dataFusionIsRemote, "''"), nil
	}
	if column, ok := dataFusionSpanColumns[name]; ok {
		read := presentRead(column, dataFusionEmpty[column])
		read.KeepType = name == SpanTimestampColumn
		if column == "events" || column == "links" {
			read.Presence, read.Absence = fmt.Sprintf("cardinality(%s) > 0", column), fmt.Sprintf("cardinality(%s) = 0", column)
		}
		if column == "links" {
			// ClickHouse stores a span's own reference to its parent ahead of its links; the
			// reader writes it from the ids read alongside, which the answer does not carry.
			read.SQL = dataFusionLinksWithIDs
		}
		return read, nil
	}
	if column, ok := dataFusionNullableColumns[name]; ok {
		return presentRead(fmt.Sprintf("coalesce(%s, '')", column), "''"), nil
	}
	return qbtypes.Read{}, qbtypes.ErrColumnNotFound
}

// presentRead is a column every span has; it exists when it is not its
// empty value, as ClickHouse tests a plain column.
func presentRead(sql, empty string) qbtypes.Read {
	return qbtypes.Read{
		SQL:        sql,
		Presence:   fmt.Sprintf("%s <> %s", sql, empty),
		Absence:    fmt.Sprintf("%s = %s", sql, empty),
		WhenAbsent: qbtypes.AlwaysPresent,
	}
}

func nullableRead(column string) qbtypes.Read {
	return qbtypes.Read{SQL: column, Presence: column + " IS NOT NULL", Absence: column + " IS NULL", WhenAbsent: qbtypes.AbsentIsNull}
}

// mapRead reads a map key with the map's empty value for an absent key, as
// a ClickHouse map does, so a negative operator keeps the rows without it.
func mapRead(column, key, empty string) (qbtypes.Read, error) {
	literal, err := datafusionsql.String(key)
	if err != nil {
		return qbtypes.Read{}, err
	}
	value := fmt.Sprintf("%s[%s]", column, literal)
	return qbtypes.Read{
		SQL:        fmt.Sprintf("coalesce(%s, %s)", value, empty),
		Presence:   value + " IS NOT NULL",
		Absence:    value + " IS NULL",
		WhenAbsent: qbtypes.AbsentIsSentinel,
	}, nil
}

func (m *dataFusionStorage) Fallback(ctx context.Context, q qbtypes.QueryInfo, key *telemetrytypes.TelemetryFieldKey, operator qbtypes.FilterOperator, value any) ([]*telemetrytypes.LogicalField, error) {
	return m.clickhouse.Fallback(ctx, q, key, operator, value)
}

func (m *dataFusionStorage) Traits() qbtypes.Traits {
	return m.clickhouse.Traits()
}

// Compile keeps the trace rules ahead of the shared condition: a span
// scope key is a structural predicate, an identity compares as bytes, and
// a duration operand accepts duration syntax.
func (m *dataFusionStorage) Compile(ctx context.Context, q qbtypes.QueryInfo, logical *telemetrytypes.LogicalField, operator qbtypes.FilterOperator, value any, sb *sqlbuilder.SelectBuilder) (qbtypes.Compiled, error) {
	if isSpanSearchScopeField(logical.Name) {
		condition, err := dataFusionSpanScopeCondition(logical.Single(), operator, value, q.StartNs)
		if err != nil {
			return qbtypes.Compiled{}, err
		}
		return qbtypes.Compiled{Condition: condition}, nil
	}
	if column, width, ok := idColumn(logical); ok {
		if condition, handled, err := idCondition(column, width, operator, value, sb); handled || err != nil {
			return qbtypes.Compiled{Condition: condition}, err
		}
	}
	if logical.Name == "duration_nano" || logical.Name == "durationNano" {
		coerced, err := querybuilder.CoerceDurationValue(value)
		if err != nil {
			return qbtypes.Compiled{}, err
		}
		value = coerced
	}
	return querybuilder.SharedCondition(ctx, q, m, logical, operator, value, sb)
}

func idColumn(logical *telemetrytypes.LogicalField) (string, int, bool) {
	if logical.IsFamily() {
		return "", 0, false
	}
	key := logical.Single()
	if key.FieldContext != telemetrytypes.FieldContextSpan && key.FieldContext != telemetrytypes.FieldContextTrace {
		return "", 0, false
	}
	name := key.Name
	if current, ok := oldToNew[name]; ok {
		name = current
	}
	width, ok := dataFusionIDs[name]
	return name, width, ok
}

// idCondition compares an identity column with hex operands as bytes, so
// the engine prunes files by it; handled is false for the operators that
// read the hex text instead.
func idCondition(column string, width int, operator qbtypes.FilterOperator, value any, sb *sqlbuilder.SelectBuilder) (string, bool, error) {
	one := func(v any) (string, error) {
		hex, ok := v.(string)
		if !ok || len(hex) != width || !hexDigits.MatchString(hex) {
			return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "%s takes %d hex digits, got %v", column, width, v)
		}
		return fmt.Sprintf("%s = decode(%s, 'hex')", column, sb.Var(strings.ToLower(hex))), nil
	}
	// A root's parent is NULL, which ClickHouse read as '': a negative
	// operator keeps it.
	keepNull := func(condition string) string {
		if column != SpanParentSpanIDColumn {
			return condition
		}
		return fmt.Sprintf("(%s IS NULL OR %s)", column, condition)
	}
	switch operator {
	case qbtypes.FilterOperatorEqual, qbtypes.FilterOperatorNotEqual:
		condition, err := one(value)
		if err != nil {
			return "", true, err
		}
		if operator == qbtypes.FilterOperatorNotEqual {
			condition = keepNull(strings.Replace(condition, " = ", " != ", 1))
		}
		return condition, true, nil
	case qbtypes.FilterOperatorIn, qbtypes.FilterOperatorNotIn:
		values, ok := value.([]any)
		if !ok {
			return "", true, qbtypes.ErrInValues
		}
		conditions := make([]string, 0, len(values))
		for _, v := range values {
			condition, err := one(v)
			if err != nil {
				return "", true, err
			}
			conditions = append(conditions, condition)
		}
		if operator == qbtypes.FilterOperatorNotIn {
			return keepNull("NOT " + sb.Or(conditions...)), true, nil
		}
		return sb.Or(conditions...), true, nil
	}
	return "", false, nil
}

// dataFusionSpanScopeCondition is the span scope predicate on the engine.
// An entry point is a span with a parent, of an operation the engine's
// top_level_operations holds, compacted and recent alike, as ClickHouse
// matches it by operation. The table holds root operations too, so the
// parent test leaves them out.
func dataFusionSpanScopeCondition(key *telemetrytypes.TelemetryFieldKey, operator qbtypes.FilterOperator, value any, startNs uint64) (string, error) {
	if err := checkSpanScopeOperand(key, operator, value); err != nil {
		return "", err
	}
	switch strings.ToLower(key.Name) {
	case SpanSearchScopeRoot:
		return "parent_span_id IS NULL", nil
	case SpanSearchScopeEntryPoint:
		since := ""
		if startNs > 0 {
			since = fmt.Sprintf(" AND t.last_seen >= to_timestamp_nanos(%d)", startNs)
		}
		return "(parent_span_id IS NOT NULL AND EXISTS (SELECT 1 FROM top_level_operations t " +
			"WHERE t.service_name = spans.service_name AND t.name = spans.name" + since + "))", nil
	}
	return "", errors.NewInvalidInputf(errors.CodeInvalidInput, "invalid span search scope: %s", key.Name)
}
