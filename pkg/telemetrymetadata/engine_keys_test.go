package telemetrymetadata

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type keyRow struct{ key, source, kind string }

type keysCall struct {
	Signal string `json:"signal"`
	Prefix string `json:"prefix"`
	Limit  int    `json:"limit"`
	tenant valuer.UUID
}

// keysEngine answers metadata.keys from rows, as the engine's attribute_keys table would: the keys
// starting with the prefix, up to the limit. Any ClickHouse call fails the test.
type keysEngine struct {
	telemetrystore.TelemetryStore
	t        *testing.T
	rows     []keyRow
	warnings []string
	err      error
	calls    []keysCall
}

func (e *keysEngine) ClickhouseDB() clickhouse.Conn {
	e.t.Fatal("the engine key store reached ClickHouse")
	return nil
}

func (e *keysEngine) Do(ctx context.Context, action string, body []byte) (telemetrystore.Rows, error) {
	require.Equal(e.t, "metadata.keys", action)
	var call keysCall
	dec := json.NewDecoder(strings.NewReader(string(body)))
	dec.DisallowUnknownFields()
	require.NoError(e.t, dec.Decode(&call))
	identity, err := telemetrystore.IdentityFromContext(ctx)
	require.NoError(e.t, err)
	call.tenant = identity.Tenant
	e.calls = append(e.calls, call)
	if e.err != nil {
		return nil, e.err
	}
	var out [][3]string
	for _, r := range e.rows {
		if strings.HasPrefix(r.key, call.Prefix) && len(out) < call.Limit {
			out = append(out, [3]string{r.key, r.source, r.kind})
		}
	}
	return &keyRows{rows: out, warnings: e.warnings}, nil
}

type keyRows struct {
	rows     [][3]string
	at       int
	warnings []string
}

type stringColumn string

func (c stringColumn) Name() string           { return string(c) }
func (stringColumn) DatabaseTypeName() string { return "Utf8" }
func (stringColumn) ScanType() reflect.Type   { return reflect.TypeFor[string]() }
func (stringColumn) Nullable() bool           { return false }

// keyColumns are the engine's columns in its order, with count among them as the table has it.
var keyColumns = []string{"key", "source", "type", "count"}

func (r *keyRows) Columns() []string { return keyColumns }
func (r *keyRows) ColumnTypes() []telemetrystore.ColumnType {
	out := make([]telemetrystore.ColumnType, len(keyColumns))
	for i, name := range keyColumns {
		out[i] = stringColumn(name)
	}
	return out
}
func (r *keyRows) Next() bool { r.at++; return r.at <= len(r.rows) }
func (r *keyRows) Scan(dest ...any) error {
	row := r.rows[r.at-1]
	values := []string{row[0], row[1], row[2], "7"}
	for i, d := range dest {
		*(d.(*string)) = values[i]
	}
	return nil
}
func (r *keyRows) Err() error         { return nil }
func (r *keyRows) Close() error       { return nil }
func (r *keyRows) Warnings() []string { return r.warnings }

var org = valuer.GenerateUUID()

func caller() context.Context { return telemetrystore.WithService(context.Background(), "parity") }

func resolve(t *testing.T, engine *keysEngine, selectors ...*telemetrytypes.FieldKeySelector) (map[string][]*telemetrytypes.TelemetryFieldKey, bool) {
	t.Helper()
	engine.t = t
	keys, complete, err := NewEngineKeyStore(engine).GetKeysMulti(caller(), org, selectors)
	require.NoError(t, err)
	return keys, complete
}

func exact(name string) *telemetrytypes.FieldKeySelector {
	return &telemetrytypes.FieldKeySelector{Signal: telemetrytypes.SignalTraces, Name: name, SelectorMatchType: telemetrytypes.FieldSelectorMatchTypeExact}
}

func attribute(name string, ctx telemetrytypes.FieldContext, dt telemetrytypes.FieldDataType) *telemetrytypes.TelemetryFieldKey {
	return &telemetrytypes.TelemetryFieldKey{Name: name, Signal: telemetrytypes.SignalTraces, FieldContext: ctx, FieldDataType: dt}
}

func TestAnExactSelectorReadsTheEngineKeysOfItsName(t *testing.T) {
	engine := &keysEngine{rows: []keyRow{
		{"http.route", "span", "string"},
		{"http.route.extra", "span", "string"},
		{"http.route", "resource", "string"},
	}}
	keys, complete := resolve(t, engine, exact("http.route"))
	assert.True(t, complete)
	assert.ElementsMatch(t, []*telemetrytypes.TelemetryFieldKey{
		attribute("http.route", telemetrytypes.FieldContextAttribute, telemetrytypes.FieldDataTypeString),
		attribute("http.route", telemetrytypes.FieldContextResource, telemetrytypes.FieldDataTypeString),
	}, keys["http.route"])
	assert.NotContains(t, keys, "http.route.extra", "a prefix match is not an exact one")
	require.Len(t, engine.calls, 1)
	assert.Equal(t, keysCall{Signal: "traces", Prefix: "", Limit: 1001, tenant: org}, engine.calls[0], "the whole listing, one more than the limit, to tell a truncated list")
}

func TestASelectorNarrowsByContextAndType(t *testing.T) {
	engine := &keysEngine{rows: []keyRow{
		{"retries", "span", "number"},
		{"retries", "resource", "string"},
		{"retries", "scope", "bool"},
	}}
	byContext := exact("retries")
	byContext.FieldContext = telemetrytypes.FieldContextScope
	keys, _ := resolve(t, engine, byContext)
	assert.Equal(t, []*telemetrytypes.TelemetryFieldKey{attribute("retries", telemetrytypes.FieldContextScope, telemetrytypes.FieldDataTypeBool)}, keys["retries"])

	byType := exact("retries")
	byType.FieldDataType = telemetrytypes.FieldDataTypeInt64
	keys, _ = resolve(t, &keysEngine{rows: engine.rows}, byType)
	assert.Equal(t, []*telemetrytypes.TelemetryFieldKey{attribute("retries", telemetrytypes.FieldContextAttribute, telemetrytypes.FieldDataTypeFloat64)}, keys["retries"], "an engine number is a float64 key, as ClickHouse's keys table has it")
}

func TestIntrinsicFieldsComeFromTheStaticSchema(t *testing.T) {
	keys, _ := resolve(t, &keysEngine{}, exact("duration_nano"))
	require.NotEmpty(t, keys["duration_nano"], "no engine row is needed for a column of the spans table")
	assert.Equal(t, telemetrytypes.FieldContextSpan, keys["duration_nano"][0].FieldContext)
}

func TestAFuzzySelectorMatchesASubstringOfAnyKey(t *testing.T) {
	engine := &keysEngine{rows: []keyRow{{"http.route", "span", "string"}, {"db.name", "span", "string"}}}
	fuzzy := &telemetrytypes.FieldKeySelector{Signal: telemetrytypes.SignalTraces, Name: "ROUTE", SelectorMatchType: telemetrytypes.FieldSelectorMatchTypeFuzzy}
	keys, _ := resolve(t, engine, fuzzy)
	assert.Contains(t, keys, "http.route")
	assert.NotContains(t, keys, "db.name")
	require.Len(t, engine.calls, 1)
	assert.Empty(t, engine.calls[0].Prefix, "a substring needs the whole listing")
}

func TestOneListingResolvesEverySelector(t *testing.T) {
	engine := &keysEngine{rows: []keyRow{{"http.route", "span", "string"}, {"db.name", "span", "string"}, {"retries", "span", "number"}}}
	fuzzy := func(name string) *telemetrytypes.FieldKeySelector {
		return &telemetrytypes.FieldKeySelector{Signal: telemetrytypes.SignalTraces, Name: name, SelectorMatchType: telemetrytypes.FieldSelectorMatchTypeFuzzy}
	}
	keys, complete := resolve(t, engine, exact("http.route"), fuzzy("name"), exact("db.name"), exact("http.route"), exact("absent"))
	assert.True(t, complete)
	assert.Contains(t, keys, "http.route")
	assert.Contains(t, keys, "db.name")
	assert.NotContains(t, keys, "retries", "no selector matches it")
	assert.NotContains(t, keys, "absent")
	assert.Equal(t, []keysCall{{Signal: "traces", Prefix: "", Limit: 1001, tenant: org}}, engine.calls)
}

// A key past the whole listing's limit is found by its own prefix, never read as absent.
func TestATruncatedListingFallsBackToEachPrefix(t *testing.T) {
	var rows []keyRow
	for i := range 1001 {
		rows = append(rows, keyRow{fmt.Sprintf("bulk.%04d", i), "span", "string"})
	}
	rows = append(rows, keyRow{"rare", "span", "string"})
	engine := &keysEngine{rows: rows}
	fuzzy := &telemetrytypes.FieldKeySelector{Signal: telemetrytypes.SignalTraces, Name: "bulk", SelectorMatchType: telemetrytypes.FieldSelectorMatchTypeFuzzy}
	keys, complete := resolve(t, engine, exact("rare"), exact("bulk.0001"), fuzzy)
	assert.Equal(t, []*telemetrytypes.TelemetryFieldKey{attribute("rare", telemetrytypes.FieldContextAttribute, telemetrytypes.FieldDataTypeString)}, keys["rare"])
	assert.Contains(t, keys, "bulk.0001")
	assert.False(t, complete, "the fuzzy selector's listing is truncated, as it was alone")
	prefixes := []string{}
	for _, call := range engine.calls {
		prefixes = append(prefixes, call.Prefix)
	}
	assert.Equal(t, []string{"", "bulk.0001", "rare"}, prefixes, "the whole listing serves the fuzzy selector; each exact one lists its own prefix")
}

func TestATruncatedListingIsIncomplete(t *testing.T) {
	var rows []keyRow
	for i := 0; i < 3; i++ {
		rows = append(rows, keyRow{"k", []string{"span", "resource", "scope"}[i], "string"})
	}
	selector := exact("k")
	selector.Limit = 2
	engine := &keysEngine{rows: rows}
	keys, complete := resolve(t, engine, selector)
	assert.False(t, complete)
	assert.Len(t, keys["k"], 2, "only the limit is kept")
	assert.Len(t, engine.calls, 2, "the whole listing, then the prefix's own")
}

// A selector's own limit truncates its keys as its own listing would, though the whole listing,
// asked for a larger limit, holds them all.
func TestASelectorsLimitTruncatesWithinTheWholeListing(t *testing.T) {
	var rows []keyRow
	for _, source := range []string{"span", "resource", "scope"} {
		rows = append(rows, keyRow{"k", source, "string"})
	}
	selector := exact("k")
	selector.Limit = 2
	engine := &keysEngine{rows: rows}
	keys, complete := resolve(t, engine, selector, exact("other"))
	assert.False(t, complete)
	assert.Len(t, keys["k"], 2)
	assert.Len(t, engine.calls, 1)
}

func TestTheEngineKeyStoreFailsClosed(t *testing.T) {
	cases := map[string]*keysEngine{
		"engine error":   {err: errors.Newf(errors.TypeInternal, errors.CodeInternal, "unreachable")},
		"partial answer": {rows: []keyRow{{"k", "span", "string"}}, warnings: []string{"ingester_unavailable"}},
		"max_rows cut":   {rows: []keyRow{{"k", "span", "string"}}, warnings: []string{"max_rows 1 left keys out of the listing"}},
		"unknown source": {rows: []keyRow{{"k", "event", "string"}}},
		"unknown type":   {rows: []keyRow{{"k", "span", "map"}}},
	}
	for name, engine := range cases {
		engine.t = t
		_, _, err := NewEngineKeyStore(engine).GetKeysMulti(caller(), org, []*telemetrytypes.FieldKeySelector{exact("k")})
		assert.Error(t, err, name)
	}
	logs := &telemetrytypes.FieldKeySelector{Signal: telemetrytypes.SignalLogs, Name: "k"}
	_, _, err := NewEngineKeyStore(&keysEngine{t: t}).GetKeysMulti(caller(), org, []*telemetrytypes.FieldKeySelector{logs})
	assert.Error(t, err, "the engine key store serves the trace builder only")
}
