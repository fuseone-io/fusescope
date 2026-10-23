package audittelemetryschema

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema/chschematest"
)

func TestSchemaContract(t *testing.T) {
	chschematest.AssertTable(t, "signoz_audit", "logs", auditLogColumns)
}
