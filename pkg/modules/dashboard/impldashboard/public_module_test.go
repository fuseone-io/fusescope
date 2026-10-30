package impldashboard

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/querier/queriertest"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	qb "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newPublicTestDashboard(t *testing.T) (*module, *dashboardtypes.DashboardV2) {
	t.Helper()
	ctx := context.Background()
	store := newTestSQLStore(t)
	_, err := store.BunDB().NewCreateTable().Model((*dashboardtypes.StorablePublicDashboard)(nil)).Exec(ctx)
	require.NoError(t, err)
	_, err = store.BunDB().Exec("CREATE UNIQUE INDEX public_dashboard_dashboard_id ON public_dashboard(dashboard_id)")
	require.NoError(t, err)
	_, err = store.BunDB().NewCreateTable().Model((*dashboardtypes.UserDashboardPreference)(nil)).Exec(ctx)
	require.NoError(t, err)
	m := newTestModule(t, store)
	var postable dashboardtypes.PostableDashboardV2
	require.NoError(t, json.Unmarshal([]byte(`{"schemaVersion":"v6","name":"public-test","tags":[],"spec":{"display":{"name":"Public test"},"variables":[],"panels":{},"layouts":[],"links":[]}}`), &postable))
	d, err := m.CreateV2(ctx, valuer.GenerateUUID(), "owner@example.com", valuer.GenerateUUID(), dashboardtypes.SourceUser, postable)
	require.NoError(t, err)
	return m, d
}

func TestPublicDashboardLifecycle(t *testing.T) {
	ctx := context.Background()
	m, d := newPublicTestDashboard(t)
	config := dashboardtypes.NewPublicDashboard(false, "10m", d.ID)
	require.NoError(t, m.CreatePublic(ctx, d.OrgID, config))
	read, err := m.GetPublic(ctx, d.OrgID, d.ID)
	require.NoError(t, err)
	assert.Equal(t, config.ID, read.ID)
	_, err = m.GetDashboardByPublicIDV2(ctx, config.ID)
	require.NoError(t, err)
	assert.Error(t, m.CreatePublic(ctx, d.OrgID, config))
	read.Update(true, "30m")
	require.NoError(t, m.UpdatePublic(ctx, d.OrgID, read))
	read, err = m.GetPublic(ctx, d.OrgID, d.ID)
	require.NoError(t, err)
	assert.True(t, read.TimeRangeEnabled)
	assert.Equal(t, "30m", read.DefaultTimeRange)
	require.NoError(t, m.DeletePublic(ctx, d.OrgID, d.ID))
	_, err = m.GetDashboardByPublicIDV2(ctx, config.ID)
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeNotFound))
	require.NoError(t, m.CreatePublic(ctx, d.OrgID, dashboardtypes.NewPublicDashboard(false, "5m", d.ID)))
	_, err = m.GetDashboardByPublicIDV2(ctx, config.ID)
	assert.Error(t, err, "republishing must not restore a revoked URL")
}

func TestPublicDashboardOrganizationIsolation(t *testing.T) {
	ctx := context.Background()
	m, d := newPublicTestDashboard(t)
	otherOrg := valuer.GenerateUUID()
	config := dashboardtypes.NewPublicDashboard(false, "1h", d.ID)
	assert.Error(t, m.CreatePublic(ctx, otherOrg, config))
	require.NoError(t, m.CreatePublic(ctx, d.OrgID, config))
	_, err := m.GetPublic(ctx, otherOrg, d.ID)
	assert.Error(t, err)
	assert.Error(t, m.UpdatePublic(ctx, otherOrg, config))
	assert.Error(t, m.DeletePublic(ctx, otherOrg, d.ID))
	_, _, err = m.GetPublicDashboardSelectorsAndOrg(ctx, config.ID, []*types.Organization{{Identifiable: types.Identifiable{ID: otherOrg}}})
	assert.Error(t, err)
	selectors, orgID, err := m.GetPublicDashboardSelectorsAndOrg(ctx, config.ID, []*types.Organization{{Identifiable: types.Identifiable{ID: d.OrgID}}})
	require.NoError(t, err)
	assert.Equal(t, d.OrgID, orgID)
	assert.NotEmpty(t, selectors)
	_, err = m.GetDashboardByPublicIDV2(ctx, config.ID)
	assert.NoError(t, err, "cross-org attempts must not revoke the link")
}

func TestPublicDashboardRejectsNonUserDashboard(t *testing.T) {
	ctx := context.Background()
	m, d := newPublicTestDashboard(t)
	d.Source = dashboardtypes.SourceSystem
	storable, err := d.ToStorableDashboard()
	require.NoError(t, err)
	require.NoError(t, m.store.Update(ctx, d.OrgID, storable))
	assert.Error(t, m.CreatePublic(ctx, d.OrgID, dashboardtypes.NewPublicDashboard(false, "15m", d.ID)))
}

func TestPublicPanelQueryUsesServerStateAndRevocation(t *testing.T) {
	testCases := []struct {
		name       string
		allowRange bool
	}{
		{name: "FixedRange", allowRange: false},
		{name: "ViewerRange", allowRange: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ctx := context.Background()
			m, d := newPublicTestDashboard(t)
			var spec dashboardtypes.DashboardSpec
			require.NoError(t, json.Unmarshal([]byte(`{"display":{"name":"Public requests"},"variables":[{"kind":"TextVariable","spec":{"name":"service","value":"api","display":{"name":"Service"}}}],"panels":{"requests":{"kind":"Panel","spec":{"plugin":{"kind":"signoz/TimeSeriesPanel","spec":{}},"queries":[{"kind":"time_series","spec":{"plugin":{"kind":"signoz/PromQLQuery","spec":{"name":"A","query":"requests_total{service=\"$service\"}"}}}}]}}},"layouts":[],"links":[]}`), &spec))
			d.Spec = spec
			stored, err := d.ToStorableDashboard()
			require.NoError(t, err)
			require.NoError(t, m.store.Update(ctx, d.OrgID, stored))
			config := dashboardtypes.NewPublicDashboard(testCase.allowRange, "10m", d.ID)
			require.NoError(t, m.CreatePublic(ctx, d.OrgID, config))
			calls := 0
			m.querier = &queriertest.MockQuerier{QueryRangeFunc: func(_ context.Context, orgID valuer.UUID, req *qb.QueryRangeRequest) (*qb.QueryRangeResponse, error) {
				calls++
				assert.Equal(t, d.OrgID, orgID)
				assert.Equal(t, "api", req.Variables["service"].Value)
				if testCase.allowRange {
					assert.Equal(t, uint64(1000), req.Start)
					assert.Equal(t, uint64(2000), req.End)
				} else {
					assert.Equal(t, uint64(600000), req.End-req.Start)
				}
				return &qb.QueryRangeResponse{}, nil
			}}
			_, err = m.GetPublicWidgetQueryRangeV2(ctx, config.ID, "requests", "1000", "2000")
			require.NoError(t, err)
			_, err = m.GetPublicWidgetQueryRangeV2(ctx, config.ID, "missing", "1000", "2000")
			require.Error(t, err)
			require.NoError(t, m.DeletePublic(ctx, d.OrgID, d.ID))
			_, err = m.GetPublicWidgetQueryRangeV2(ctx, config.ID, "requests", "1000", "2000")
			require.Error(t, err)
			assert.Equal(t, 1, calls, "invalid or revoked links must not execute queries")
		})
	}
}

func TestDeletingPublishedDashboardRemovesPublicConfiguration(t *testing.T) {
	ctx := context.Background()
	m, d := newPublicTestDashboard(t)
	config := dashboardtypes.NewPublicDashboard(false, "10m", d.ID)
	require.NoError(t, m.CreatePublic(ctx, d.OrgID, config))
	require.NoError(t, m.DeleteV2(ctx, d.OrgID, d.ID))
	_, err := m.store.GetPublic(ctx, d.ID.StringValue())
	require.Error(t, err, "deleting the dashboard must remove its public configuration")
	_, err = m.GetDashboardByPublicIDV2(ctx, config.ID)
	assert.Error(t, err)
}
