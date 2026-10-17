package implauthdomain

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/authdomain/authdomaintest"
)

func TestServiceReconcilesAtStartAndPeriodically(t *testing.T) {
	reconciler := authdomaintest.NewMockReconciler(t)
	calls := make(chan struct{}, 10)
	reconciler.EXPECT().Reconcile(mock.Anything).RunAndReturn(func(context.Context) error {
		calls <- struct{}{}
		return nil
	})

	service := NewService(instrumentationtest.New().ToProviderSettings(), reconciler, 10*time.Millisecond)

	done := make(chan error, 1)
	go func() { done <- service.Start(context.Background()) }()

	select {
	case <-service.Healthy():
	case <-time.After(time.Second):
		t.Fatal("service did not become healthy")
	}

	for i := 0; i < 2; i++ {
		select {
		case <-calls:
		case <-time.After(time.Second):
			t.Fatalf("reconcile call %d did not happen", i+1)
		}
	}

	require.NoError(t, service.Stop(context.Background()))
	assert.NoError(t, <-done)
}

func TestServiceIsHealthyEvenWhenTheFirstReconcileFails(t *testing.T) {
	reconciler := authdomaintest.NewMockReconciler(t)
	reconciler.EXPECT().Reconcile(mock.Anything).Return(errors.New(errors.TypeInvalidInput, errors.CodeInvalidInput, "ambiguous org")).Maybe()

	service := NewService(instrumentationtest.New().ToProviderSettings(), reconciler, time.Hour)

	done := make(chan error, 1)
	go func() { done <- service.Start(context.Background()) }()

	select {
	case <-service.Healthy():
	case <-time.After(time.Second):
		t.Fatal("a misconfigured domain must not keep the service unhealthy")
	}

	require.NoError(t, service.Stop(context.Background()))
	assert.NoError(t, <-done)
}
