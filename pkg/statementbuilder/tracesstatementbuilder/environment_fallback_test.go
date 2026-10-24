package tracesstatementbuilder

import (
	"context"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/flagger/flaggertest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes/telemetrytypestest"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The AI Observability Overview filters environments with this expression so
// deployment.environment.name wins and deployment.environment is the fallback.
func TestStatementBuilderEnvironmentNameWithLegacyFallback(t *testing.T) {
	releaseTime := time.Date(2025, 5, 22, 22, 0, 0, 0, time.UTC)
	expression := "service.name EXISTS AND (deployment.environment.name IN $environment OR (deployment.environment.name NOT EXISTS AND deployment.environment IN $environment))"

	testCases := []struct {
		name        string
		unknownKeys []string
		environment qbtypes.VariableItem
		contains    []string
		notContains []string
	}{
		{
			name:        "BothSpellingsKnown_ValuesSelected",
			environment: qbtypes.VariableItem{Type: qbtypes.DynamicVariableType, Value: []any{"prod"}},
			contains: []string{
				"simpleJSONExtractString(labels, 'deployment.environment.name') = ?",
				"simpleJSONHas(labels, 'deployment.environment.name') <> ?",
				"simpleJSONExtractString(labels, 'deployment.environment') = ?",
			},
		},
		{
			name:        "OnlyLegacySpellingKnown_ValuesSelected",
			unknownKeys: []string{"deployment.environment.name"},
			environment: qbtypes.VariableItem{Type: qbtypes.DynamicVariableType, Value: []any{"staging"}},
			contains:    []string{"resources_string['deployment.environment'], NULL) = ?"},
		},
		{
			name:        "BothSpellingsKnown_AllSelected",
			environment: qbtypes.VariableItem{Type: qbtypes.DynamicVariableType, Value: "__all__"},
			notContains: []string{"deployment.environment"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fl := flaggertest.New(t)
			storage := tracestelemetryschema.NewStorage()
			metadataStore := telemetrytypestest.NewMockMetadataStore()
			metadataStore.KeysMap = tracestelemetryschema.BuildCompleteFieldKeyMap(releaseTime)
			for _, name := range testCase.unknownKeys {
				delete(metadataStore.KeysMap, name)
			}
			aggExprRewriter := querybuilder.NewAggExprRewriter(instrumentationtest.New().ToProviderSettings(), nil, storage, fl, telemetrytypes.SignalTraces)
			statementBuilder := NewTraceQueryStatementBuilder(instrumentationtest.New().ToProviderSettings(), metadataStore, storage, aggExprRewriter, nil, fl, false, 100000)

			query := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
				Signal:       telemetrytypes.SignalTraces,
				Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}},
				Filter:       &qbtypes.Filter{Expression: expression},
			}
			variables := map[string]qbtypes.VariableItem{"environment": testCase.environment}

			statement, err := statementBuilder.Build(context.Background(), valuer.UUID{}, 1747947419000, 1747983448000, qbtypes.RequestTypeScalar, query, variables)
			require.NoError(t, err)
			for _, fragment := range testCase.contains {
				assert.Contains(t, statement.Query, fragment)
			}
			for _, fragment := range testCase.notContains {
				assert.NotContains(t, statement.Query, fragment)
			}
		})
	}
}
