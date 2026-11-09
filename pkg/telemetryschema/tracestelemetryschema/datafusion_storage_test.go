package tracestelemetryschema

import (
	"context"
	"testing"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/huandu/go-sqlbuilder"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDataFusionStorageRead(t *testing.T) {
	cases := []struct {
		name       string
		key        telemetrytypes.TelemetryFieldKey
		sql        string
		presence   string
		absence    string
		whenAbsent qbtypes.Absent
	}{
		{
			name:       "a promoted resource key reads its flat column",
			key:        telemetrytypes.TelemetryFieldKey{Name: "service.name", FieldContext: telemetrytypes.FieldContextResource, FieldDataType: telemetrytypes.FieldDataTypeString},
			sql:        "service_name",
			presence:   "service_name IS NOT NULL",
			absence:    "service_name IS NULL",
			whenAbsent: qbtypes.AbsentIsNull,
		},
		{
			name:       "a legacy semconv key reads the same promoted column",
			key:        telemetrytypes.TelemetryFieldKey{Name: "deployment.environment", FieldContext: telemetrytypes.FieldContextResource, FieldDataType: telemetrytypes.FieldDataTypeString},
			sql:        "deployment_environment",
			presence:   "deployment_environment IS NOT NULL",
			absence:    "deployment_environment IS NULL",
			whenAbsent: qbtypes.AbsentIsNull,
		},
		{
			name:       "a materialized ClickHouse key reads the promoted column",
			key:        telemetrytypes.TelemetryFieldKey{Name: "http.route", FieldContext: telemetrytypes.FieldContextAttribute, FieldDataType: telemetrytypes.FieldDataTypeString, Materialized: true},
			sql:        "http_route",
			presence:   "http_route IS NOT NULL",
			absence:    "http_route IS NULL",
			whenAbsent: qbtypes.AbsentIsNull,
		},
		{
			name:       "another resource key reads the map with its empty value",
			key:        telemetrytypes.TelemetryFieldKey{Name: "host.name", FieldContext: telemetrytypes.FieldContextResource, FieldDataType: telemetrytypes.FieldDataTypeString},
			sql:        "coalesce(resources_string['host.name'], '')",
			presence:   "resources_string['host.name'] IS NOT NULL",
			absence:    "resources_string['host.name'] IS NULL",
			whenAbsent: qbtypes.AbsentIsSentinel,
		},
		{
			name:       "a numeric attribute reads its map with zero",
			key:        telemetrytypes.TelemetryFieldKey{Name: "http.response.status_code", FieldContext: telemetrytypes.FieldContextAttribute, FieldDataType: telemetrytypes.FieldDataTypeFloat64},
			sql:        "coalesce(attributes_number['http.response.status_code'], 0)",
			presence:   "attributes_number['http.response.status_code'] IS NOT NULL",
			absence:    "attributes_number['http.response.status_code'] IS NULL",
			whenAbsent: qbtypes.AbsentIsSentinel,
		},
		{
			name:       "a bool attribute reads its map with false",
			key:        telemetrytypes.TelemetryFieldKey{Name: "cache.hit", FieldContext: telemetrytypes.FieldContextAttribute, FieldDataType: telemetrytypes.FieldDataTypeBool},
			sql:        "coalesce(attributes_bool['cache.hit'], false)",
			presence:   "attributes_bool['cache.hit'] IS NOT NULL",
			absence:    "attributes_bool['cache.hit'] IS NULL",
			whenAbsent: qbtypes.AbsentIsSentinel,
		},
		{
			name:       "a key with a quote is a safe literal",
			key:        telemetrytypes.TelemetryFieldKey{Name: "o'k", FieldContext: telemetrytypes.FieldContextAttribute, FieldDataType: telemetrytypes.FieldDataTypeString},
			sql:        "coalesce(attributes_string['o''k'], '')",
			presence:   "attributes_string['o''k'] IS NOT NULL",
			absence:    "attributes_string['o''k'] IS NULL",
			whenAbsent: qbtypes.AbsentIsSentinel,
		},
		{
			name:       "the trace id reads as hex",
			key:        telemetrytypes.TelemetryFieldKey{Name: "trace_id", FieldContext: telemetrytypes.FieldContextSpan},
			sql:        "encode(trace_id, 'hex')",
			presence:   "encode(trace_id, 'hex') <> ''",
			absence:    "encode(trace_id, 'hex') = ''",
			whenAbsent: qbtypes.AlwaysPresent,
		},
		{
			name:       "a root's parent reads empty",
			key:        telemetrytypes.TelemetryFieldKey{Name: "parent_span_id", FieldContext: telemetrytypes.FieldContextSpan},
			sql:        "coalesce(encode(parent_span_id, 'hex'), '')",
			presence:   "coalesce(encode(parent_span_id, 'hex'), '') <> ''",
			absence:    "coalesce(encode(parent_span_id, 'hex'), '') = ''",
			whenAbsent: qbtypes.AlwaysPresent,
		},
		{
			name:       "an intrinsic column reads bare",
			key:        telemetrytypes.TelemetryFieldKey{Name: "duration_nano", FieldContext: telemetrytypes.FieldContextSpan},
			sql:        "duration_nano",
			presence:   "duration_nano <> 0",
			absence:    "duration_nano = 0",
			whenAbsent: qbtypes.AlwaysPresent,
		},
		{
			name:       "a deprecated name reads its current column",
			key:        telemetrytypes.TelemetryFieldKey{Name: "serviceName", FieldContext: telemetrytypes.FieldContextSpan},
			sql:        "coalesce(service_name, '')",
			presence:   "coalesce(service_name, '') <> ''",
			absence:    "coalesce(service_name, '') = ''",
			whenAbsent: qbtypes.AlwaysPresent,
		},
		{
			name:       "a derived column reads empty when the engine has no value",
			key:        telemetrytypes.TelemetryFieldKey{Name: "response_status_code", FieldContext: telemetrytypes.FieldContextSpan},
			sql:        "coalesce(response_status_code, '')",
			presence:   "coalesce(response_status_code, '') <> ''",
			absence:    "coalesce(response_status_code, '') = ''",
			whenAbsent: qbtypes.AlwaysPresent,
		},
		{
			name:       "a derived column the engine does not keep reads empty",
			key:        telemetrytypes.TelemetryFieldKey{Name: "http_url", FieldContext: telemetrytypes.FieldContextSpan},
			sql:        "''",
			presence:   "false",
			absence:    "true",
			whenAbsent: qbtypes.AlwaysPresent,
		},
		{
			name:       "the scope name is a column",
			key:        telemetrytypes.TelemetryFieldKey{Name: "scope.name", FieldContext: telemetrytypes.FieldContextScope, FieldDataType: telemetrytypes.FieldDataTypeString},
			sql:        "scope_name",
			presence:   "scope_name <> ''",
			absence:    "scope_name = ''",
			whenAbsent: qbtypes.AbsentIsSentinel,
		},
		{
			name:       "a scope attribute reads the scope map",
			key:        telemetrytypes.TelemetryFieldKey{Name: "library.lang", FieldContext: telemetrytypes.FieldContextScope, FieldDataType: telemetrytypes.FieldDataTypeString},
			sql:        "coalesce(scope_string['library.lang'], '')",
			presence:   "scope_string['library.lang'] IS NOT NULL",
			absence:    "scope_string['library.lang'] IS NULL",
			whenAbsent: qbtypes.AbsentIsSentinel,
		},
	}
	storage := NewDataFusionStorage()
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			read, err := storage.Read(context.Background(), qbtypes.QueryInfo{}, &c.key)
			require.NoError(t, err)
			assert.Equal(t, c.sql, read.SQL)
			assert.Equal(t, c.presence, read.Presence)
			assert.Equal(t, c.absence, read.Absence)
			assert.Equal(t, c.whenAbsent, read.WhenAbsent)
		})
	}
}

func TestDataFusionStorageSpanColumnPresence(t *testing.T) {
	cases := map[string][2]string{
		"has_error": {"has_error <> false", "has_error = false"},
		"timestamp": {"timestamp <> to_timestamp_nanos(0)", "timestamp = to_timestamp_nanos(0)"},
		"events":    {"cardinality(events) > 0", "cardinality(events) = 0"},
		"name":      {"name <> ''", "name = ''"},
	}
	storage := NewDataFusionStorage()
	for name, want := range cases {
		key := telemetrytypes.TelemetryFieldKey{Name: name, FieldContext: telemetrytypes.FieldContextSpan}
		read, err := storage.Read(context.Background(), qbtypes.QueryInfo{}, &key)
		require.NoError(t, err)
		assert.Equal(t, want, [2]string{read.Presence, read.Absence}, name)
	}
}

func TestDataFusionStorageRefusesWhatTheEngineDoesNotStore(t *testing.T) {
	storage := NewDataFusionStorage()
	for _, key := range []telemetrytypes.TelemetryFieldKey{
		{Name: "x", FieldContext: telemetrytypes.FieldContextAttribute, FieldDataType: telemetrytypes.FieldDataTypeArrayString},
		{Name: "no_such_column", FieldContext: telemetrytypes.FieldContextSpan},
	} {
		_, err := storage.Read(context.Background(), qbtypes.QueryInfo{}, &key)
		require.Error(t, err, key.Name)
	}
}

func TestDataFusionStorageCompile(t *testing.T) {
	startNs := uint64(1_747_947_419_000_000_000)
	cases := []struct {
		name     string
		key      telemetrytypes.TelemetryFieldKey
		operator qbtypes.FilterOperator
		value    any
		want     string
		args     []any
	}{
		{
			name:     "a root has no parent",
			key:      telemetrytypes.TelemetryFieldKey{Name: SpanSearchScopeRoot, FieldContext: telemetrytypes.FieldContextSpan},
			operator: qbtypes.FilterOperatorEqual,
			value:    true,
			want:     "parent_span_id IS NULL",
		},
		{
			name:     "an entry point has a remote parent or a top-level operation",
			key:      telemetrytypes.TelemetryFieldKey{Name: SpanSearchScopeEntryPoint, FieldContext: telemetrytypes.FieldContextSpan},
			operator: qbtypes.FilterOperatorEqual,
			value:    "true",
			want: "((parent_span_id IS NOT NULL AND is_remote = 'true') OR EXISTS (SELECT 1 FROM top_level_operations t " +
				"WHERE t.service_name = spans.service_name AND t.name = spans.name AND t.last_seen >= to_timestamp_nanos(1747947419000000000)))",
		},
		{
			name:     "a trace id compares as bytes",
			key:      telemetrytypes.TelemetryFieldKey{Name: "trace_id", FieldContext: telemetrytypes.FieldContextSpan},
			operator: qbtypes.FilterOperatorEqual,
			value:    "5B8EFFF798038103D269B633813FC60C",
			want:     "trace_id = decode(?, 'hex')",
			args:     []any{"5b8efff798038103d269b633813fc60c"},
		},
		{
			name:     "a list of span ids compares each as bytes",
			key:      telemetrytypes.TelemetryFieldKey{Name: "span_id", FieldContext: telemetrytypes.FieldContextSpan},
			operator: qbtypes.FilterOperatorIn,
			value:    []any{"00f067aa0ba902b7", "00f067aa0ba902b8"},
			want:     "(span_id = decode(?, 'hex') OR span_id = decode(?, 'hex'))",
			args:     []any{"00f067aa0ba902b7", "00f067aa0ba902b8"},
		},
	}
	storage := NewDataFusionStorage()
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sb := sqlbuilder.NewSelectBuilder()
			field := &telemetrytypes.LogicalField{Name: c.key.Name, Members: []*telemetrytypes.TelemetryFieldKey{&c.key}}
			compiled, err := storage.Compile(context.Background(), qbtypes.QueryInfo{StartNs: startNs}, field, c.operator, c.value, sb)
			require.NoError(t, err)
			sql, args := sb.Args.CompileWithFlavor(compiled.Condition, sqlbuilder.ClickHouse)
			assert.Equal(t, c.want, sql)
			assert.Equal(t, c.args, args)
		})
	}
}

func TestDataFusionStorageRefusesAnIdThatIsNotHex(t *testing.T) {
	storage := NewDataFusionStorage()
	key := telemetrytypes.TelemetryFieldKey{Name: "trace_id", FieldContext: telemetrytypes.FieldContextSpan}
	field := &telemetrytypes.LogicalField{Name: key.Name, Members: []*telemetrytypes.TelemetryFieldKey{&key}}
	for _, value := range []any{"zz", "abc", 7} {
		_, err := storage.Compile(context.Background(), qbtypes.QueryInfo{}, field, qbtypes.FilterOperatorEqual, value, sqlbuilder.NewSelectBuilder())
		require.Error(t, err, value)
	}
}
