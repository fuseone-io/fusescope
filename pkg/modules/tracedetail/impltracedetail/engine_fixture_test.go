package impltracedetail

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/flighttelemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// engineEvent and engineLink are a span event and link as the engine stores them.
type engineEvent struct {
	at         time.Time
	name       string
	attributes map[string]string
}

type engineLink struct {
	traceID, spanID, traceState string
}

// engineSpan is one row of the engine's spans table; a nil promoted column is null.
type engineSpan struct {
	spanID, parentSpanID     string
	at                       time.Time
	duration                 uint64
	name, kindString         string
	kind                     int8
	statusCode               int16
	statusCodeString         string
	statusMessage            string
	hasError                 bool
	isRemote, traceState     string
	flags                    uint32
	service                  string
	resources, attrs         map[string]string
	numbers                  map[string]float64
	bools                    map[string]bool
	events                   []engineEvent
	links                    []engineLink
	httpMethod, responseCode *string
	dbName, dbOperation      *string
}

var (
	ts        = &arrow.TimestampType{Unit: arrow.Nanosecond, TimeZone: "UTC"}
	dict      = &arrow.DictionaryType{IndexType: arrow.PrimitiveTypes.Int32, ValueType: arrow.BinaryTypes.String}
	id8       = &arrow.FixedSizeBinaryType{ByteWidth: 8}
	id16      = &arrow.FixedSizeBinaryType{ByteWidth: 16}
	eventType = arrow.StructOf(
		arrow.Field{Name: "timestamp", Type: ts},
		arrow.Field{Name: "name", Type: arrow.BinaryTypes.String},
		arrow.Field{Name: "attributes", Type: mapOf(arrow.BinaryTypes.String)},
	)
	linkType = arrow.StructOf(
		arrow.Field{Name: "trace_id", Type: id16},
		arrow.Field{Name: "span_id", Type: id8},
		arrow.Field{Name: "trace_state", Type: arrow.BinaryTypes.String},
		arrow.Field{Name: "attributes", Type: mapOf(arrow.BinaryTypes.String)},
	)
)

func mapOf(item arrow.DataType) *arrow.MapType {
	m := arrow.MapOf(arrow.BinaryTypes.String, item)
	m.SetItemNullable(false)
	return m
}

// fullSchema is the engine's span schema v1, in its order.
func fullSchema() *arrow.Schema {
	field := func(name string, typ arrow.DataType) arrow.Field { return arrow.Field{Name: name, Type: typ} }
	fields := []arrow.Field{
		field("ts_bucket_start", arrow.PrimitiveTypes.Uint64), field("timestamp", ts), field("trace_id", id16), field("span_id", id8),
		{Name: "parent_span_id", Type: id8, Nullable: true}, field("trace_state", arrow.BinaryTypes.String),
		field("flags", arrow.PrimitiveTypes.Uint32), field("name", dict), field("kind", arrow.PrimitiveTypes.Int8),
		field("kind_string", dict), field("duration_nano", arrow.PrimitiveTypes.Uint64), field("status_code", arrow.PrimitiveTypes.Int16),
		field("status_code_string", dict), field("status_message", arrow.BinaryTypes.String), field("has_error", arrow.FixedWidthTypes.Boolean),
		field("is_remote", dict), field("resource_fingerprint", arrow.PrimitiveTypes.Uint64),
		field("resources_string", mapOf(arrow.BinaryTypes.String)), field("attributes_string", mapOf(arrow.BinaryTypes.String)),
		field("attributes_number", mapOf(arrow.PrimitiveTypes.Float64)), field("attributes_bool", mapOf(arrow.FixedWidthTypes.Boolean)),
		field("scope_name", arrow.BinaryTypes.String), field("scope_version", arrow.BinaryTypes.String),
		field("scope_string", mapOf(arrow.BinaryTypes.String)),
		field("events", arrow.ListOfNonNullable(eventType)), field("links", arrow.ListOfNonNullable(linkType)),
	}
	for _, promoted := range []string{"service_name", "deployment_environment", "http_route", "http_method", "response_status_code", "db_system", "db_name", "db_operation"} {
		fields = append(fields, arrow.Field{Name: promoted, Type: dict, Nullable: true})
	}
	return arrow.NewSchema(fields, nil)
}

// minimalSchema is what a minimal lookup answers.
func minimalSchema() *arrow.Schema {
	return arrow.NewSchema([]arrow.Field{
		{Name: "span_id", Type: id8}, {Name: "parent_span_id", Type: id8, Nullable: true}, {Name: "timestamp", Type: ts},
		{Name: "duration_nano", Type: arrow.PrimitiveTypes.Uint64}, {Name: "has_error", Type: arrow.FixedWidthTypes.Boolean},
		{Name: "service_name", Type: dict, Nullable: true}, {Name: "name", Type: dict},
	}, nil)
}

func ptr(s string) *string { return &s }

// value is a span's value for a column, nil for a null.
func (s engineSpan) value(column string) any {
	service := &s.service
	if s.service == "" {
		service = nil
	}
	values := map[string]any{
		"ts_bucket_start": uint64(s.at.Unix()), "timestamp": s.at, "trace_id": testTraceID, "span_id": s.spanID,
		"trace_state": s.traceState, "flags": s.flags, "name": s.name, "kind": s.kind, "kind_string": s.kindString,
		"duration_nano": s.duration, "status_code": s.statusCode, "status_code_string": s.statusCodeString,
		"status_message": s.statusMessage, "has_error": s.hasError, "is_remote": s.isRemote, "resource_fingerprint": uint64(7),
		"resources_string": s.resources, "attributes_string": s.attrs, "attributes_number": s.numbers, "attributes_bool": s.bools,
		"scope_name": "scope", "scope_version": "1", "scope_string": map[string]string{}, "events": s.events, "links": s.links,
	}
	if s.parentSpanID != "" {
		values["parent_span_id"] = s.parentSpanID
	}
	for column, v := range map[string]*string{"service_name": service, "http_method": s.httpMethod, "response_status_code": s.responseCode, "db_name": s.dbName, "db_operation": s.dbOperation} {
		if v != nil {
			values[column] = *v
		}
	}
	return values[column]
}

func batchOf(t *testing.T, schema *arrow.Schema, spans ...engineSpan) arrow.RecordBatch {
	t.Helper()
	b := array.NewRecordBuilder(memory.DefaultAllocator, schema)
	defer b.Release()
	for _, span := range spans {
		for i, field := range schema.Fields() {
			appendValue(t, b.Field(i), span.value(field.Name))
		}
	}
	return b.NewRecordBatch()
}

func appendValue(t *testing.T, b array.Builder, v any) {
	t.Helper()
	if v == nil {
		b.AppendNull()
		return
	}
	switch b := b.(type) {
	case *array.FixedSizeBinaryBuilder:
		raw, err := hex.DecodeString(v.(string))
		require.NoError(t, err)
		b.Append(raw)
	case *array.BinaryDictionaryBuilder:
		require.NoError(t, b.AppendString(v.(string)))
	case *array.StringBuilder:
		b.Append(v.(string))
	case *array.TimestampBuilder:
		b.Append(arrow.Timestamp(v.(time.Time).UnixNano()))
	case *array.Uint64Builder:
		b.Append(v.(uint64))
	case *array.Uint32Builder:
		b.Append(v.(uint32))
	case *array.Int8Builder:
		b.Append(v.(int8))
	case *array.Int16Builder:
		b.Append(v.(int16))
	case *array.Float64Builder:
		b.Append(v.(float64))
	case *array.BooleanBuilder:
		b.Append(v.(bool))
	case *array.MapBuilder:
		appendMap(t, b, v)
	case *array.ListBuilder:
		b.Append(true)
		switch items := v.(type) {
		case []engineEvent:
			for _, event := range items {
				appendStruct(t, b.ValueBuilder().(*array.StructBuilder), event.at, event.name, event.attributes)
			}
		case []engineLink:
			for _, link := range items {
				appendStruct(t, b.ValueBuilder().(*array.StructBuilder), link.traceID, link.spanID, link.traceState, map[string]string{})
			}
		}
	default:
		t.Fatalf("no fixture for %T", b)
	}
}

func appendStruct(t *testing.T, b *array.StructBuilder, fields ...any) {
	b.Append(true)
	for i, v := range fields {
		appendValue(t, b.FieldBuilder(i), v)
	}
}

func appendMap(t *testing.T, b *array.MapBuilder, v any) {
	b.Append(true)
	switch m := v.(type) {
	case map[string]string:
		for k, item := range m {
			appendValue(t, b.KeyBuilder(), k)
			appendValue(t, b.ItemBuilder(), item)
		}
	case map[string]float64:
		for k, item := range m {
			appendValue(t, b.KeyBuilder(), k)
			appendValue(t, b.ItemBuilder(), item)
		}
	case map[string]bool:
		for k, item := range m {
			appendValue(t, b.KeyBuilder(), k)
			appendValue(t, b.ItemBuilder(), item)
		}
	case nil:
	default:
		t.Fatalf("no fixture for map %T", v)
	}
}

const testTraceID = "4bf92f3577b34da6a3ce929d0e0e4736"

// lookupCall is one trace.lookup the engine received.
type lookupCall struct {
	Body   lookupBody
	Route  telemetrystore.Route
	Tenant string
}

// fakeEngine answers each Do with the next of answers; its ClickHouse fails the test on any
// statement it was not told to expect.
type fakeEngine struct {
	*telemetrystoretest.Provider
	t       *testing.T
	answers []func() (telemetrystore.Rows, error)
	calls   []lookupCall
}

func newFakeEngine(t *testing.T, answers ...func() (telemetrystore.Rows, error)) *fakeEngine {
	e := &fakeEngine{Provider: telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherRegexp), t: t, answers: answers}
	t.Cleanup(func() {
		assert.NoError(t, e.Mock().ExpectationsWereMet(), "ClickHouse got only what it was told to expect")
		assert.Len(t, e.calls, len(answers), "every answer was asked for")
	})
	return e
}

func (e *fakeEngine) Do(ctx context.Context, action string, body []byte) (telemetrystore.Rows, error) {
	require.Equal(e.t, "trace.lookup", action)
	var call lookupCall
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	require.NoError(e.t, dec.Decode(&call.Body))
	call.Route = telemetrystore.RouteFromContext(ctx)
	if identity, err := telemetrystore.IdentityFromContext(ctx); err == nil {
		call.Tenant = identity.Tenant.StringValue()
	}
	e.calls = append(e.calls, call)
	require.LessOrEqual(e.t, len(e.calls), len(e.answers), "an unexpected lookup")
	return e.answers[len(e.calls)-1]()
}

func rowsOf(t *testing.T, warnings []string, batches ...arrow.RecordBatch) func() (telemetrystore.Rows, error) {
	return func() (telemetrystore.Rows, error) {
		rows, err := flighttelemetrystore.NewRows(warnings, batches...)
		require.NoError(t, err)
		return rows, nil
	}
}

func failWith(err error) func() (telemetrystore.Rows, error) {
	return func() (telemetrystore.Rows, error) { return nil, err }
}
