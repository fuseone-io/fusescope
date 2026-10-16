package implinframonitoring

import (
	"context"
	"fmt"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/metricstelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func (m *module) Collect(ctx context.Context, _ valuer.UUID) (map[string]any, error) {
	stats := make(map[string]any)

	metadataTable := fmt.Sprintf("%s.%s", metricstelemetryschema.DBName, metricstelemetryschema.AttributesMetadataTableName)
	var (
		systemMetricCount uint64
		k8sMetricCount    uint64
	)
	query := fmt.Sprintf(
		"SELECT (SELECT count() FROM (SELECT 1 FROM %s WHERE metric_name LIKE 'system.%%' LIMIT 1)), (SELECT count() FROM (SELECT 1 FROM %s WHERE metric_name LIKE 'k8s.%%' LIMIT 1))",
		metadataTable, metadataTable,
	)
	if err := m.telemetryStore.ClickhouseDB().QueryRow(ctx, query).Scan(&systemMetricCount, &k8sMetricCount); err == nil {
		stats["telemetry.metrics.system.exists"] = systemMetricCount > 0
		stats["telemetry.metrics.k8s.exists"] = k8sMetricCount > 0
	} else {
		m.logger.DebugContext(ctx, "failed to collect metrics namespace existence stats", errors.Attr(err))
	}

	return stats, nil
}
