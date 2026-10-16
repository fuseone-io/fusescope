package signoz

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/alertmanagerstore/sqlalertmanagerstore"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/nfmanager/nfmanagertest"
	"github.com/fuseone-io/fusescope/pkg/analytics"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard/impldashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/implorganization"
	"github.com/fuseone-io/fusescope/pkg/modules/tag/impltag"
	"github.com/fuseone-io/fusescope/pkg/modules/user/impluser"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/sqlschematest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlstoretest"
	"github.com/fuseone-io/fusescope/pkg/statsreporter"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/tokenizer/tokenizertest"
	"github.com/fuseone-io/fusescope/pkg/version"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// This is a test to ensure that provider factories can be created without panicking since
// we are using the factory.MustNewNamedMap function to initialize the provider factories.
// It also helps us catch these errors during testing instead of runtime.
func TestNewProviderFactories(t *testing.T) {
	assert.NotPanics(t, func() {
		NewCacheProviderFactories()
	})

	assert.NotPanics(t, func() {
		NewWebProviderFactories(global.Config{})
	})

	assert.NotPanics(t, func() {
		NewSQLStoreProviderFactories()
	})

	assert.NotPanics(t, func() {
		NewTelemetryStoreProviderFactories()
	})

	assert.NotPanics(t, func() {
		store := sqlstoretest.New(sqlstore.Config{Provider: "sqlite"}, sqlmock.QueryMatcherEqual)
		NewSQLMigrationProviderFactories(
			store,
			sqlschematest.New(map[string]*sqlschema.Table{}, map[string][]*sqlschema.UniqueConstraint{}, map[string]sqlschema.Index{}),
			telemetrystoretest.New(telemetrystore.Config{Provider: "clickhouse"}, sqlmock.QueryMatcherEqual),
			instrumentationtest.New().ToProviderSettings(),
			impldashboard.NewStore(store),
			impltag.NewModule(impltag.NewStore(store)),
		)
	})

	assert.NotPanics(t, func() {
		NewPrometheusProviderFactories(telemetrystoretest.New(telemetrystore.Config{Provider: "clickhouse"}, sqlmock.QueryMatcherEqual))
	})

	assert.NotPanics(t, func() {
		store := sqlstoretest.New(sqlstore.Config{Provider: "sqlite"}, sqlmock.QueryMatcherEqual)
		orgGetter := implorganization.NewGetter(implorganization.NewStore(store), nil)
		notificationManager := nfmanagertest.NewMock()
		maintenanceStore := sqlalertmanagerstore.NewMaintenanceStore(store, factorytest.NewSettings())
		NewAlertmanagerProviderFactories(store, orgGetter, notificationManager, maintenanceStore)
	})

	assert.NotPanics(t, func() {
		NewEmailingProviderFactories()
	})

	assert.NotPanics(t, func() {
		NewSharderProviderFactories()
	})

	assert.NotPanics(t, func() {
		providerSettings := instrumentationtest.New().ToProviderSettings()
		ss := sqlstoretest.New(sqlstore.Config{Provider: "sqlite"}, sqlmock.QueryMatcherEqual)
		userRoleStore := impluser.NewUserRoleStore(ss, providerSettings)
		flagger, err := flagger.New(context.Background(), providerSettings, flagger.Config{}, flagger.MustNewRegistry())
		require.NoError(t, err)

		userGetter := impluser.NewGetter(impluser.NewStore(sqlstoretest.New(sqlstore.Config{Provider: "sqlite"}, sqlmock.QueryMatcherEqual), instrumentationtest.New().ToProviderSettings()), userRoleStore, flagger)
		orgGetter := implorganization.NewGetter(implorganization.NewStore(sqlstoretest.New(sqlstore.Config{Provider: "sqlite"}, sqlmock.QueryMatcherEqual)), nil)
		statsAggregator := statsreporter.NewAggregator(providerSettings, []statsreporter.StatsCollector{})
		NewStatsReporterProviderFactories(statsAggregator, orgGetter, userGetter, tokenizertest.NewMockTokenizer(t), version.Build{}, analytics.Config{Enabled: true})
	})

	assert.NotPanics(t, func() {
		NewAPIServerProviderFactories(
			implorganization.NewGetter(implorganization.NewStore(sqlstoretest.New(sqlstore.Config{Provider: "sqlite"}, sqlmock.QueryMatcherEqual)), nil),
			nil,
			Modules{},
			Handlers{},
			global.Config{},
			nil,
			nil,
			nil,
			nil,
			nil,
		)
	})
}
