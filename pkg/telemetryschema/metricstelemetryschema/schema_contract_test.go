package metricstelemetryschema

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema/chschematest"
)

func TestSchemaContract(t *testing.T) {
	chschematest.AssertTable(t, "signoz_metrics", "time_series_v4", timeSeriesV4Columns)
}
