package resourcefilter

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema/chschematest"
)

func TestSchemaContract(t *testing.T) {
	testCases := []struct {
		name     string
		database string
		table    string
	}{
		{name: "Logs", database: "signoz_logs", table: "logs_v2_resource"},
		{name: "Traces", database: "signoz_traces", table: "traces_v3_resource"},
		{name: "Audit", database: "signoz_audit", table: "logs_resource"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			chschematest.AssertTable(t, testCase.database, testCase.table, resourceColumns)
		})
	}
}
