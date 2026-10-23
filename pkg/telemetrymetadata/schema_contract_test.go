package telemetrymetadata

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema/chschematest"
)

func TestSchemaContract(t *testing.T) {
	chschematest.AssertTable(t, "signoz_metadata", "attributes_metadata", attributeMetadataColumns)
}
