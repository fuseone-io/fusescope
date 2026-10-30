package signoz

import (
	"context"
	"reflect"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/fuseone-io/fusescope/pkg/alertmanager"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/alertmanagerstore/sqlalertmanagerstore"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/nfmanager/nfmanagertest"
	"github.com/fuseone-io/fusescope/pkg/alertmanager/signozalertmanager"
	"github.com/fuseone-io/fusescope/pkg/emailing/emailingtest"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/cloudintegration/implcloudintegration"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard/impldashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/metricreductionrule/implmetricreductionrule"
	"github.com/fuseone-io/fusescope/pkg/modules/organization/implorganization"
	"github.com/fuseone-io/fusescope/pkg/modules/retention/implretention"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount/implserviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/spanmapper/implspanmapper"
	"github.com/fuseone-io/fusescope/pkg/modules/tag/impltag"
	"github.com/fuseone-io/fusescope/pkg/modules/user/impluser"
	"github.com/fuseone-io/fusescope/pkg/queryparser"
	"github.com/fuseone-io/fusescope/pkg/sharder"
	"github.com/fuseone-io/fusescope/pkg/sharder/noopsharder"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlstoretest"
	"github.com/fuseone-io/fusescope/pkg/tokenizer/tokenizertest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// This is a test to ensure that all fields of the modules are initialized.
// It also helps us catch these errors at compile time instead of runtime.
func TestNewModules(t *testing.T) {
	sqlstore := sqlstoretest.New(sqlstore.Config{Provider: "sqlite"}, sqlmock.QueryMatcherEqual)
	providerSettings := factorytest.NewSettings()
	sharder, err := noopsharder.New(context.TODO(), providerSettings, sharder.Config{})
	require.NoError(t, err)
	orgGetter := implorganization.NewGetter(implorganization.NewStore(sqlstore), sharder)
	notificationManager := nfmanagertest.NewMock()
	require.NoError(t, err)
	maintenanceStore := sqlalertmanagerstore.NewMaintenanceStore(sqlstore, providerSettings)
	alertmanager, err := signozalertmanager.New(providerSettings, alertmanager.Config{}, sqlstore, orgGetter, notificationManager, maintenanceStore)
	require.NoError(t, err)
	tokenizer := tokenizertest.NewMockTokenizer(t)
	emailing := emailingtest.New()
	queryParser := queryparser.New(providerSettings)
	require.NoError(t, err)
	tagModule := impltag.NewModule(impltag.NewStore(sqlstore))
	systemDashboardRegistry, err := impldashboard.NewSystemDashboardRegistry()
	require.NoError(t, err)
	dashboardModule := impldashboard.NewModule(impldashboard.NewStore(sqlstore), providerSettings, nil, orgGetter, queryParser, tagModule, systemDashboardRegistry, nil)

	flagger, err := flagger.New(context.Background(), instrumentationtest.New().ToProviderSettings(), flagger.Config{}, flagger.MustNewRegistry())
	require.NoError(t, err)

	userRoleStore := impluser.NewUserRoleStore(sqlstore, providerSettings)

	userGetter := impluser.NewGetter(impluser.NewStore(sqlstore, providerSettings), userRoleStore, flagger)

	serviceAccount := implserviceaccount.NewModule(implserviceaccount.NewStore(sqlstore), nil, nil, nil, providerSettings, serviceaccount.Config{})

	serviceAccountGetter := implserviceaccount.NewGetter(implserviceaccount.NewStore(sqlstore))

	retentionGetter := implretention.NewGetter(implretention.NewStore(sqlstore))

	spanMapperRegistry, err := implspanmapper.NewSystemGroupRegistry()
	require.NoError(t, err)
	spanMapperModule := implspanmapper.NewModule(implspanmapper.NewStore(sqlstore), spanMapperRegistry, providerSettings)

	modules := NewModules(sqlstore, tokenizer, emailing, providerSettings, orgGetter, alertmanager, nil, nil, nil, nil, nil, nil, nil, queryParser, Config{}, dashboardModule, userGetter, userRoleStore, serviceAccount, serviceAccountGetter, implcloudintegration.NewModule(), retentionGetter, flagger, tagModule, implmetricreductionrule.NewModule(), spanMapperModule)

	reflectVal := reflect.ValueOf(modules)
	for i := 0; i < reflectVal.NumField(); i++ {
		f := reflectVal.Field(i)
		assert.False(t, f.IsZero(), "%s module has not been initialized", reflectVal.Type().Field(i).Name)
	}
}
