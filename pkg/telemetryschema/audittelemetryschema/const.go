package audittelemetryschema

import (
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

const (
	// Internal Columns.
	IDColumn                   = "id"
	TimestampBucketStartColumn = "ts_bucket_start"
	ResourceFingerPrintColumn  = "resource_fingerprint"

	// Intrinsic Columns.
	TimestampColumn         = "timestamp"
	ObservedTimestampColumn = "observed_timestamp"
	BodyColumn              = "body"
	EventNameColumn         = "event_name"
	TraceIDColumn           = "trace_id"
	SpanIDColumn            = "span_id"
	TraceFlagsColumn        = "trace_flags"
	SeverityTextColumn      = "severity_text"
	SeverityNumberColumn    = "severity_number"
	ScopeNameColumn         = "scope_name"
	ScopeVersionColumn      = "scope_version"

	// Contextual Columns.
	AttributesStringColumn = "attributes_string"
	AttributesNumberColumn = "attributes_number"
	AttributesBoolColumn   = "attributes_bool"
	ResourceColumn         = "resource"
	ScopeStringColumn      = "scope_string"
)

var (
	DefaultFullTextColumn = &telemetrytypes.TelemetryFieldKey{
		Name:          "body",
		Signal:        telemetrytypes.SignalLogs,
		FieldContext:  telemetrytypes.FieldContextLog,
		FieldDataType: telemetrytypes.FieldDataTypeString,
	}

	IntrinsicFields = map[string]telemetrytypes.TelemetryFieldKey{
		"body": {
			Name:          "body",
			Signal:        telemetrytypes.SignalLogs,
			FieldContext:  telemetrytypes.FieldContextLog,
			FieldDataType: telemetrytypes.FieldDataTypeString,
		},
		"trace_id": {
			Name:          "trace_id",
			Signal:        telemetrytypes.SignalLogs,
			FieldContext:  telemetrytypes.FieldContextLog,
			FieldDataType: telemetrytypes.FieldDataTypeString,
		},
		"span_id": {
			Name:          "span_id",
			Signal:        telemetrytypes.SignalLogs,
			FieldContext:  telemetrytypes.FieldContextLog,
			FieldDataType: telemetrytypes.FieldDataTypeString,
		},
		"trace_flags": {
			Name:          "trace_flags",
			Signal:        telemetrytypes.SignalLogs,
			FieldContext:  telemetrytypes.FieldContextLog,
			FieldDataType: telemetrytypes.FieldDataTypeNumber,
		},
		"severity_text": {
			Name:          "severity_text",
			Signal:        telemetrytypes.SignalLogs,
			FieldContext:  telemetrytypes.FieldContextLog,
			FieldDataType: telemetrytypes.FieldDataTypeString,
		},
		"severity_number": {
			Name:          "severity_number",
			Signal:        telemetrytypes.SignalLogs,
			FieldContext:  telemetrytypes.FieldContextLog,
			FieldDataType: telemetrytypes.FieldDataTypeNumber,
		},
		"event_name": {
			Name:          "event_name",
			Signal:        telemetrytypes.SignalLogs,
			FieldContext:  telemetrytypes.FieldContextLog,
			FieldDataType: telemetrytypes.FieldDataTypeString,
		},
	}

	DefaultSortingOrder = []qbtypes.OrderBy{
		{
			Key: qbtypes.OrderByKey{
				TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{
					Name: TimestampColumn,
				},
			},
			Direction: qbtypes.OrderDirectionDesc,
		},
		{
			Key: qbtypes.OrderByKey{
				TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{
					Name: IDColumn,
				},
			},
			Direction: qbtypes.OrderDirectionDesc,
		},
	}
)

var auditLogColumns = map[string]*chschema.Column{
	"ts_bucket_start":      {Name: "ts_bucket_start", Type: chschema.ColumnTypeUInt64},
	"resource_fingerprint": {Name: "resource_fingerprint", Type: chschema.ColumnTypeString},
	"timestamp":            {Name: "timestamp", Type: chschema.ColumnTypeUInt64},
	"observed_timestamp":   {Name: "observed_timestamp", Type: chschema.ColumnTypeUInt64},
	"id":                   {Name: "id", Type: chschema.ColumnTypeString},
	"trace_id":             {Name: "trace_id", Type: chschema.ColumnTypeString},
	"span_id":              {Name: "span_id", Type: chschema.ColumnTypeString},
	"trace_flags":          {Name: "trace_flags", Type: chschema.ColumnTypeUInt32},
	"severity_text":        {Name: "severity_text", Type: chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString}},
	"severity_number":      {Name: "severity_number", Type: chschema.ColumnTypeUInt8},
	"body":                 {Name: "body", Type: chschema.ColumnTypeString},
	"attributes_string":    {Name: "attributes_string", Type: chschema.MapColumnType{KeyType: chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString}, ValueType: chschema.ColumnTypeString}},
	"attributes_number":    {Name: "attributes_number", Type: chschema.MapColumnType{KeyType: chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString}, ValueType: chschema.ColumnTypeFloat64}},
	"attributes_bool":      {Name: "attributes_bool", Type: chschema.MapColumnType{KeyType: chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString}, ValueType: chschema.ColumnTypeBool}},
	"resource":             {Name: "resource", Type: chschema.JSONColumnType{}},
	"event_name":           {Name: "event_name", Type: chschema.ColumnTypeString},
	"scope_name":           {Name: "scope_name", Type: chschema.ColumnTypeString},
	"scope_version":        {Name: "scope_version", Type: chschema.ColumnTypeString},
	"scope_string":         {Name: "scope_string", Type: chschema.MapColumnType{KeyType: chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString}, ValueType: chschema.ColumnTypeString}},
}

const (
	DBName                      = "signoz_audit"
	AuditLogsTableName          = "distributed_logs"
	AuditLogsLocalTableName     = "logs"
	TagAttributesTableName      = "distributed_tag_attributes"
	TagAttributesLocalTableName = "tag_attributes"
	LogAttributeKeysTblName     = "distributed_logs_attribute_keys"
	LogResourceKeysTblName      = "distributed_logs_resource_keys"
	LogsResourceTableName       = "distributed_logs_resource"
)
