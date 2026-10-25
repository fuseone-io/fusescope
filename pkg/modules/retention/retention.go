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

// BackstopSetter is the TTL path of the archive (ADR 0002 §5).
type BackstopSetter interface {
	// ApplyArchiveBackstop gives the TTL of the signal's tables a backstop of days, keeping
	// their move rules, and materializes it on existing parts. It returns once the mutations
	// are done on every replica. With resume, an earlier apply of the same days was
	// interrupted, so a MATERIALIZE TTL still pending is waited on instead of issuing another.
	ApplyArchiveBackstop(ctx context.Context, signal string, days int, resume bool) error
}
