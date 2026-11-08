package telemetrystore

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var (
	ErrCodeTenantMissing  = errors.MustNewCode("telemetrystore_tenant_missing")
	ErrCodeTenantMismatch = errors.MustNewCode("telemetrystore_tenant_mismatch")
	ErrCodeSubjectMissing = errors.MustNewCode("telemetrystore_subject_missing")
)

// Identity is who a query runs for: the engine tenant, which is the organisation's id, and the
// subject acting, carried in the token the engine verifies.
type Identity struct {
	Tenant  valuer.UUID
	Subject string
}

// WithTenant names the organisation a query reads. Without it, a provider that scopes by tenant
// refuses the query before any request leaves the process.
func WithTenant(ctx context.Context, orgID valuer.UUID) context.Context {
	return context.WithValue(ctx, tenantKey{}, orgID)
}

// WithService names a background routine as the subject acting, for work no user started. It
// takes precedence over the claims in ctx.
func WithService(ctx context.Context, name string) context.Context {
	return context.WithValue(ctx, serviceKey{}, name)
}

// IdentityFromContext returns the tenant and subject of ctx. The subject is the service named by
// WithService, or else the user or service account of the claims; there is no default. Claims of
// another organisation than the tenant are refused.
func IdentityFromContext(ctx context.Context) (Identity, error) {
	tenant, ok := ctx.Value(tenantKey{}).(valuer.UUID)
	if !ok || tenant.IsZero() {
		return Identity{}, errors.NewInvalidInputf(ErrCodeTenantMissing, "telemetry query without a tenant")
	}
	claims, claimsErr := authtypes.ClaimsFromContext(ctx)
	if claimsErr == nil && claims.OrgID != "" && claims.OrgID != tenant.StringValue() {
		return Identity{}, errors.NewForbiddenf(ErrCodeTenantMismatch, "telemetry query for another organisation than the caller's")
	}
	if service, ok := ctx.Value(serviceKey{}).(string); ok {
		if service == "" {
			return Identity{}, errors.NewInvalidInputf(ErrCodeSubjectMissing, "telemetry query for an unnamed service")
		}
		return Identity{Tenant: tenant, Subject: "service:" + service}, nil
	}
	switch {
	case claimsErr != nil:
	case claims.UserID != "":
		return Identity{Tenant: tenant, Subject: "user:" + claims.UserID}, nil
	case claims.ServiceAccountID != "":
		return Identity{Tenant: tenant, Subject: "service-account:" + claims.ServiceAccountID}, nil
	}
	return Identity{}, errors.NewInvalidInputf(ErrCodeSubjectMissing, "telemetry query without a user or a named service")
}

type tenantKey struct{}

type serviceKey struct{}
