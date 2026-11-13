package tracestelemetryschema

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDataFusionTopLevelOperations(t *testing.T) {
	start := time.Unix(0, 1_747_947_419_000_000_000)
	sql, err := DataFusionTopLevelOperations(start, []string{"frontend", "o'k"})
	require.NoError(t, err)
	assert.Equal(t, "SELECT name, service_name, max(last_seen) AS ts FROM top_level_operations "+
		"WHERE last_seen >= to_timestamp_nanos(1747947419000000000) AND service_name IN ('frontend', 'o''k') "+
		"GROUP BY name, service_name ORDER BY ts DESC LIMIT 5000", sql, "the engine's table is complete: no span is read here")

	every, err := DataFusionTopLevelOperations(start, nil)
	require.NoError(t, err)
	assert.NotContains(t, every, "IN (")
	assert.NotContains(t, every, "spans")

	_, err = DataFusionTopLevelOperations(start, []string{"a\x00b"})
	require.Error(t, err)
}
