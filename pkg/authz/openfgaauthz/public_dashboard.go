package openfgaauthz

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func (p *provider) createAnonymousAccess(ctx context.Context, orgID valuer.UUID) error {
	subject := authtypes.MustNewSubject(coretypes.NewResourceAnonymous(), coretypes.AnonymousUser.StringValue(), orgID, nil)
	if err := p.Grant(ctx, orgID, []string{authtypes.SigNozAnonymousRoleName}, subject); err != nil {
		return err
	}
	groups := authtypes.NewTransactionGroupsFromTransactions(coretypes.ManagedRoleToTransactions[coretypes.SigNozAnonymousRoleName])
	tuples, err := authtypes.NewTuplesFromTransactionGroups(coretypes.SigNozAnonymousRoleName, orgID, groups)
	if err != nil {
		return err
	}
	return p.Write(ctx, tuples, nil)
}
