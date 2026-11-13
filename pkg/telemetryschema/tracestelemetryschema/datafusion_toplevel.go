package tracestelemetryschema

import (
	"fmt"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/datafusionsql"
)

// TopLevelOperationsLimit bounds the operations listed across every service.
const TopLevelOperationsLimit = 5000

// DataFusionTopLevelOperations lists, on fusescope-engine, each operation of services seen at the
// top of a service since start, latest first. The engine's top_level_operations is complete: its
// compacted passes and its recent spans, resolved by the parent's service as ClickHouse resolves
// them. No services lists every service.
func DataFusionTopLevelOperations(start time.Time, services []string) (string, error) {
	sql := "SELECT name, service_name, max(last_seen) AS ts FROM top_level_operations WHERE last_seen >= to_timestamp_nanos(" +
		datafusionsql.Int(start.UnixNano()) + ")"
	if len(services) > 0 {
		literals := make([]string, len(services))
		for i, service := range services {
			literal, err := datafusionsql.String(service)
			if err != nil {
				return "", err
			}
			literals[i] = literal
		}
		sql += " AND service_name IN (" + strings.Join(literals, ", ") + ")"
	}
	return fmt.Sprintf("%s GROUP BY name, service_name ORDER BY ts DESC LIMIT %d", sql, TopLevelOperationsLimit), nil
}
