package implrumapplication

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
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

func TestNewSessionsQueryUserFilter(t *testing.T) {
	scope := telemetryScope{applicationID: "0193f2c4-7d1e-7a40-9b2f-5c8e1d3a6b70", start: time.Unix(1000, 0), end: time.Unix(2000, 0)}

	testCases := []struct {
		name     string
		filter   rumtypes.SessionFilter
		contains []string
		excludes []string
	}{
		{name: "NoUser_NoUserCondition", filter: rumtypes.SessionFilter{}, excludes: []string{"user.id", "user.hash"}},
		{name: "User_MatchesIDOrLegacyHash", filter: rumtypes.SessionFilter{UserID: "u-42"}, contains: []string{"(attributes_string['user.id'] = ? OR attributes_string['user.hash'] = ?)"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			sql, _ := newSessionsQuery(scope, testCase.filter, rumtypes.Page{Limit: 10}).Build()
			for _, expected := range testCase.contains {
				assert.Contains(t, sql, expected)
			}
			for _, unexpected := range testCase.excludes {
				assert.NotContains(t, sql, unexpected)
			}
		})
	}
}

func TestSessionUserExpression(t *testing.T) {
	sql, _ := newSessionAttributesQuery(telemetryScope{start: time.Unix(1000, 0), end: time.Unix(2000, 0)}, []string{"s1"}).Build()
	assert.Contains(t, sql, "if(attributes_string['user.id'] != '', attributes_string['user.id'], attributes_string['user.hash'])")
}
