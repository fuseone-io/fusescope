package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"

	"github.com/fuseone-io/fusescope/pkg/modules/dashboard"
	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	"github.com/fuseone-io/fusescope/pkg/query-service/utils"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/cloudintegrationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/fuseone-io/fusescope/pkg/types/pipelinetypes"
	ruletypes "github.com/fuseone-io/fusescope/pkg/types/ruletypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type IntegrationAuthor struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	HomePage string `json:"homepage"`
}
type IntegrationSummary struct {
	Id          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"` // A short description

	Author IntegrationAuthor `json:"author"`

	Icon string `json:"icon"`
}

type IntegrationAssets struct {
	Logs       LogsAssets  `json:"logs"`
	Dashboards []Dashboard `json:"dashboards"`

	Alerts []Alert `json:"alerts"`
}

// Alert pairs a built-in alert rule's stable id with its definition; the id
// is the slug an installation owns the rule by, empty for an alert of a
// version 1 manifest, which is listed but not provisioned. It is read from
// the catalog document as {id, definition} and served as the bare rule, the
// shape the integrations API has always served.
type Alert struct {
	ID         string
	Definition ruletypes.PostableRule
}

func (a *Alert) UnmarshalJSON(data []byte) error {
	var fields struct {
		ID         string                 `json:"id"`
		Definition ruletypes.PostableRule `json:"definition"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&fields); err != nil {
		return err
	}
	a.ID, a.Definition = fields.ID, fields.Definition
	return nil
}

func (a Alert) MarshalJSON() ([]byte, error) {
	return json.Marshal(a.Definition)
}

// Dashboard pairs a built-in dashboard's stable id with its v2 definition. The id
// lives in integration.json alongside the definition file reference (mirroring the
// cloud integration model) and drives the install slug, so it stays stable even
// though the v2 definition blob no longer carries a top-level id.
type Dashboard struct {
	ID         string                             `json:"id"`
	Definition dashboardtypes.PostableDashboardV2 `json:"definition"`
}

type LogsAssets struct {
	Pipelines []pipelinetypes.PostablePipeline `json:"pipelines"`
}

type IntegrationConfigStep struct {
	Title        string `json:"title"`
	Instructions string `json:"instructions"`
}

type DataCollectedForIntegration struct {
	Logs    []CollectedLogAttribute `json:"logs"`
	Metrics []CollectedMetric       `json:"metrics"`
}

type CollectedLogAttribute struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"`
}

type CollectedMetric struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Unit        string `json:"unit"`
	Description string `json:"description"`
}

type SignalConnectionStatus struct {
	LastReceivedTsMillis int64  `json:"last_received_ts_ms"` // epoch milliseconds
	LastReceivedFrom     string `json:"last_received_from"`  // resource identifier
}

type IntegrationConnectionStatus struct {
	Logs    *SignalConnectionStatus `json:"logs"`
	Metrics *SignalConnectionStatus `json:"metrics"`
}

// log attribute value to use for finding logs for the integration.
type LogsConnectionTest struct {
	AttributeKey   string `json:"attribute_key"`
	AttributeValue string `json:"attribute_value"`
}

type IntegrationConnectionTests struct {
	Logs *LogsConnectionTest `json:"logs"`

	// Metric names expected to have been received for the integration.
	Metrics []string `json:"metrics"`
}

type IntegrationDetails struct {
	IntegrationSummary

	Categories    []string                    `json:"categories"`
	Overview      string                      `json:"overview"` // markdown
	Configuration []IntegrationConfigStep     `json:"configuration"`
	DataCollected DataCollectedForIntegration `json:"data_collected"`
	Assets        IntegrationAssets           `json:"assets"`

	ConnectionTests *IntegrationConnectionTests `json:"connection_tests"`

	// version is the catalog package version these details were rendered from.
	version string
}

// Version is the version an org is served: the installation's pin, or the
// latest for an integration the org has not installed.
type IntegrationsListItem struct {
	IntegrationSummary
	IsInstalled   bool   `json:"is_installed"`
	Version       string `json:"version"`
	LatestVersion string `json:"latest_version"`
}

type Integration struct {
	IntegrationDetails
	Version       string                                      `json:"version"`
	LatestVersion string                                      `json:"latest_version"`
	Installation  *cloudintegrationtypes.InstalledIntegration `json:"installation"`
}

type Manager struct {
	availableIntegrationsRepo AvailableIntegrationsRepo
	installedIntegrationsRepo InstalledIntegrationsRepo
	dashboardModule           dashboard.Module
	rules                     Rules
	logger                    *slog.Logger
	now                       func() time.Time
	// beforeStep, when set, runs before each change an operation makes, so
	// tests can interleave operations.
	beforeStep func()
}

func NewManager(store sqlstore.SQLStore, dashboardModule dashboard.Module, rules Rules, availableIntegrations AvailableIntegrationsRepo, logger *slog.Logger) (*Manager, error) {
	iiRepo, err := NewInstalledIntegrationsSqliteRepo(store)
	if err != nil {
		return nil, fmt.Errorf(
			"could not init sqlite DB for installed integrations: %w", err,
		)
	}

	return &Manager{
		availableIntegrationsRepo: availableIntegrations,
		installedIntegrationsRepo: iiRepo,
		dashboardModule:           dashboardModule,
		rules:                     rules,
		logger:                    logger,
		now:                       time.Now,
	}, nil
}

type IntegrationsFilter struct {
	IsInstalled *bool
}

func (m *Manager) ListIntegrations(
	ctx context.Context,
	orgId string,
	filter *IntegrationsFilter,
	// Expected to have pagination over time.
) ([]IntegrationsListItem, *model.ApiError) {
	available, apiErr := m.availableIntegrationsRepo.list(ctx)
	if apiErr != nil {
		return nil, model.WrapApiError(
			apiErr, "could not fetch available integrations",
		)
	}

	installed, apiErr := m.installedIntegrationsRepo.list(ctx, orgId)
	if apiErr != nil {
		return nil, model.WrapApiError(
			apiErr, "could not fetch installed integrations",
		)
	}
	pins := map[string]string{}
	for _, ii := range installed {
		pins[ii.Type] = ii.Version
	}

	result := []IntegrationsListItem{}
	for _, ai := range available {
		item := IntegrationsListItem{IntegrationSummary: ai.IntegrationSummary, Version: ai.version, LatestVersion: ai.version}
		if pin, isInstalled := pins[ai.Id]; isInstalled {
			served := m.servedDetails(ctx, ai, pin)
			item.IntegrationSummary = served.IntegrationSummary
			item.IsInstalled = true
			item.Version = served.version
		}
		result = append(result, item)
	}

	if filter != nil {
		if filter.IsInstalled != nil {
			filteredResult := []IntegrationsListItem{}
			for _, r := range result {
				if r.IsInstalled == *filter.IsInstalled {
					filteredResult = append(filteredResult, r)
				}
			}
			result = filteredResult
		}
	}

	return result, nil
}

func (m *Manager) GetIntegration(
	ctx context.Context,
	orgId string,
	integrationId string,
) (*Integration, *model.ApiError) {
	integrationDetails, apiErr := m.getIntegrationDetails(
		ctx, integrationId,
	)
	if apiErr != nil {
		return nil, apiErr
	}

	installation, apiErr := m.getInstalledIntegration(
		ctx, orgId, integrationId,
	)
	if apiErr != nil {
		return nil, apiErr
	}

	served := *integrationDetails
	if installation != nil {
		served = m.servedDetails(ctx, *integrationDetails, installation.Version)
	}
	return &Integration{
		IntegrationDetails: served,
		Version:            served.version,
		LatestVersion:      integrationDetails.version,
		Installation:       installation,
	}, nil
}

func (m *Manager) GetIntegrationConnectionTests(
	ctx context.Context,
	orgId string,
	integrationId string,
) (*IntegrationConnectionTests, *model.ApiError) {
	integration, apiErr := m.GetIntegration(ctx, orgId, integrationId)
	if apiErr != nil {
		return nil, apiErr
	}
	return integration.ConnectionTests, nil
}

func (m *Manager) InstallIntegration(
	ctx context.Context,
	orgId string,
	integrationId string,
	config cloudintegrationtypes.InstalledIntegrationConfig,
	createdBy string,
	creator valuer.UUID,
) (*IntegrationsListItem, *model.ApiError) {
	integrationDetails, apiErr := m.getIntegrationDetails(ctx, integrationId)
	if apiErr != nil {
		return nil, apiErr
	}

	orgUUID, err := valuer.NewUUID(orgId)
	if err != nil {
		return nil, model.BadRequest(fmt.Errorf("invalid org id: %w", err))
	}

	op, err := m.startOperation(ctx, orgUUID, integrationId, cloudintegrationtypes.IntegrationOperationStateActive)
	if err != nil {
		return nil, assetsApiError(err, "could not install integration")
	}
	defer m.endOperation(ctx, op)

	// A new installation pins the latest version; reinstalling keeps the pin.
	// The installation is recorded before its resources are made, so a
	// failure leaves it installed and installing again, or uninstalling,
	// completes the work.
	var installation *cloudintegrationtypes.InstalledIntegration
	if err := m.step(ctx, op, func(ctx context.Context) error {
		var apiErr *model.ApiError
		installation, apiErr = m.installedIntegrationsRepo.upsert(ctx, orgId, integrationId, integrationDetails.version, config)
		if apiErr != nil {
			return apiErr
		}
		return nil
	}); err != nil {
		return nil, assetsApiError(err, "could not insert installed integration")
	}
	served := m.servedDetails(ctx, *integrationDetails, installation.Version)
	if err := m.reconcileAssets(ctx, op, orgUUID, integrationId, &served, assetActor{name: createdBy, id: creator}); err != nil {
		return nil, assetsApiError(err, "could not install integration")
	}

	return &IntegrationsListItem{
		IntegrationSummary: served.IntegrationSummary,
		IsInstalled:        true,
		Version:            served.version,
		LatestVersion:      integrationDetails.version,
	}, nil
}

func (m *Manager) UninstallIntegration(
	ctx context.Context,
	orgId string,
	integrationId string,
) *model.ApiError {
	orgUUID, err := valuer.NewUUID(orgId)
	if err != nil {
		return model.BadRequest(fmt.Errorf("invalid org id: %w", err))
	}

	// While uninstalling, nothing installs or upgrades the integration. The
	// installation goes last, so an uninstallation that fails midway still
	// shows it installed, and uninstalling again finishes.
	op, err := m.startOperation(ctx, orgUUID, integrationId, cloudintegrationtypes.IntegrationOperationStateUninstalling)
	if err != nil {
		return assetsApiError(err, "could not uninstall integration")
	}
	defer m.endOperation(ctx, op)

	owned, err := m.installedIntegrationsRepo.listIntegrationAssets(ctx, orgId, integrationId)
	if err != nil {
		return model.WrapApiError(model.InternalError(err), "could not list the assets of the integration")
	}
	var errs []error
	for _, asset := range owned {
		if err := m.removeAsset(ctx, op, orgUUID, asset); err != nil {
			if lostOperation(err) {
				return assetsApiError(err, "could not uninstall integration")
			}
			errs = append(errs, err)
		}
	}
	if err := errors.Join(errs...); err != nil {
		return assetsApiError(err, "could not uninstall integration")
	}
	if err := m.step(ctx, op, func(ctx context.Context) error {
		if apiErr := m.installedIntegrationsRepo.delete(ctx, orgId, integrationId); apiErr != nil {
			return apiErr
		}
		return m.installedIntegrationsRepo.finishUninstallation(ctx, op, m.now())
	}); err != nil {
		return assetsApiError(err, "could not delete installed integration")
	}
	return nil
}

// assetsApiError reports a conflict when every failure is a conflict with
// another request, which retrying resolves, and an internal error otherwise.
func assetsApiError(err error, msg string) *model.ApiError {
	if onlyConflicts(err) {
		return model.WrapApiError(&model.ApiError{Typ: model.ErrorConflict, Err: err}, msg)
	}
	return model.WrapApiError(model.InternalError(err), msg)
}

func onlyConflicts(err error) bool {
	if joined, ok := err.(interface{ Unwrap() []error }); ok {
		for _, e := range joined.Unwrap() {
			if !onlyConflicts(e) {
				return false
			}
		}
		return len(joined.Unwrap()) > 0
	}
	return errors.Ast(err, errors.TypeAlreadyExists)
}

func (m *Manager) GetPipelinesForInstalledIntegrations(
	ctx context.Context,
	orgId string,
) ([]pipelinetypes.GettablePipeline, error) {
	installedIntegrations, apiErr := m.getInstalledIntegrations(ctx, orgId)
	if apiErr != nil {
		return nil, apiErr
	}

	gettablePipelines := []pipelinetypes.GettablePipeline{}
	for _, id := range slices.Sorted(maps.Keys(installedIntegrations)) {
		ii := installedIntegrations[id]
		for _, p := range ii.Assets.Logs.Pipelines {
			gettablePipelines = append(gettablePipelines, pipelinetypes.GettablePipeline{
				// Alias is used for identifying integration pipelines. Id can't be used for this
				// since versioning while saving pipelines requires a new id for each version
				// to avoid altering history when pipelines are edited/reordered etc
				StoreablePipeline: pipelinetypes.StoreablePipeline{
					Alias: AliasForIntegrationPipeline(ii.Id, p.Alias),
					Identifiable: types.Identifiable{
						ID: valuer.GenerateUUID(),
					},
					OrderID:     p.OrderID,
					Enabled:     p.Enabled,
					Name:        p.Name,
					Description: p.Description,
				},
				Filter: p.Filter,
				Config: p.Config,
			})
		}
	}

	return gettablePipelines, nil
}

// Helpers.
func (m *Manager) getIntegrationDetails(
	ctx context.Context,
	integrationId string,
) (*IntegrationDetails, *model.ApiError) {
	if len(strings.TrimSpace(integrationId)) < 1 {
		return nil, model.BadRequest(fmt.Errorf(
			"integrationId is required",
		))
	}

	ais, apiErr := m.availableIntegrationsRepo.get(
		ctx, []string{integrationId},
	)
	if apiErr != nil {
		return nil, model.WrapApiError(apiErr, fmt.Sprintf(
			"could not fetch integration: %s", integrationId,
		))
	}

	integrationDetails, wasFound := ais[integrationId]
	if !wasFound {
		return nil, model.NotFoundError(fmt.Errorf(
			"could not find integration: %s", integrationId,
		))
	}
	return &integrationDetails, nil
}

func (m *Manager) getInstalledIntegration(
	ctx context.Context,
	orgId string,
	integrationId string,
) (*cloudintegrationtypes.InstalledIntegration, *model.ApiError) {
	iis, apiErr := m.installedIntegrationsRepo.get(
		ctx, orgId, []string{integrationId},
	)
	if apiErr != nil {
		return nil, model.WrapApiError(apiErr, fmt.Sprintf(
			"could not fetch installed integration: %s", integrationId,
		))
	}

	installation, wasFound := iis[integrationId]
	if !wasFound {
		return nil, nil
	}
	return &installation, nil
}

func (m *Manager) getInstalledIntegrations(
	ctx context.Context,
	orgId string,
) (
	map[string]Integration, *model.ApiError,
) {
	installations, apiErr := m.installedIntegrationsRepo.list(ctx, orgId)
	if apiErr != nil {
		return nil, apiErr
	}

	installedTypes := utils.MapSlice(installations, func(i cloudintegrationtypes.InstalledIntegration) string {
		return i.Type
	})
	integrationDetails, apiErr := m.availableIntegrationsRepo.get(ctx, installedTypes)
	if apiErr != nil {
		return nil, apiErr
	}

	result := map[string]Integration{}
	for _, ii := range installations {
		iDetails, exists := integrationDetails[ii.Type]
		if !exists {
			return nil, model.InternalError(fmt.Errorf(
				"couldn't find integration details for %s", ii.Type,
			))
		}

		served := m.servedDetails(ctx, iDetails, ii.Version)
		result[ii.Type] = Integration{
			Installation:       &ii,
			IntegrationDetails: served,
			Version:            served.version,
			LatestVersion:      iDetails.version,
		}
	}
	return result, nil
}

// servedDetails returns the details pinned by an installation. A pin the
// catalog no longer holds is served the latest version.
func (m *Manager) servedDetails(ctx context.Context, latest IntegrationDetails, pin string) IntegrationDetails {
	if pin == "" || pin == latest.version {
		return latest
	}
	if pinned, ok := m.availableIntegrationsRepo.getVersion(ctx, latest.Id, pin); ok {
		return *pinned
	}
	m.logger.WarnContext(ctx, "pinned integration version is not in the catalog, serving the latest", slog.String("integration", latest.Id), slog.String("pinned_version", pin), slog.String("latest_version", latest.version))
	return latest
}
