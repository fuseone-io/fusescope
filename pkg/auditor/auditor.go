package auditor

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/audittypes"
)

var (
	ErrCodeAuditExportFailed = errors.MustNewCode("audit_export_failed")
)

type Auditor interface {
	factory.ServiceWithHealthy

	// Audit emits an audit event. It is fire-and-forget: callers never block on audit outcomes.
	Audit(ctx context.Context, event audittypes.AuditEvent)
}
