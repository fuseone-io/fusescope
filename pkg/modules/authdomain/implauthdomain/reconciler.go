package implauthdomain

import (
	"context"
	"log/slog"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type reconciler struct {
	settings  factory.ScopedProviderSettings
	module    authdomain.Module
	orgGetter organization.Getter
	domains   []authdomain.ManagedDomain
}

func NewReconciler(providerSettings factory.ProviderSettings, module authdomain.Module, orgGetter organization.Getter, config authdomain.Config) (authdomain.Reconciler, error) {
	domains, err := config.ManagedDomains()
	if err != nil {
		return nil, err
	}

	return &reconciler{
		settings:  factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/authdomain/implauthdomain"),
		module:    module,
		orgGetter: orgGetter,
		domains:   domains,
	}, nil
}

// Reconcile assigns every declared domain to its organization and applies the
// result to each organization, so domains removed from the file are deleted too.
// A domain that cannot be placed is reported without blocking the others.
func (r *reconciler) Reconcile(ctx context.Context) error {
	orgs, err := r.orgGetter.ListByOwnedKeyRange(ctx)
	if err != nil {
		return err
	}

	if len(orgs) == 0 {
		return nil
	}

	desired := make(map[valuer.UUID][]*authtypes.PostableAuthDomain, len(orgs))
	var placementErrs []error
	for _, domain := range r.domains {
		org, err := targetOrg(domain, orgs)
		if err != nil {
			placementErrs = append(placementErrs, err)
			continue
		}

		desired[org.ID] = append(desired[org.ID], domain.Postable)
	}

	for _, org := range orgs {
		if err := r.module.ApplyManagedDomains(ctx, org.ID, desired[org.ID]); err != nil {
			placementErrs = append(placementErrs, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "authdomain: couldn't apply managed domains to organization %s", org.ID.StringValue()))
		}
	}

	if len(placementErrs) > 0 {
		return errors.Join(placementErrs...)
	}

	r.settings.Logger().InfoContext(ctx, "managed auth domains reconciled", slog.Int("domains", len(r.domains)), slog.Int("orgs", len(orgs)))
	return nil
}

func targetOrg(domain authdomain.ManagedDomain, orgs []*types.Organization) (*types.Organization, error) {
	if domain.Org == "" {
		if len(orgs) == 1 {
			return orgs[0], nil
		}

		return nil, errors.Newf(errors.TypeInvalidInput, authtypes.ErrCodeAuthDomainInvalidConfig, "authdomain: domain %q must set org because there are %d organizations", domain.Postable.Name, len(orgs))
	}

	for _, org := range orgs {
		if org.ID.StringValue() == domain.Org || strings.EqualFold(org.Name, domain.Org) || strings.EqualFold(org.DisplayName, domain.Org) {
			return org, nil
		}
	}

	return nil, errors.Newf(errors.TypeNotFound, authtypes.ErrCodeAuthDomainInvalidConfig, "authdomain: organization %q of domain %q not found", domain.Org, domain.Postable.Name)
}
