package implarchive

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/archive"
	"github.com/fuseone-io/fusescope/pkg/modules/retention/retentiontest"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

func newTestBackstopService(t *testing.T, store archivetypes.Store, backstopDays int) (*backstopService, *retentiontest.MockBackstopSetter) {
	t.Helper()

	config := archive.Config{Interval: time.Hour}
	config.Logs = archive.SignalConfig{Enabled: true, NamedCollection: "s3", Prefix: "p", BackstopDays: backstopDays}
	setter := retentiontest.NewMockBackstopSetter(t)

	return NewBackstopService(instrumentationtest.New().ToProviderSettings(), setter, store, config).(*backstopService), setter
}

func TestBackstopServiceReconcile(t *testing.T) {
	ctx := context.Background()

	t.Run("FirstEnable_AppliedAndRecorded", func(t *testing.T) {
		store := newTestStore(t)
		service, setter := newTestBackstopService(t, store, 7)
		setter.EXPECT().ApplyArchiveBackstop(mock.Anything, retentiontypes.LogsTTL, 7).Return(nil).Once()

		require.NoError(t, service.reconcile(ctx))

		state, err := store.GetSignal(ctx, retentiontypes.LogsTTL)
		require.NoError(t, err)
		require.NotNil(t, state)
		assert.Equal(t, 7, state.BackstopDays)
		assert.NotNil(t, state.AppliedAt)
	})

	t.Run("AlreadyApplied_NothingIssued", func(t *testing.T) {
		store := newTestStore(t)
		service, setter := newTestBackstopService(t, store, 7)
		setter.EXPECT().ApplyArchiveBackstop(mock.Anything, retentiontypes.LogsTTL, 7).Return(nil).Once()

		require.NoError(t, service.reconcile(ctx))
		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("BackstopChanged_AppliedAgain", func(t *testing.T) {
		store := newTestStore(t)
		first, firstSetter := newTestBackstopService(t, store, 7)
		firstSetter.EXPECT().ApplyArchiveBackstop(mock.Anything, retentiontypes.LogsTTL, 7).Return(nil).Once()
		require.NoError(t, first.reconcile(ctx))

		second, secondSetter := newTestBackstopService(t, store, 10)
		secondSetter.EXPECT().ApplyArchiveBackstop(mock.Anything, retentiontypes.LogsTTL, 10).Return(nil).Once()
		require.NoError(t, second.reconcile(ctx))

		state, err := store.GetSignal(ctx, retentiontypes.LogsTTL)
		require.NoError(t, err)
		assert.Equal(t, 10, state.BackstopDays)
	})

	t.Run("ApplyFails_RecordedAsPendingAndRetried", func(t *testing.T) {
		store := newTestStore(t)
		service, setter := newTestBackstopService(t, store, 7)
		setter.EXPECT().ApplyArchiveBackstop(mock.Anything, retentiontypes.LogsTTL, 7).Return(errors.New(errors.TypeInternal, errors.CodeInternal, "clickhouse down")).Once()

		assert.Error(t, service.reconcile(ctx))

		state, err := store.GetSignal(ctx, retentiontypes.LogsTTL)
		require.NoError(t, err, "the backstop is recorded before it is applied, so every TTL writer carries it meanwhile")
		assert.Nil(t, state.AppliedAt)

		setter.EXPECT().ApplyArchiveBackstop(mock.Anything, retentiontypes.LogsTTL, 7).Return(nil).Once()
		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("LeaseHeldByAnotherBackend_NothingIssued", func(t *testing.T) {
		store := newTestStore(t)
		service, _ := newTestBackstopService(t, store, 7)
		_, err := store.AcquireLease(ctx, archivetypes.BackstopLease(retentiontypes.LogsTTL), "other", time.Now().Add(time.Minute))
		require.NoError(t, err)

		require.NoError(t, service.reconcile(ctx))

		_, err = store.GetSignal(ctx, retentiontypes.LogsTTL)
		assert.True(t, errors.Ast(err, errors.TypeNotFound))
	})

	t.Run("ExportLeaseHeld_Applied", func(t *testing.T) {
		store := newTestStore(t)
		service, setter := newTestBackstopService(t, store, 7)
		_, err := store.AcquireLease(ctx, retentiontypes.LogsTTL, "exporter", time.Now().Add(time.Minute))
		require.NoError(t, err)
		setter.EXPECT().ApplyArchiveBackstop(mock.Anything, retentiontypes.LogsTTL, 7).Return(nil).Once()

		require.NoError(t, service.reconcile(ctx))
	})

	t.Run("Disabled_NothingIssued", func(t *testing.T) {
		store := newTestStore(t)
		service, _ := newTestBackstopService(t, store, 7)
		service.config.Logs.Enabled = false

		require.NoError(t, service.reconcile(ctx))

		_, err := store.GetSignal(ctx, retentiontypes.LogsTTL)
		assert.True(t, errors.Ast(err, errors.TypeNotFound))
	})
}

func TestBackstopServiceStopCancelsApply(t *testing.T) {
	service, setter := newTestBackstopService(t, newTestStore(t), 7)
	applying := make(chan struct{})
	setter.EXPECT().ApplyArchiveBackstop(mock.Anything, retentiontypes.LogsTTL, 7).RunAndReturn(func(ctx context.Context, _ string, _ int) error {
		close(applying)
		<-ctx.Done()
		return ctx.Err()
	}).Once()

	started := make(chan error, 1)
	go func() { started <- service.Start(context.Background()) }()
	<-applying
	require.NoError(t, service.Stop(context.Background()))

	select {
	case err := <-started:
		assert.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("Start did not return after Stop")
	}
}
