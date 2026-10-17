package implauthdomain

import (
	"context"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/authz"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type module struct {
	store  authtypes.AuthDomainStore
	authNs map[authtypes.AuthNProvider]authn.AuthN
	authz  authz.AuthZ
}

func NewModule(store authtypes.AuthDomainStore, authNs map[authtypes.AuthNProvider]authn.AuthN, authz authz.AuthZ) authdomain.Module {
	return &module{store: store, authNs: authNs, authz: authz}
}

func (module *module) Create(ctx context.Context, domain *authtypes.AuthDomain) error {
	if err := module.validateRoleMapping(ctx, domain); err != nil {
		return err
	}

	return module.store.Create(ctx, domain)
}

func (module *module) Get(ctx context.Context, id valuer.UUID) (*authtypes.AuthDomain, error) {
	return module.store.Get(ctx, id)
}

func (module *module) GetAuthNProviderInfo(ctx context.Context, domain *authtypes.AuthDomain) *authtypes.AuthNProviderInfo {
	if callbackAuthN, ok := module.authNs[domain.Kind()].(authn.CallbackAuthN); ok {
		return callbackAuthN.ProviderInfo(ctx, domain)
	}
	return &authtypes.AuthNProviderInfo{}
}

func (module *module) GetByOrgIDAndID(ctx context.Context, orgID valuer.UUID, id valuer.UUID) (*authtypes.AuthDomain, error) {
	return module.store.GetByOrgIDAndID(ctx, orgID, id)
}

func (module *module) GetByNameAndOrgID(ctx context.Context, name string, orgID valuer.UUID) (*authtypes.AuthDomain, error) {
	return module.store.GetByNameAndOrgID(ctx, name, orgID)
}

func (module *module) Delete(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error {
	if err := module.rejectManaged(ctx, orgID, id); err != nil {
		return err
	}

	return module.store.Delete(ctx, orgID, id)
}

func (module *module) ListByOrgID(ctx context.Context, orgID valuer.UUID) ([]*authtypes.AuthDomain, error) {
	return module.store.ListByOrgID(ctx, orgID)
}

func (module *module) Update(ctx context.Context, domain *authtypes.AuthDomain) error {
	if err := module.rejectManaged(ctx, domain.StorableAuthDomain().OrgID, domain.StorableAuthDomain().ID); err != nil {
		return err
	}

	if err := module.validateRoleMapping(ctx, domain); err != nil {
		return err
	}

	return module.store.Update(ctx, domain)
}

func (module *module) ApplyManagedDomains(ctx context.Context, orgID valuer.UUID, desired []*authtypes.PostableAuthDomain) error {
	existing, err := module.store.ListByOrgID(ctx, orgID)
	if err != nil {
		return err
	}

	desiredNames := make(map[string]struct{}, len(desired))
	for _, postable := range desired {
		desiredNames[strings.ToLower(postable.Name)] = struct{}{}

		if err := module.applyManagedDomain(ctx, orgID, postable); err != nil {
			return err
		}
	}

	for _, domain := range existing {
		if !domain.IsManaged() {
			continue
		}

		if _, ok := desiredNames[strings.ToLower(domain.StorableAuthDomain().Name)]; ok {
			continue
		}

		if err := module.store.Delete(ctx, orgID, domain.StorableAuthDomain().ID); err != nil {
			return err
		}
	}

	return nil
}

func (module *module) applyManagedDomain(ctx context.Context, orgID valuer.UUID, postable *authtypes.PostableAuthDomain) error {
	current, err := module.store.GetByName(ctx, postable.Name)
	if err != nil && !errors.Ast(err, errors.TypeNotFound) {
		return err
	}

	if current == nil {
		domain, err := authtypes.NewManagedAuthDomain(postable, orgID)
		if err != nil {
			return err
		}

		if err := module.validateRoleMapping(ctx, domain); err != nil {
			return err
		}

		return module.store.Create(ctx, domain)
	}

	if current.StorableAuthDomain().OrgID != orgID {
		return errors.Newf(errors.TypeAlreadyExists, authtypes.ErrCodeAuthDomainAlreadyExists, "auth domain %q already belongs to another organization", postable.Name)
	}

	changed, err := current.ReplaceManaged(postable)
	if err != nil || !changed {
		return err
	}

	if err := module.validateRoleMapping(ctx, current); err != nil {
		return err
	}

	return module.store.Update(ctx, current)
}

func (module *module) rejectManaged(ctx context.Context, orgID valuer.UUID, id valuer.UUID) error {
	stored, err := module.store.GetByOrgIDAndID(ctx, orgID, id)
	if err != nil {
		return err
	}

	if stored.IsManaged() {
		return errors.Newf(errors.TypeForbidden, authtypes.ErrCodeAuthDomainManaged, "auth domain %q is managed by the configuration file and cannot be changed from the API", stored.StorableAuthDomain().Name)
	}

	return nil
}

func (module *module) Collect(ctx context.Context, orgID valuer.UUID) (map[string]any, error) {
	domains, err := module.store.ListByOrgID(ctx, orgID)
	if err != nil {
		return nil, err
	}

	stats := make(map[string]any)

	for _, domain := range domains {
		key := "authdomain." + domain.Kind().StringValue() + ".count"
		if value, ok := stats[key]; ok {
			stats[key] = value.(int64) + 1
		} else {
			stats[key] = int64(1)
		}
	}

	stats["authdomain.count"] = len(domains)

	return stats, nil
}

func (module *module) validateRoleMapping(ctx context.Context, domain *authtypes.AuthDomain) error {
	roleNames := domain.RoleMapping().RoleNames()
	if len(roleNames) == 0 {
		return nil
	}

	_, err := module.authz.ListByOrgIDAndNames(ctx, domain.StorableAuthDomain().OrgID, roleNames)
	return err
}
