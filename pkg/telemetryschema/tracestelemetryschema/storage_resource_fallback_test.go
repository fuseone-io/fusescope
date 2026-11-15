package tracestelemetryschema

import (
	"context"
	"testing"
	"time"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The resource JSON column cannot hold a value at a path another key extends: a span with
// deployment.environment and deployment.environment.name keeps the shorter key only in
// resources_string (fuseone-io/fusescope#406). Past the JSON column's release, a resource key
// still reads the map where the JSON path is NULL, as a window across the release does.
func TestResourceKeyAfterTheJSONReleaseFallsBackToTheMap(t *testing.T) {
	ctx := context.Background()
	release := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	after := qbtypes.QueryInfo{
		StartNs: uint64(time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC).UnixNano()),
		EndNs:   uint64(time.Date(2025, 7, 1, 0, 0, 0, 0, time.UTC).UnixNano()),
	}
	across := qbtypes.QueryInfo{
		StartNs: uint64(time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC).UnixNano()),
		EndNs:   after.EndNs,
	}

	testCases := []struct {
		name string
		key  telemetrytypes.TelemetryFieldKey
		sql  string
	}{
		{
			name: "map key",
			key:  telemetrytypes.TelemetryFieldKey{Name: "deployment.environment", FieldContext: telemetrytypes.FieldContextResource, FieldDataType: telemetrytypes.FieldDataTypeString},
			sql:  "multiIf(resource.`deployment.environment` IS NOT NULL, resource.`deployment.environment`::String, mapContains(resources_string, 'deployment.environment'), resources_string['deployment.environment'], NULL)",
		},
		{
			name: "materialized key",
			key:  telemetrytypes.TelemetryFieldKey{Name: "deployment.environment", FieldContext: telemetrytypes.FieldContextResource, FieldDataType: telemetrytypes.FieldDataTypeString, Materialized: true},
			sql:  "multiIf(resource.`deployment.environment` IS NOT NULL, resource.`deployment.environment`::String, `resource_string_deployment$$environment_exists` = true, `resource_string_deployment$$environment`, NULL)",
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.key.Evolutions = MockEvolutionData(release)
			read, err := NewStorage().Read(ctx, after, &tc.key)
			require.NoError(t, err)
			assert.Equal(t, qbtypes.Read{
				SQL:        tc.sql,
				Presence:   tc.sql + " IS NOT NULL",
				Absence:    tc.sql + " IS NULL",
				WhenAbsent: qbtypes.AbsentIsNull,
			}, read)

			straddling, err := NewStorage().Read(ctx, across, &tc.key)
			require.NoError(t, err)
			assert.Equal(t, straddling, read, "reads as a window across the release")
		})
	}
}
