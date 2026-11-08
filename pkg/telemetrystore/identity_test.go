package telemetrystore

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIdentityFromContext(t *testing.T) {
	org := valuer.MustNewUUID("0190f3a1-7b2c-7d4e-9f00-112233445566")
	otherOrg := valuer.MustNewUUID("0190f3a1-7b2c-7d4e-9f00-665544332211")
	user := authtypes.Claims{UserID: "0190f3a1-0000-7000-8000-00000000000a", OrgID: org.StringValue()}
	serviceAccount := authtypes.Claims{ServiceAccountID: "0190f3a1-0000-7000-8000-00000000000b", OrgID: org.StringValue()}

	testCases := []struct {
		name    string
		ctx     func() context.Context
		subject string
		code    errors.Code
	}{
		{
			name: "UserClaims_TenantGiven",
			ctx: func() context.Context {
				return WithTenant(authtypes.NewContextWithClaims(context.Background(), user), org)
			},
			subject: "user:0190f3a1-0000-7000-8000-00000000000a",
		},
		{
			name: "ServiceAccountClaims_TenantGiven",
			ctx: func() context.Context {
				return WithTenant(authtypes.NewContextWithClaims(context.Background(), serviceAccount), org)
			},
			subject: "service-account:0190f3a1-0000-7000-8000-00000000000b",
		},
		{
			name:    "ExplicitService_NoClaims",
			ctx:     func() context.Context { return WithService(WithTenant(context.Background(), org), "ruler") },
			subject: "service:ruler",
		},
		{
			name: "ExplicitService_OverClaims",
			ctx: func() context.Context {
				return WithService(WithTenant(authtypes.NewContextWithClaims(context.Background(), user), org), "ruler")
			},
			subject: "service:ruler",
		},
		{
			name: "NoTenant_Refused",
			ctx:  func() context.Context { return authtypes.NewContextWithClaims(context.Background(), user) },
			code: ErrCodeTenantMissing,
		},
		{
			name: "ZeroTenant_Refused",
			ctx: func() context.Context {
				return WithTenant(authtypes.NewContextWithClaims(context.Background(), user), valuer.UUID{})
			},
			code: ErrCodeTenantMissing,
		},
		{
			name: "NoIdentity_Refused",
			ctx:  func() context.Context { return WithTenant(context.Background(), org) },
			code: ErrCodeSubjectMissing,
		},
		{
			name: "EmptyService_Refused",
			ctx:  func() context.Context { return WithService(WithTenant(context.Background(), org), "") },
			code: ErrCodeSubjectMissing,
		},
		{
			name: "ClaimsOfAnotherOrg_Refused",
			ctx: func() context.Context {
				return WithTenant(authtypes.NewContextWithClaims(context.Background(), user), otherOrg)
			},
			code: ErrCodeTenantMismatch,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			identity, err := IdentityFromContext(testCase.ctx())
			if testCase.code != (errors.Code{}) {
				require.Error(t, err)
				assert.True(t, errors.Asc(err, testCase.code), "%v", err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.subject, identity.Subject)
			assert.NotEqual(t, valuer.UUID{}, identity.Tenant)
		})
	}
}
