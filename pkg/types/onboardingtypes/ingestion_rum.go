package onboardingtypes

import (
	"net/url"
	"strings"
)

// RUM uses a separate collector listener; OTLP configuration is never a fallback.
func (ingestion *Ingestion) SetRUMEndpoint(organizationURL string, configURL *url.URL) {
	ingestion.RUMEndpoint = ""
	ingestion.RUMSource = IngestionSourceDerived
	ingestion.RUMDerived = true
	ingestion.RUMOrganizationURL = nil
	ingestion.RUMConfigURL = nil
	if normalized, err := NormalizeRUMURL(organizationURL); err == nil && normalized != "" {
		ingestion.RUMOrganizationURL = &normalized
		ingestion.RUMEndpoint = normalized
		ingestion.RUMSource = IngestionSourceOrganization
	}
	if isSet(configURL) {
		if normalized, err := NormalizeRUMURL(configURL.String()); err == nil && normalized != "" {
			ingestion.RUMConfigURL = &normalized
			if ingestion.RUMEndpoint == "" {
				ingestion.RUMEndpoint = normalized
				ingestion.RUMSource = IngestionSourceConfig
			}
		}
	}
	ingestion.RUMDerived = ingestion.RUMSource == IngestionSourceDerived
}

func NormalizeRUMURL(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		return "", nil
	}
	parsed, err := parseIngestionURL(raw)
	if err != nil {
		return "", err
	}
	return strings.TrimSuffix(strings.TrimRight(parsed.String(), "/"), "/rum/v1"), nil
}
