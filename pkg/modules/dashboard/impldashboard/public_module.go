package impldashboard

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	qb "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func (m *module) CreatePublic(ctx context.Context, orgID valuer.UUID, config *dashboardtypes.PublicDashboard) error {
	d, err := m.GetV2(ctx, orgID, config.DashboardID)
	if err != nil {
		return err
	}
	if err := d.ErrIfNotPublishable(); err != nil {
		return err
	}
	return m.store.CreatePublic(ctx, dashboardtypes.NewStorablePublicDashboardFromPublicDashboard(config))
}

func (m *module) GetPublic(ctx context.Context, orgID, dashboardID valuer.UUID) (*dashboardtypes.PublicDashboard, error) {
	if _, err := m.store.Get(ctx, orgID, dashboardID); err != nil {
		return nil, err
	}
	stored, err := m.store.GetPublic(ctx, dashboardID.StringValue())
	if err != nil {
		return nil, err
	}
	return dashboardtypes.NewPublicDashboardFromStorablePublicDashboard(stored), nil
}

func (m *module) UpdatePublic(ctx context.Context, orgID valuer.UUID, config *dashboardtypes.PublicDashboard) error {
	existing, err := m.GetPublic(ctx, orgID, config.DashboardID)
	if err != nil {
		return err
	}
	if existing.ID != config.ID {
		return errors.Newf(errors.TypeNotFound, dashboardtypes.ErrCodePublicDashboardNotFound, "public dashboard not found")
	}
	existing.Update(config.TimeRangeEnabled, config.DefaultTimeRange)
	return m.store.UpdatePublic(ctx, dashboardtypes.NewStorablePublicDashboardFromPublicDashboard(existing))
}

func (m *module) DeletePublic(ctx context.Context, orgID, dashboardID valuer.UUID) error {
	if _, err := m.GetPublic(ctx, orgID, dashboardID); err != nil {
		return err
	}
	return m.store.DeletePublic(ctx, dashboardID.StringValue())
}

func (m *module) GetDashboardByPublicIDV2(ctx context.Context, id valuer.UUID) (*dashboardtypes.DashboardV2, error) {
	stored, err := m.store.GetDashboardByPublicID(ctx, id.StringValue())
	if err != nil {
		return nil, err
	}
	return m.GetV2(ctx, stored.OrgID, stored.ID)
}

func (m *module) GetPublicDashboardSelectorsAndOrg(ctx context.Context, id valuer.UUID, orgs []*types.Organization) ([]coretypes.Selector, valuer.UUID, error) {
	orgIDs := make([]string, len(orgs))
	for i, org := range orgs {
		orgIDs[i] = org.ID.StringValue()
	}
	if len(orgIDs) == 0 {
		return nil, valuer.UUID{}, errors.Newf(errors.TypeNotFound, dashboardtypes.ErrCodePublicDashboardNotFound, "public dashboard not found")
	}
	stored, err := m.store.GetDashboardByOrgsAndPublicID(ctx, orgIDs, id.StringValue())
	if err != nil {
		return nil, valuer.UUID{}, err
	}
	selectors, err := coretypes.IDSelector(ctx, coretypes.ResourceMetaResourcePublicDashboard, id.StringValue(), stored.OrgID)
	return selectors, stored.OrgID, err
}

func (m *module) GetPublicWidgetQueryRangeV2(ctx context.Context, id valuer.UUID, panelKey, startRaw, endRaw string) (*qb.QueryRangeResponse, error) {
	d, err := m.GetDashboardByPublicIDV2(ctx, id)
	if err != nil {
		return nil, err
	}
	config, err := m.GetPublic(ctx, d.OrgID, d.ID)
	if err != nil {
		return nil, err
	}
	// A revoked link must not use a replacement publication's settings.
	if config.ID != id {
		return nil, errors.Newf(errors.TypeNotFound, dashboardtypes.ErrCodePublicDashboardNotFound, "public dashboard not found")
	}
	start, end, err := config.ResolveTimeRange(startRaw, endRaw)
	if err != nil {
		return nil, err
	}
	req, err := d.GetPanelQuery(start, end, panelKey)
	if err != nil {
		return nil, err
	}
	return m.querier.QueryRange(ctx, d.OrgID, req)
}
