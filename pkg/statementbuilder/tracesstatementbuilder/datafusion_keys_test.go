package tracesstatementbuilder

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// keysOnly resolves keys and nothing else, as the engine's key store does.
type keysOnly struct {
	keys  map[string][]*telemetrytypes.TelemetryFieldKey
	asked []string
}

func (k *keysOnly) GetKeysMulti(_ context.Context, _ valuer.UUID, selectors []*telemetrytypes.FieldKeySelector) (map[string][]*telemetrytypes.TelemetryFieldKey, bool, error) {
	for _, s := range selectors {
		k.asked = append(k.asked, s.Name)
	}
	return k.keys, true, nil
}

func TestTheEngineBuilderNeedsOnlyAKeyResolver(t *testing.T) {
	keys := &keysOnly{keys: map[string][]*telemetrytypes.TelemetryFieldKey{
		"http.route": {{Name: "http.route", Signal: telemetrytypes.SignalTraces, FieldContext: telemetrytypes.FieldContextAttribute, FieldDataType: telemetrytypes.FieldDataTypeString}},
	}}
	builder := NewEngineTraceQueryStatementBuilder(instrumentationtest.New().ToProviderSettings(), keys, flaggertest.New(t))
	query := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		Signal:       telemetrytypes.SignalTraces,
		Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}},
		Filter:       &qbtypes.Filter{Expression: "http.route = '/cart'"},
	}
	stmt, err := builder.Build(context.Background(), valuer.GenerateUUID(), 1747947419000, 1747983448000, qbtypes.RequestTypeScalar, query, nil)
	require.NoError(t, err)
	assert.Contains(t, stmt.Query, "http_route", "the promoted column the resolved key maps to")
	assert.Contains(t, keys.asked, "http.route")
}
