package tracestelemetryschema

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema/chschematest"
)

func TestSchemaContract(t *testing.T) {
	chschematest.AssertTable(t, "signoz_traces", "signoz_index_v3", indexV3Columns)
}
