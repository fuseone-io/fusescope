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
	assert.Equal(t, "SELECT name, service_name, max(seen) AS ts FROM ("+
		"SELECT name, service_name, last_seen AS seen FROM top_level_operations "+
		"WHERE last_seen >= to_timestamp_nanos(1747947419000000000) AND service_name IN ('frontend', 'o''k') "+
		"UNION ALL "+
		"SELECT CAST(name AS VARCHAR) AS name, CAST(service_name AS VARCHAR) AS service_name, timestamp AS seen FROM spans "+
		"WHERE timestamp >= to_timestamp_nanos(1747947419000000000) AND service_name IN ('frontend', 'o''k') "+
		"AND (parent_span_id IS NULL OR is_remote = 'true')"+
		") AS operations GROUP BY name, service_name ORDER BY ts DESC LIMIT 5000", sql)

	every, err := DataFusionTopLevelOperations(start, nil)
	require.NoError(t, err)
	assert.NotContains(t, every, "IN (")
	assert.Contains(t, every, "service_name IS NOT NULL", "a span without a service is no operation of one")

	_, err = DataFusionTopLevelOperations(start, []string{"a\x00b"})
	require.Error(t, err)
}
