package implrumapplication

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewSessionCountQuery(t *testing.T) {
	scope := telemetryScope{applicationID: "0193f2c4-7d1e-7a40-9b2f-5c8e1d3a6b70", start: time.Unix(1000, 0), end: time.Unix(2000, 0)}
	sql, args := newSessionCountQuery(scope).Build()

	testCases := []struct {
		name     string
		contains string
	}{
		{name: "CountsDistinctSessions", contains: "SELECT uniq(session) FROM ("},
		{name: "ReadsSpans", contains: "FROM `signoz_traces`.`distributed_signoz_index_v3`"},
		{name: "ReadsLogs_ErrorOnlySessionsCount", contains: "UNION ALL"},
		{name: "ReadsLogsTable", contains: "FROM `signoz_logs`.`distributed_logs_v2`"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Contains(t, sql, testCase.contains)
		})
	}
	assert.Len(t, args, 18)
}
