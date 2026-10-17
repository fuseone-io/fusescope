package implauthdomain

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain/authdomaintest"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/organizationtest"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func domainConfig(name string, org string) authdomain.DomainConfig {
	return authdomain.DomainConfig{
		Name: name,
		Org:  org,
		Config: map[string]any{
			"kind": "oidc",
			"spec": map[string]any{"issuer": "https://idp." + name, "clientId": "id", "clientSecret": "secret"},
		},
	}
}

func namesOf(names ...string) any {
	return mock.MatchedBy(func(postables []*authtypes.PostableAuthDomain) bool {
		if len(postables) != len(names) {
			return false
		}
		for i, postable := range postables {
			if postable.Name != names[i] {
				return false
			}
		}
		return true
	})
}

func newTestReconciler(t *testing.T, config authdomain.Config, orgs []*types.Organization) (authdomain.Reconciler, *authdomaintest.MockModule) {
	t.Helper()

	orgGetter := organizationtest.NewMockGetter(t)
	orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return(orgs, nil)

	module := authdomaintest.NewMockModule(t)
	reconciler, err := NewReconciler(instrumentationtest.New().ToProviderSettings(), module, orgGetter, config)
	require.NoError(t, err)

	return reconciler, module
}

func org(name string) *types.Organization {
	return &types.Organization{Identifiable: types.Identifiable{ID: valuer.GenerateUUID()}, Name: name, DisplayName: name}
}

func TestReconcile(t *testing.T) {
	ctx := context.Background()

	t.Run("SingleOrg_DomainWithoutOrg", func(t *testing.T) {
		only := org("acme")
		reconciler, module := newTestReconciler(t, authdomain.Config{Domains: []authdomain.DomainConfig{domainConfig("acme.test", "")}}, []*types.Organization{only})
		module.EXPECT().ApplyManagedDomains(mock.Anything, only.ID, namesOf("acme.test")).Return(nil)

		require.NoError(t, reconciler.Reconcile(ctx))
	})

	t.Run("OrgSelectedByName_OtherOrgsCleared", func(t *testing.T) {
		acme, other := org("acme"), org("other")
		reconciler, module := newTestReconciler(t, authdomain.Config{Domains: []authdomain.DomainConfig{domainConfig("other.test", "other")}}, []*types.Organization{acme, other})
		module.EXPECT().ApplyManagedDomains(mock.Anything, acme.ID, namesOf()).Return(nil)
		module.EXPECT().ApplyManagedDomains(mock.Anything, other.ID, namesOf("other.test")).Return(nil)

		require.NoError(t, reconciler.Reconcile(ctx))
	})

	t.Run("OrgSelectedByID", func(t *testing.T) {
		acme, other := org("acme"), org("other")
		reconciler, module := newTestReconciler(t, authdomain.Config{Domains: []authdomain.DomainConfig{domainConfig("acme.test", acme.ID.StringValue())}}, []*types.Organization{acme, other})
		module.EXPECT().ApplyManagedDomains(mock.Anything, acme.ID, namesOf("acme.test")).Return(nil)
		module.EXPECT().ApplyManagedDomains(mock.Anything, other.ID, namesOf()).Return(nil)

		require.NoError(t, reconciler.Reconcile(ctx))
	})

	t.Run("NoOrgYet_NothingToApply", func(t *testing.T) {
		reconciler, _ := newTestReconciler(t, authdomain.Config{Domains: []authdomain.DomainConfig{domainConfig("acme.test", "")}}, nil)

		require.NoError(t, reconciler.Reconcile(ctx))
	})

	t.Run("SeveralOrgsWithoutOrg_ErrorButOthersApplied", func(t *testing.T) {
		acme, other := org("acme"), org("other")
		reconciler, module := newTestReconciler(t, authdomain.Config{Domains: []authdomain.DomainConfig{domainConfig("ambiguous.test", ""), domainConfig("acme.test", "acme")}}, []*types.Organization{acme, other})
		module.EXPECT().ApplyManagedDomains(mock.Anything, acme.ID, namesOf("acme.test")).Return(nil)
		module.EXPECT().ApplyManagedDomains(mock.Anything, other.ID, namesOf()).Return(nil)

		require.Error(t, reconciler.Reconcile(ctx))
	})

	t.Run("UnknownOrg_Error", func(t *testing.T) {
		acme := org("acme")
		reconciler, module := newTestReconciler(t, authdomain.Config{Domains: []authdomain.DomainConfig{domainConfig("acme.test", "missing")}}, []*types.Organization{acme})
		module.EXPECT().ApplyManagedDomains(mock.Anything, acme.ID, namesOf()).Return(nil)

		require.Error(t, reconciler.Reconcile(ctx))
	})

	t.Run("EmptyConfig_ClearsManagedDomains", func(t *testing.T) {
		acme := org("acme")
		reconciler, module := newTestReconciler(t, authdomain.Config{}, []*types.Organization{acme})
		module.EXPECT().ApplyManagedDomains(mock.Anything, acme.ID, namesOf()).Return(nil)

		require.NoError(t, reconciler.Reconcile(ctx))
	})
}
