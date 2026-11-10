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
// top of a service since start, latest first: the compacted top_level_operations together with
// the spans still uncompacted, by the same rule, a span without a parent or with a remote one.
// No services lists every service.
func DataFusionTopLevelOperations(start time.Time, services []string) (string, error) {
	since := datafusionsql.Int(start.UnixNano())
	byService := " AND service_name IS NOT NULL"
	if len(services) > 0 {
		literals := make([]string, len(services))
		for i, service := range services {
			literal, err := datafusionsql.String(service)
			if err != nil {
				return "", err
			}
			literals[i] = literal
		}
		byService = " AND service_name IN (" + strings.Join(literals, ", ") + ")"
	}
	compacted := "SELECT name, service_name, last_seen AS seen FROM top_level_operations WHERE last_seen >= to_timestamp_nanos(" + since + ")"
	if len(services) > 0 {
		compacted += byService
	}
	hot := "SELECT CAST(name AS VARCHAR) AS name, CAST(service_name AS VARCHAR) AS service_name, timestamp AS seen FROM spans " +
		"WHERE timestamp >= to_timestamp_nanos(" + since + ")" + byService + " AND (parent_span_id IS NULL OR is_remote = 'true')"
	return fmt.Sprintf("SELECT name, service_name, max(seen) AS ts FROM (%s UNION ALL %s) AS operations GROUP BY name, service_name ORDER BY ts DESC LIMIT %d",
		compacted, hot, TopLevelOperationsLimit), nil
}
