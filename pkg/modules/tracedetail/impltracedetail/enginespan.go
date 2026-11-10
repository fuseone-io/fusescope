package impltracedetail

import (
	"reflect"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
)

// scanRow reads the current row by column name. A null is left out, so it reads as the zero value.
func scanRow(rows telemetrystore.Rows, types []telemetrystore.ColumnType) (map[string]any, error) {
	dest := make([]any, len(types))
	for i, typ := range types {
		dest[i] = reflect.New(typ.ScanType()).Interface()
	}
	if err := rows.Scan(dest...); err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "error scanning a trace span")
	}
	row := make(map[string]any, len(types))
	for i, typ := range types {
		v := reflect.ValueOf(dest[i]).Elem()
		if v.Kind() == reflect.Pointer {
			if v.IsNil() {
				continue
			}
			v = v.Elem()
		}
		row[typ.Name()] = v.Interface()
	}
	return row, nil
}

func get[T any](row map[string]any, column string) T {
	v, _ := row[column].(T)
	return v
}

// storableSpanOf maps a row of the engine's spans table to the span the ClickHouse reader scans,
// with the JSON attributes document when withJSON, as the ClickHouse reader reads it under
// use_trace_attributes_json. http_url, http_host and the external_http pair are not stored by the
// engine and read empty.
func storableSpanOf(row map[string]any, withJSON bool) spantypes.StorableSpan {
	span := spantypes.StorableSpan{
		StartTime:          get[time.Time](row, "timestamp"),
		DurationNano:       get[uint64](row, "duration_nano"),
		SpanID:             get[string](row, "span_id"),
		HasError:           get[bool](row, "has_error"),
		Kind:               get[int8](row, "kind"),
		ServiceName:        get[string](row, "service_name"),
		Name:               get[string](row, "name"),
		AttributesString:   get[map[string]string](row, "attributes_string"),
		AttributesNumber:   get[map[string]float64](row, "attributes_number"),
		AttributesBool:     get[map[string]bool](row, "attributes_bool"),
		ResourcesString:    get[map[string]string](row, "resources_string"),
		Events:             spantypes.LegacyEvents(get[[]any](row, "events")),
		StatusMessage:      get[string](row, "status_message"),
		StatusCodeString:   get[string](row, "status_code_string"),
		SpanKind:           get[string](row, "kind_string"),
		ParentSpanID:       get[string](row, "parent_span_id"),
		Flags:              get[uint32](row, "flags"),
		IsRemote:           get[string](row, "is_remote"),
		TraceState:         get[string](row, "trace_state"),
		StatusCode:         get[int16](row, "status_code"),
		DBName:             get[string](row, "db_name"),
		DBOperation:        get[string](row, "db_operation"),
		HTTPMethod:         get[string](row, "http_method"),
		ResponseStatusCode: get[string](row, "response_status_code"),
		References:         spantypes.LegacyLinks(get[[]any](row, "links")),
	}
	if withJSON {
		span.AttributesJSON = spantypes.AttributesDocument(span.AttributesString, span.AttributesNumber, span.AttributesBool)
	}
	return span
}

// readSpans reads full rows, one per span_id.
func readSpans(rows telemetrystore.Rows, withJSON bool) ([]spantypes.StorableSpan, error) {
	defer rows.Close()
	types := rows.ColumnTypes()
	seen := make(map[string]struct{})
	var spans []spantypes.StorableSpan
	for rows.Next() {
		row, err := scanRow(rows, types)
		if err != nil {
			return nil, err
		}
		span := storableSpanOf(row, withJSON)
		if _, dup := seen[span.SpanID]; dup {
			continue
		}
		seen[span.SpanID] = struct{}{}
		spans = append(spans, span)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return spans, nil
}

// readMinimalSpans reads minimal rows, one per span_id.
func readMinimalSpans(rows telemetrystore.Rows) ([]spantypes.MinimalSpan, error) {
	defer rows.Close()
	types := rows.ColumnTypes()
	seen := make(map[string]struct{})
	var spans []spantypes.MinimalSpan
	for rows.Next() {
		row, err := scanRow(rows, types)
		if err != nil {
			return nil, err
		}
		span := spantypes.MinimalSpan{
			SpanID:       get[string](row, "span_id"),
			ParentSpanID: get[string](row, "parent_span_id"),
			StartTime:    get[time.Time](row, "timestamp"),
			DurationNano: get[uint64](row, "duration_nano"),
			HasError:     get[bool](row, "has_error"),
			ServiceName:  get[string](row, "service_name"),
			Name:         get[string](row, "name"),
		}
		if _, dup := seen[span.SpanID]; dup {
			continue
		}
		seen[span.SpanID] = struct{}{}
		spans = append(spans, span)
	}
	return spans, rows.Err()
}
