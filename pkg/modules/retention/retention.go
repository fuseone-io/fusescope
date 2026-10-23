package retention

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Getter resolves retention data and expressions for read paths.
type Getter interface {
	// GetRetentionPolicySegments returns retention policy segments active over a half-open meter window.
	GetRetentionPolicySegments(ctx context.Context, orgID valuer.UUID, dbName string, tableName string, fallbackDefaultDays int, startMs int64, endMs int64) ([]*retentiontypes.RetentionPolicySegment, error)
}

// TTLSetter is the TTL path of the retention settings page.
type TTLSetter interface {
	// HasTTLSetting reports whether a retention was ever requested for the signal by any
	// organization, whatever its status: the ClickHouse tables are shared by all of them.
	HasTTLSetting(ctx context.Context, ttlType string) (bool, error)

	// SetDefaultTTL sets the signal's retention to days the way the settings page does. The
	// ClickHouse TTL change applies to new parts only; existing parts expire as they merge.
	SetDefaultTTL(ctx context.Context, orgID valuer.UUID, ttlType string, days int) error
}
