package logstelemetryschema

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema/chschematest"
)

func TestSchemaContract(t *testing.T) {
	chschematest.AssertTable(t, "signoz_logs", "logs_v2", logsV2Columns, chschema.JSONPathsIndexExpr(LogsV2BodyV2Column))
}
