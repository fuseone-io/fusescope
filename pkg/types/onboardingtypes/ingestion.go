package onboardingtypes

import (
	"net"
	"net/url"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	otlpGRPCPort       = "4317"
	otlpHTTPPort       = "4318"
	defaultHost        = "localhost"
	unsetHost          = "<unset>"
	maxIngestionURLLen = 2048
)

var ErrCodeInvalidIngestionURL = errors.MustNewCode("onboarding_invalid_ingestion_url")

var (
	IngestionSourceOrganization = IngestionSource{valuer.NewString("organization")}
	IngestionSourceConfig       = IngestionSource{valuer.NewString("config")}
	IngestionSourceDerived      = IngestionSource{valuer.NewString("derived")}
)

type IngestionSource struct{ valuer.String }

type Ingestion struct {
	OTLPHTTPEndpoint string           `json:"otlpHttpEndpoint" required:"true" description:"Base URL for OTLP/HTTP exporters (OTEL_EXPORTER_OTLP_ENDPOINT); /v1/traces, /v1/metrics and /v1/logs are appended."`
	OTLPGRPCEndpoint string           `json:"otlpGrpcEndpoint" required:"true" description:"host:port for OTLP/gRPC exporters."`
	OTLPGRPCInsecure bool             `json:"otlpGrpcInsecure" required:"true" description:"True when the gRPC endpoint is plaintext (tls.insecure in a collector exporter)."`
	Source           IngestionSource  `json:"source" required:"true" description:"Where the endpoints come from: an admin's override, global.ingestion_url, or derived from the external URL."`
	Derived          bool             `json:"derived" required:"true" description:"True when source is derived: nothing was configured and the endpoints are a guess on the default ports."`
	AuthRequired     bool             `json:"authRequired" required:"true" description:"Whether exporters must send an ingestion key."`
	OrganizationURL  *string          `json:"organizationUrl" required:"true" nullable:"true" description:"The URL an admin set, which overrides global.ingestion_url."`
	ConfigURL        *string          `json:"configUrl" required:"true" nullable:"true" description:"global.ingestion_url, when set."`
	Collector        *CollectorHealth `json:"collector" required:"true" nullable:"true" description:"Whether the backend reaches the collector it forwards RUM telemetry to. Null when the RUM gateway is disabled, as the backend knows no collector address then."`
}

type CollectorHealth struct {
	Endpoint  string `json:"endpoint" required:"true" description:"rum.collector_endpoint."`
	Reachable bool   `json:"reachable" required:"true" description:"True when the OTLP/HTTP receiver answered."`
}

type UpdatableIngestion struct {
	IngestionURL string `json:"ingestionUrl" required:"true" description:"OTLP/HTTP base URL, e.g. https://otlp.example.com or http://collector:4318. Empty removes the override."`
}

func (IngestionSource) Enum() []any {
	return []any{IngestionSourceOrganization, IngestionSourceConfig, IngestionSourceDerived}
}

// NewIngestion resolves the endpoints: the organization's URL wins over
// global.ingestion_url, which wins over a guess from the external URL (or
// the request host) on the default OTLP ports. An organization URL that does
// not parse is ignored.
func NewIngestion(organizationURL string, configURL *url.URL, externalURL *url.URL, requestHost string) *Ingestion {
	ingestion := &Ingestion{AuthRequired: false}
	if organizationURL != "" {
		ingestion.OrganizationURL = &organizationURL
	}
	if isSet(configURL) {
		configured := strings.TrimRight(configURL.String(), "/")
		ingestion.ConfigURL = &configured
	}

	if parsed, err := parseIngestionURL(organizationURL); err == nil {
		ingestion.Source = IngestionSourceOrganization
		ingestion.setEndpoints(parsed)
		return ingestion
	}

	if isSet(configURL) {
		ingestion.Source = IngestionSourceConfig
		ingestion.setEndpoints(configURL)
		return ingestion
	}

	host := hostname(requestHost)
	if isSet(externalURL) {
		host = externalURL.Hostname()
	}
	if host == "" {
		host = defaultHost
	}

	ingestion.Source = IngestionSourceDerived
	ingestion.Derived = true
	ingestion.OTLPHTTPEndpoint = "http://" + net.JoinHostPort(host, otlpHTTPPort)
	ingestion.OTLPGRPCEndpoint = net.JoinHostPort(host, otlpGRPCPort)
	ingestion.OTLPGRPCInsecure = true
	return ingestion
}

// Normalize returns the URL to store, empty to remove the override.
func (updatable *UpdatableIngestion) Normalize() (string, error) {
	if strings.TrimSpace(updatable.IngestionURL) == "" {
		return "", nil
	}

	parsed, err := parseIngestionURL(updatable.IngestionURL)
	if err != nil {
		return "", err
	}

	return strings.TrimRight(parsed.String(), "/"), nil
}

// setEndpoints maps an OTLP/HTTP URL to its gRPC peer: 4318 becomes 4317,
// another explicit port is kept, and no port means 443 over https (an ingress)
// or 4317 over http.
func (ingestion *Ingestion) setEndpoints(u *url.URL) {
	ingestion.OTLPHTTPEndpoint = strings.TrimRight((&url.URL{Scheme: u.Scheme, Host: u.Host, Path: u.Path}).String(), "/")

	secure := strings.EqualFold(u.Scheme, "https")
	port := u.Port()
	switch {
	case port == otlpHTTPPort:
		port = otlpGRPCPort
	case port != "":
	case secure:
		port = "443"
	default:
		port = otlpGRPCPort
	}

	ingestion.OTLPGRPCEndpoint = net.JoinHostPort(u.Hostname(), port)
	ingestion.OTLPGRPCInsecure = !secure
}

func parseIngestionURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.NewInvalidInputf(ErrCodeInvalidIngestionURL, "ingestion URL is empty")
	}
	if len(raw) > maxIngestionURLLen {
		return nil, errors.NewInvalidInputf(ErrCodeInvalidIngestionURL, "ingestion URL must be at most %d characters", maxIngestionURLLen)
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, ErrCodeInvalidIngestionURL, "ingestion URL is not a valid URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.NewInvalidInputf(ErrCodeInvalidIngestionURL, "ingestion URL must start with http:// or https://")
	}
	if parsed.Hostname() == "" {
		return nil, errors.NewInvalidInputf(ErrCodeInvalidIngestionURL, "ingestion URL must have a host")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.NewInvalidInputf(ErrCodeInvalidIngestionURL, "ingestion URL must not contain credentials, a query or a fragment")
	}

	return parsed, nil
}

// isSet treats a missing host as unset: the "<unset>" default decodes as a path.
func isSet(u *url.URL) bool {
	return u != nil && u.Host != "" && u.Host != unsetHost
}

func hostname(hostport string) string {
	if host, _, err := net.SplitHostPort(hostport); err == nil {
		return host
	}

	return strings.Trim(hostport, "[]")
}
