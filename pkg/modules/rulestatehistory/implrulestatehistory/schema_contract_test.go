package implrulestatehistory

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema/chschematest"
)

func TestSchemaContract(t *testing.T) {
	chschematest.AssertTable(t, "signoz_analytics", "rule_state_history_v0", ruleStateHistoryColumns)
}
