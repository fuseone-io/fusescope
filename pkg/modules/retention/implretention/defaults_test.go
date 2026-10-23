package implretention

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/organizationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/retention"
	"github.com/fuseone-io/fusescope/pkg/modules/retention/retentiontest"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func newTestDefaultsService(t *testing.T, defaults retention.DefaultConfig) (*defaultsService, *retentiontest.MockTTLSetter, *organizationtest.MockGetter) {
	t.Helper()

	orgGetter := organizationtest.NewMockGetter(t)
	setter := retentiontest.NewMockTTLSetter(t)
	service := NewDefaultsService(instrumentationtest.New().ToProviderSettings(), setter, orgGetter, retention.Config{Default: defaults, ReconcileInterval: time.Minute})

	return service.(*defaultsService), setter, orgGetter
}

func newTestOrg() *types.Organization {
	return &types.Organization{Identifiable: types.Identifiable{ID: valuer.GenerateUUID()}}
}

func TestDefaultsServiceReconcile(t *testing.T) {
	ctx := context.Background()

	t.Run("Unset_AppliesConfiguredSignalsOnly", func(t *testing.T) {
		org := newTestOrg()
		service, setter, orgGetter := newTestDefaultsService(t, retention.DefaultConfig{Logs: 3, Metrics: 30})
		orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{org}, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.LogsTTL).Return(false, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.MetricsTTL).Return(false, nil).Once()
		setter.EXPECT().SetDefaultTTL(mock.Anything, org.ID, retentiontypes.LogsTTL, 3).Return(nil).Once()
		setter.EXPECT().SetDefaultTTL(mock.Anything, org.ID, retentiontypes.MetricsTTL, 30).Return(nil).Once()

		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("SetByAdmin_NotOverridden", func(t *testing.T) {
		org := newTestOrg()
		service, setter, orgGetter := newTestDefaultsService(t, retention.DefaultConfig{Logs: 3, Traces: 3, Metrics: 3})
		orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{org}, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.LogsTTL).Return(true, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.TraceTTL).Return(false, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.MetricsTTL).Return(true, nil).Once()
		setter.EXPECT().SetDefaultTTL(mock.Anything, org.ID, retentiontypes.TraceTTL, 3).Return(nil).Once()

		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("AllSet_OrgsNotListed", func(t *testing.T) {
		service, setter, _ := newTestDefaultsService(t, retention.DefaultConfig{Logs: 3, Traces: 3})
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.LogsTTL).Return(true, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.TraceTTL).Return(true, nil).Once()

		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("ReconciledTwice_AppliedOnce", func(t *testing.T) {
		org := newTestOrg()
		service, setter, orgGetter := newTestDefaultsService(t, retention.DefaultConfig{Traces: 7})
		orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{org}, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.TraceTTL).Return(false, nil).Once()
		setter.EXPECT().SetDefaultTTL(mock.Anything, org.ID, retentiontypes.TraceTTL, 7).Return(nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.TraceTTL).Return(true, nil).Once()

		require.NoError(t, service.reconcile(ctx))
		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("SeveralOrgs_RecordedOnFirstOrgOnly", func(t *testing.T) {
		first, second := newTestOrg(), newTestOrg()
		service, setter, orgGetter := newTestDefaultsService(t, retention.DefaultConfig{Traces: 3, Metrics: 3})
		orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{first, second}, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, mock.Anything).Return(false, nil).Twice()
		setter.EXPECT().SetDefaultTTL(mock.Anything, first.ID, retentiontypes.TraceTTL, 3).Return(nil).Once()
		setter.EXPECT().SetDefaultTTL(mock.Anything, first.ID, retentiontypes.MetricsTTL, 3).Return(nil).Once()

		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("NoOrgYet_AppliedOnceOrgExists", func(t *testing.T) {
		org := newTestOrg()
		service, setter, orgGetter := newTestDefaultsService(t, retention.DefaultConfig{Logs: 3})
		orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{}, nil).Once()
		orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{org}, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.LogsTTL).Return(false, nil).Twice()
		setter.EXPECT().SetDefaultTTL(mock.Anything, org.ID, retentiontypes.LogsTTL, 3).Return(nil).Once()

		require.NoError(t, service.reconcile(ctx))
		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("SetFails_RetriedNextReconcile", func(t *testing.T) {
		org := newTestOrg()
		service, setter, orgGetter := newTestDefaultsService(t, retention.DefaultConfig{Logs: 3})
		orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{org}, nil).Twice()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.LogsTTL).Return(false, nil).Twice()
		setter.EXPECT().SetDefaultTTL(mock.Anything, org.ID, retentiontypes.LogsTTL, 3).Return(errors.New(errors.TypeInternal, errors.CodeInternal, "clickhouse unavailable")).Once()
		setter.EXPECT().SetDefaultTTL(mock.Anything, org.ID, retentiontypes.LogsTTL, 3).Return(nil).Once()

		assert.Error(t, service.reconcile(ctx))
		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("CheckFails_OtherSignalsStillApplied", func(t *testing.T) {
		org := newTestOrg()
		service, setter, orgGetter := newTestDefaultsService(t, retention.DefaultConfig{Traces: 3, Metrics: 3})
		orgGetter.EXPECT().ListByOwnedKeyRange(mock.Anything).Return([]*types.Organization{org}, nil).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.TraceTTL).Return(false, errors.New(errors.TypeInternal, errors.CodeInternal, "sqlstore unavailable")).Once()
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.MetricsTTL).Return(false, nil).Once()
		setter.EXPECT().SetDefaultTTL(mock.Anything, org.ID, retentiontypes.MetricsTTL, 3).Return(nil).Once()

		assert.Error(t, service.reconcile(ctx))
	})
}

func TestDefaultsServiceStart(t *testing.T) {
	t.Run("Unset_HealthyWithoutReconciling", func(t *testing.T) {
		service, _, _ := newTestDefaultsService(t, retention.DefaultConfig{})

		done := make(chan error)
		go func() { done <- service.Start(context.Background()) }()

		<-service.Healthy()
		require.NoError(t, service.Stop(context.Background()))
		assert.NoError(t, <-done)
	})

	t.Run("ContextCancelled_Stops", func(t *testing.T) {
		service, setter, _ := newTestDefaultsService(t, retention.DefaultConfig{Logs: 3})
		setter.EXPECT().HasTTLSetting(mock.Anything, retentiontypes.LogsTTL).Return(true, nil).Maybe()

		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan error)
		go func() { done <- service.Start(ctx) }()

		<-service.Healthy()
		cancel()
		assert.NoError(t, <-done)
	})
}
