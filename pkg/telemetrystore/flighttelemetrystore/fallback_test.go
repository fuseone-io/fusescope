package flighttelemetrystore

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAnInjectedFallbackNeedsNoClickhouseConfiguration(t *testing.T) {
	bed := newTestbed(t)
	fallback := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherEqual)
	config := telemetrystore.Config{Provider: "flight", Flight: bed.config}
	store, err := NewWithFallback(context.Background(), factorytest.NewSettings(), config, fallback)
	require.NoError(t, err, "no ClickHouse DSN is read")
	assert.Equal(t, fallback.ClickhouseDB(), store.ClickhouseDB(), "the ClickHouse surface is the injected one")

	rows, err := store.Do(telemetrystore.WithService(telemetrystore.WithTenant(context.Background(), testOrg), "parity"), "trace.lookup", []byte(`{"trace_id":"ab01"}`))
	require.NoError(t, err)
	require.NoError(t, rows.Close())
	assert.Len(t, bed.engine.actions, 1, "actions still reach the engine")
}

func TestAnInjectedFallbackIsRequired(t *testing.T) {
	bed := newTestbed(t)
	_, err := NewWithFallback(context.Background(), factorytest.NewSettings(), telemetrystore.Config{Provider: "flight", Flight: bed.config}, nil)
	assert.Error(t, err)
	_, err = NewWithFallback(context.Background(), factorytest.NewSettings(), telemetrystore.Config{Provider: "flight"}, telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherEqual))
	assert.Error(t, err, "the flight configuration is still validated")
}
