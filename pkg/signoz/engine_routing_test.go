package signoz

import (
	"context"
	"reflect"
	"testing"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// keysOnlyEngine answers metadata.keys and counts every touch of ClickHouse, which the engine
// dialect's builder must never make.
type keysOnlyEngine struct {
	telemetrystore.TelemetryStore
	err        error
	actions    []string
	clickhouse int
}

func (e *keysOnlyEngine) ClickhouseDB() clickhouse.Conn { e.clickhouse++; return nil }

func (e *keysOnlyEngine) Query(context.Context, string, ...any) (telemetrystore.Rows, error) {
	e.clickhouse++
	return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "a statement reached the store")
}

func (e *keysOnlyEngine) Do(_ context.Context, action string, _ []byte) (telemetrystore.Rows, error) {
	e.actions = append(e.actions, action)
	if e.err != nil {
		return nil, e.err
	}
	return &routeKey{}, nil
}

// routeKey is the engine's listing of one key, http.route, a string span attribute.
type routeKey struct{ at int }

type textColumn string

func (c textColumn) Name() string           { return string(c) }
func (textColumn) DatabaseTypeName() string { return "Utf8" }
func (textColumn) ScanType() reflect.Type   { return reflect.TypeFor[string]() }
func (textColumn) Nullable() bool           { return false }

func (*routeKey) Columns() []string { return []string{"key", "source", "type", "count"} }
func (*routeKey) ColumnTypes() []telemetrystore.ColumnType {
	return []telemetrystore.ColumnType{textColumn("key"), textColumn("source"), textColumn("type"), textColumn("count")}
}
func (r *routeKey) Next() bool { r.at++; return r.at == 1 }
func (*routeKey) Scan(dest ...any) error {
	for i, v := range []string{"http.route", "span", "string", "3"} {
		*(dest[i].(*string)) = v
	}
	return nil
}
func (*routeKey) Err() error         { return nil }
func (*routeKey) Close() error       { return nil }
func (*routeKey) Warnings() []string { return nil }

func routedBuild(t *testing.T, store *keysOnlyEngine) (*qbtypes.Statement, error) {
	t.Helper()
	config := Config{}
	config.TelemetryStore.Provider = "flight"
	routing := engineRouting(instrumentationtest.New().ToProviderSettings(), config, store, flaggertest.New(t))
	require.NotNil(t, routing)
	spec := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		Name: "A", Signal: telemetrytypes.SignalTraces,
		Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}},
		Filter:       &qbtypes.Filter{Expression: "http.route = '/cart'"},
	}
	ctx := telemetrystore.WithService(context.Background(), "test")
	return routing.TraceStmtBuilder.Build(ctx, valuer.GenerateUUID(), 1_000, 61_000, qbtypes.RequestTypeScalar, spec, nil)
}

func TestProductionResolvesTheEngineDialectsKeysFromTheEngine(t *testing.T) {
	store := &keysOnlyEngine{}
	stmt, err := routedBuild(t, store)
	require.NoError(t, err)
	assert.Contains(t, store.actions, "metadata.keys", "the keys come from the engine's metadata.keys")
	assert.Zero(t, store.clickhouse, "and never from ClickHouse")
	assert.Contains(t, stmt.Query, "http_route = '/cart'", "the engine dialect, the key on its promoted column")
}

func TestAFailedEngineKeyListingFailsTheRoutedBuild(t *testing.T) {
	store := &keysOnlyEngine{err: errors.Newf(errors.TypeInternal, errors.CodeInternal, "metadata.keys unavailable")}
	_, err := routedBuild(t, store)
	require.Error(t, err, "the caller's error, never a statement with keys of another source")
	assert.Equal(t, []string{"metadata.keys"}, store.actions)
	assert.Zero(t, store.clickhouse)
}
