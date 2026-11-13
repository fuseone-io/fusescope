package rules

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	alertmanagermock "github.com/fuseone-io/fusescope/pkg/alertmanager/alertmanagertest"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/queryparser"
	"github.com/fuseone-io/fusescope/pkg/ruler/rulestore/sqlrulestore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/alertmanagertypes"
	"github.com/fuseone-io/fusescope/pkg/types/ruletypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func newInOrgTestManager(t *testing.T) (*Manager, *alertmanagermock.MockAlertmanager, sqlstore.SQLStore) {
	t.Helper()
	store, err := sqlitesqlstore.New(context.Background(), factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
		Sqlite: sqlstore.SqliteConfig{
			Path:            filepath.Join(t.TempDir(), "test.db"),
			Mode:            "wal",
			BusyTimeout:     5 * time.Second,
			TransactionMode: "deferred",
		},
	})
	require.NoError(t, err)
	_, err = store.BunDB().NewCreateTable().Model((*ruletypes.StorableRule)(nil)).Exec(context.Background())
	require.NoError(t, err)

	am := alertmanagermock.NewMockAlertmanager(t)
	settings := factorytest.NewSettings()
	manager, err := NewManager(&ManagerOptions{
		Logger:       instrumentationtest.New().Logger(),
		Alertmanager: am,
		RuleStore:    sqlrulestore.NewRuleStore(store, queryparser.New(settings), settings),
		SQLStore:     store,
	})
	require.NoError(t, err)
	return manager, am, store
}

// A disabled v2alpha1 threshold rule that notifies without policies, so
// creating it sets up its routes but starts no evaluation.
func inOrgTestRule(t *testing.T) ruletypes.PostableRule {
	t.Helper()
	var rule ruletypes.PostableRule
	require.NoError(t, json.Unmarshal([]byte(`{
		"alert": "TestAlert", "version": "v5", "schemaVersion": "v2alpha1", "ruleType": "threshold_rule", "disabled": true,
		"condition": {
			"compositeQuery": {"queryType": "builder", "queries": [{"type": "builder_query", "spec": {
				"name": "A", "signal": "metrics", "aggregations": [{"metricName": "cpu", "spaceAggregation": "p50"}], "stepInterval": "5m"}}]},
			"thresholds": {"kind": "basic", "spec": [{"name": "critical", "target": 90.0, "matchType": "1", "op": "1"}]}
		},
		"evaluation": {"kind": "rolling", "spec": {"evalWindow": "5m", "frequency": "1m"}},
		"notificationSettings": {"renotify": {"enabled": true, "interval": "4h", "alertStates": ["firing"]}}
	}`), &rule))
	require.NoError(t, rule.Validate())
	return rule
}

// The in-org methods serve callers that authorized the operation
// themselves, so they run with no claims in the context and pass the
// organization and actor they were given down to the alertmanager.
func TestRuleInOrgNeedsNoClaims(t *testing.T) {
	ctx := context.Background()
	manager, am, _ := newInOrgTestManager(t)
	orgID := valuer.GenerateUUID()
	id := valuer.GenerateUUID()
	rule := inOrgTestRule(t)

	am.EXPECT().SetNotificationConfig(mock.Anything, orgID, id.StringValue(), mock.Anything).Return(nil).Twice()
	am.EXPECT().CreateRoutePolicies(mock.Anything, orgID, "integration:builtin-demo", mock.Anything).Return(nil, nil).Once()
	am.EXPECT().CreateInhibitRules(mock.Anything, orgID, mock.Anything).Return(nil).Twice()
	require.NoError(t, manager.CreateRuleInOrg(ctx, orgID, id, "integration:builtin-demo", &rule))
	require.NoError(t, manager.CreateRuleInOrg(ctx, orgID, id, "integration:builtin-demo", &rule), "a rule that exists is left as it is")

	stored, err := manager.ruleStore.GetStoredRule(ctx, orgID, id)
	require.NoError(t, err)
	assert.Equal(t, orgID.StringValue(), stored.OrgID)
	assert.Equal(t, "integration:builtin-demo", stored.CreatedBy)

	assert.Error(t, manager.CreateRuleInOrg(ctx, valuer.GenerateUUID(), id, "integration:builtin-demo", &rule), "another organization's rule is neither returned nor overwritten")

	rule.AlertName = valuer.NewDisplayName("renamed")
	am.EXPECT().UpdateAllRoutePoliciesByRuleId(mock.Anything, orgID, "integration:builtin-demo", id.StringValue(), mock.Anything).Return(nil).Once()
	am.EXPECT().DeleteAllInhibitRulesByRuleId(mock.Anything, orgID, id.StringValue()).Return(nil)
	require.NoError(t, manager.EditRuleInOrg(ctx, orgID, id, "integration:builtin-demo", &rule))
	stored, err = manager.ruleStore.GetStoredRule(ctx, orgID, id)
	require.NoError(t, err)
	var edited ruletypes.PostableRule
	require.NoError(t, json.Unmarshal([]byte(stored.Data), &edited))
	assert.Equal(t, "renamed", edited.AlertName.StringValue())
	assert.Equal(t, "integration:builtin-demo", stored.UpdatedBy)

	config, err := alertmanagertypes.NewDefaultConfig(alertmanagertypes.GlobalConfig{}, alertmanagertypes.RouteConfig{GroupInterval: time.Minute, RepeatInterval: time.Minute, GroupWait: time.Minute}, orgID.StringValue())
	require.NoError(t, err)
	am.EXPECT().GetConfig(mock.Anything, orgID.StringValue()).Return(config, nil).Once()
	am.EXPECT().SetConfig(mock.Anything, mock.Anything).Return(nil).Once()
	am.EXPECT().DeleteNotificationConfig(mock.Anything, orgID, id.String()).Return(nil).Once()
	am.EXPECT().DeleteAllRoutePoliciesByRuleId(mock.Anything, orgID, id.String()).Return(nil).Once()
	require.NoError(t, manager.DeleteRuleInOrg(ctx, orgID, id))
	require.NoError(t, manager.DeleteRuleInOrg(ctx, orgID, id), "deleting a missing rule succeeds and touches nothing")
	_, err = manager.ruleStore.GetStoredRule(ctx, orgID, id)
	assert.Error(t, err)
}

func TestRuleHandlerMethodsStillNeedClaims(t *testing.T) {
	manager, _, _ := newInOrgTestManager(t)
	rule := inOrgTestRule(t)
	data, err := json.Marshal(rule)
	require.NoError(t, err)

	_, err = manager.CreateRule(context.Background(), string(data))
	assert.Error(t, err)
	assert.Error(t, manager.EditRule(context.Background(), string(data), valuer.GenerateUUID()))
	assert.Error(t, manager.DeleteRule(context.Background(), valuer.GenerateUUID().StringValue()))
}
