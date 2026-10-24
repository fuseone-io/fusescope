package quickfiltertypes

import (
	"encoding/json"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewDefaultQuickFilter_AIObservabilityEnvironment(t *testing.T) {
	filters, err := NewDefaultQuickFilter(valuer.GenerateUUID())
	require.NoError(t, err)

	var names []string
	for _, filter := range filters {
		if filter.Source != SourceAiObservability {
			continue
		}
		var keys []telemetrytypes.TelemetryFieldKey
		require.NoError(t, json.Unmarshal([]byte(filter.Filter), &keys))
		for _, key := range keys {
			names = append(names, key.Name)
		}
	}
	require.GreaterOrEqual(t, len(names), 2)
	assert.Equal(t, []string{"deployment.environment.name", "deployment.environment"}, names[:2])
}
