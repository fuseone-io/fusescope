package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"unicode"

	"github.com/fuseone-io/fusescope/pkg/query-service/app/integrations/catalog"
	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	"golang.org/x/mod/semver"
)

// CatalogIntegrations serves the integrations of one or more loaded catalogs:
// today the snapshot embedded in the binary. A synced or private catalog is
// one more *catalog.Catalog passed to NewCatalogIntegrations.
type CatalogIntegrations struct {
	// versions holds every version of each integration, newest first.
	versions map[string][]catalogIntegration
}

type catalogIntegration struct {
	version string
	details IntegrationDetails
}

func NewCatalogIntegrations(catalogs ...*catalog.Catalog) (*CatalogIntegrations, error) {
	ci := &CatalogIntegrations{versions: map[string][]catalogIntegration{}}
	for _, c := range catalogs {
		for _, pkg := range c.Packages {
			details, err := decodeIntegration(pkg)
			if err != nil {
				return nil, fmt.Errorf("integration package %s@%s: %w", pkg.ID, pkg.Version, err)
			}
			if slices.ContainsFunc(ci.versions[pkg.ID], func(i catalogIntegration) bool { return i.version == pkg.Version }) {
				return nil, fmt.Errorf("integration package %s@%s is provided twice", pkg.ID, pkg.Version)
			}
			ci.versions[pkg.ID] = append(ci.versions[pkg.ID], catalogIntegration{version: pkg.Version, details: *details})
		}
	}
	for _, versions := range ci.versions {
		slices.SortFunc(versions, func(a, b catalogIntegration) int {
			return semver.Compare("v"+b.version, "v"+a.version)
		})
	}
	return ci, nil
}

func (ci *CatalogIntegrations) list(ctx context.Context) ([]IntegrationDetails, *model.ApiError) {
	integrations := make([]IntegrationDetails, 0, len(ci.versions))
	for _, versions := range ci.versions {
		integrations = append(integrations, versions[0].details)
	}
	slices.SortFunc(integrations, func(a, b IntegrationDetails) int {
		return strings.Compare(a.Id, b.Id)
	})
	return integrations, nil
}

func (ci *CatalogIntegrations) get(ctx context.Context, integrationIds []string) (map[string]IntegrationDetails, *model.ApiError) {
	result := map[string]IntegrationDetails{}
	for _, id := range integrationIds {
		if versions, ok := ci.versions[id]; ok {
			result[id] = versions[0].details
		}
	}
	return result, nil
}

// decodeIntegration decodes a package document as integration.json files were
// decoded: unknown fields are rejected and dashboards go through the v2
// dashboard validation.
func decodeIntegration(pkg catalog.Package) (*IntegrationDetails, error) {
	var integration IntegrationDetails
	decoder := json.NewDecoder(bytes.NewReader(pkg.Document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&integration); err != nil {
		return nil, err
	}
	if err := validateIntegration(integration); err != nil {
		return nil, err
	}

	if len(integration.DataCollected.Metrics) > 0 {
		if integration.ConnectionTests == nil {
			integration.ConnectionTests = &IntegrationConnectionTests{}
		}
		metricsForConnTest := []string{}
		for _, collectedMetric := range integration.DataCollected.Metrics {
			metricsForConnTest = append(metricsForConnTest, toPromMetricName(collectedMetric.Name))
		}
		integration.ConnectionTests.Metrics = metricsForConnTest
	}
	return &integration, nil
}

func validateIntegration(i IntegrationDetails) error {
	seenDashboardIds := map[string]struct{}{}
	for _, dd := range i.Assets.Dashboards {
		if dd.ID == "" {
			return fmt.Errorf("id is required for dashboard %q in integration %s", dd.Definition.Spec.Display.Name, i.Id)
		}
		if _, seen := seenDashboardIds[dd.ID]; seen {
			return fmt.Errorf("multiple dashboards found with id %s", dd.ID)
		}
		seenDashboardIds[dd.ID] = struct{}{}
	}
	return nil
}

// copied from signoz clickhouse exporter's `sanitize` which
// in turn is copied from prometheus-go-metric-exporter
//
// replaces non-alphanumeric characters with underscores in s.
func toPromMetricName(s string) string {
	if len(s) == 0 {
		return s
	}

	// Note: No length limit for label keys because Prometheus doesn't
	// define a length limit, thus we should NOT be truncating label keys.
	// See https://github.com/orijtech/prometheus-go-metrics-exporter/issues/4.

	s = strings.Map(func(r rune) rune {
		// sanitizeRune converts anything that is not a letter or digit to an underscore
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return r
		}
		// Everything else turns into an underscore
		return '_'
	}, s)

	if unicode.IsDigit(rune(s[0])) {
		s = "key" + "_" + s
	}
	if s[0] == '_' {
		s = "key" + s
	}
	return s
}
