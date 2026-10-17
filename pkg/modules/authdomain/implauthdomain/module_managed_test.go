package implauthdomain

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes/authtypestest"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func postableDomain(t *testing.T, name string, issuer string) *authtypes.PostableAuthDomain {
	t.Helper()

	var postable authtypes.PostableAuthDomain
	require.NoError(t, json.Unmarshal([]byte(`{
		"name": "`+name+`",
		"enabled": true,
		"config": {"kind": "oidc", "spec": {"issuer": "`+issuer+`", "clientId": "id", "clientSecret": "secret"}}
	}`), &postable))

	return &postable
}

func notFound() error {
	return errors.New(errors.TypeNotFound, authtypes.ErrCodeAuthDomainNotFound, "not found")
}

func TestApplyManagedDomains(t *testing.T) {
	ctx := context.Background()
	orgID := valuer.GenerateUUID()

	t.Run("CreatesMissingDomain", func(t *testing.T) {
		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().ListByOrgID(ctx, orgID).Return(nil, nil)
		store.EXPECT().GetByName(ctx, "acme.test").Return(nil, notFound())
		store.EXPECT().Create(ctx, mock.MatchedBy(func(domain *authtypes.AuthDomain) bool {
			return domain.IsManaged() && domain.StorableAuthDomain().Name == "acme.test" && domain.StorableAuthDomain().OrgID == orgID
		})).Return(nil)

		module := &module{store: store}
		require.NoError(t, module.ApplyManagedDomains(ctx, orgID, []*authtypes.PostableAuthDomain{postableDomain(t, "acme.test", "https://idp.acme.test")}))
	})

	t.Run("UpdatesChangedDomain", func(t *testing.T) {
		existing, err := authtypes.NewManagedAuthDomain(postableDomain(t, "acme.test", "https://old-idp.acme.test"), orgID)
		require.NoError(t, err)

		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().ListByOrgID(ctx, orgID).Return([]*authtypes.AuthDomain{existing}, nil)
		store.EXPECT().GetByName(ctx, "acme.test").Return(existing, nil)
		store.EXPECT().Update(ctx, mock.MatchedBy(func(domain *authtypes.AuthDomain) bool {
			oidcConfig, err := domain.Config().OIDCConfig()
			return err == nil && oidcConfig.Issuer == "https://idp.acme.test" && domain.IsManaged()
		})).Return(nil)

		module := &module{store: store}
		require.NoError(t, module.ApplyManagedDomains(ctx, orgID, []*authtypes.PostableAuthDomain{postableDomain(t, "acme.test", "https://idp.acme.test")}))
	})

	t.Run("SkipsUnchangedDomain", func(t *testing.T) {
		existing, err := authtypes.NewManagedAuthDomain(postableDomain(t, "acme.test", "https://idp.acme.test"), orgID)
		require.NoError(t, err)

		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().ListByOrgID(ctx, orgID).Return([]*authtypes.AuthDomain{existing}, nil)
		store.EXPECT().GetByName(ctx, "acme.test").Return(existing, nil)

		module := &module{store: store}
		require.NoError(t, module.ApplyManagedDomains(ctx, orgID, []*authtypes.PostableAuthDomain{postableDomain(t, "acme.test", "https://idp.acme.test")}))
	})

	t.Run("AdoptsDomainCreatedFromTheAPI", func(t *testing.T) {
		existing, err := authtypes.NewAuthDomainFromPostableAuthDomain(postableDomain(t, "acme.test", "https://idp.acme.test"), orgID)
		require.NoError(t, err)

		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().ListByOrgID(ctx, orgID).Return([]*authtypes.AuthDomain{existing}, nil)
		store.EXPECT().GetByName(ctx, "acme.test").Return(existing, nil)
		store.EXPECT().Update(ctx, mock.MatchedBy(func(domain *authtypes.AuthDomain) bool { return domain.IsManaged() })).Return(nil)

		module := &module{store: store}
		require.NoError(t, module.ApplyManagedDomains(ctx, orgID, []*authtypes.PostableAuthDomain{postableDomain(t, "acme.test", "https://idp.acme.test")}))
	})

	t.Run("DeletesManagedDomainRemovedFromConfig_KeepsAPIDomains", func(t *testing.T) {
		removed, err := authtypes.NewManagedAuthDomain(postableDomain(t, "old.test", "https://idp.old.test"), orgID)
		require.NoError(t, err)
		fromAPI, err := authtypes.NewAuthDomainFromPostableAuthDomain(postableDomain(t, "ui.test", "https://idp.ui.test"), orgID)
		require.NoError(t, err)

		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().ListByOrgID(ctx, orgID).Return([]*authtypes.AuthDomain{removed, fromAPI}, nil)
		store.EXPECT().Delete(ctx, orgID, removed.StorableAuthDomain().ID).Return(nil)

		module := &module{store: store}
		require.NoError(t, module.ApplyManagedDomains(ctx, orgID, nil))
	})

	t.Run("RejectsDomainOwnedByAnotherOrg", func(t *testing.T) {
		otherOrg, err := authtypes.NewAuthDomainFromPostableAuthDomain(postableDomain(t, "acme.test", "https://idp.acme.test"), valuer.GenerateUUID())
		require.NoError(t, err)

		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().ListByOrgID(ctx, orgID).Return(nil, nil)
		store.EXPECT().GetByName(ctx, "acme.test").Return(otherOrg, nil)

		module := &module{store: store}
		require.Error(t, module.ApplyManagedDomains(ctx, orgID, []*authtypes.PostableAuthDomain{postableDomain(t, "acme.test", "https://idp.acme.test")}))
	})
}

func TestManagedDomainsAreReadOnlyThroughTheAPI(t *testing.T) {
	ctx := context.Background()
	orgID := valuer.GenerateUUID()

	managed, err := authtypes.NewManagedAuthDomain(postableDomain(t, "acme.test", "https://idp.acme.test"), orgID)
	require.NoError(t, err)
	id := managed.StorableAuthDomain().ID

	t.Run("UpdateRejected", func(t *testing.T) {
		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().GetByOrgIDAndID(ctx, orgID, id).Return(managed, nil)

		edited, err := authtypes.NewAuthDomainFromStorableAuthDomain(managed.StorableAuthDomain())
		require.NoError(t, err)

		err = (&module{store: store}).Update(ctx, edited)
		require.Error(t, err)
		assert.True(t, errors.Asc(err, authtypes.ErrCodeAuthDomainManaged))
	})

	t.Run("DeleteRejected", func(t *testing.T) {
		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().GetByOrgIDAndID(ctx, orgID, id).Return(managed, nil)

		err := (&module{store: store}).Delete(ctx, orgID, id)
		require.Error(t, err)
		assert.True(t, errors.Asc(err, authtypes.ErrCodeAuthDomainManaged))
	})

	t.Run("DeleteOfAPIDomainAllowed", func(t *testing.T) {
		fromAPI, err := authtypes.NewAuthDomainFromPostableAuthDomain(postableDomain(t, "ui.test", "https://idp.ui.test"), orgID)
		require.NoError(t, err)
		apiID := fromAPI.StorableAuthDomain().ID

		store := authtypestest.NewMockAuthDomainStore(t)
		store.EXPECT().GetByOrgIDAndID(ctx, orgID, apiID).Return(fromAPI, nil)
		store.EXPECT().Delete(ctx, orgID, apiID).Return(nil)

		require.NoError(t, (&module{store: store}).Delete(ctx, orgID, apiID))
	})
}
