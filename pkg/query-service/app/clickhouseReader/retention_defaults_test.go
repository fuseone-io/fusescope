package clickhouseReader

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

func TestTTLStatusTableName(t *testing.T) {
	reader := &ClickHouseReader{logsDB: "signoz_logs", logsLocalTableV2: "logs_v2", TraceDB: "signoz_traces", traceTableName: "distributed_signoz_index_v3"}

	testCases := []struct {
		name    string
		ttlType string
		want    string
		wantErr bool
	}{
		{name: "Logs_LogsV2", ttlType: retentiontypes.LogsTTL, want: "signoz_logs.logs_v2"},
		{name: "Traces_LocalIndexV3", ttlType: retentiontypes.TraceTTL, want: "signoz_traces.signoz_index_v3"},
		{name: "Metrics_LocalSamplesV4", ttlType: retentiontypes.MetricsTTL, want: "signoz_metrics.samples_v4"},
		{name: "Unknown_Error", ttlType: "profiles", wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			tableName, err := reader.ttlStatusTableName(testCase.ttlType)
			if testCase.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.want, tableName)
		})
	}
}
