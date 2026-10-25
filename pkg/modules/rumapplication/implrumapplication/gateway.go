package implrumapplication

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// The key travels in a header, or in a query parameter for navigator.sendBeacon,
// which cannot set headers.
const (
	KeyHeader     = "FuseScope-RUM-Key"
	KeyQueryParam = "fusescope_rum_key"
)

const (
	preflightMaxAge = 24 * time.Hour
	allowedHeaders  = "content-type, content-encoding, fusescope-rum-key"
)

var (
	ErrCodeGatewayDisabled   = errors.MustNewCode("rum_gateway_disabled")
	ErrCodeOriginNotAllowed  = errors.MustNewCode("rum_origin_not_allowed")
	ErrCodePackageNotAllowed = errors.MustNewCode("rum_package_not_allowed")
	ErrCodeRateLimited       = errors.MustNewCode("rum_rate_limited")
	ErrCodePayloadTooLarge   = errors.MustNewCode("rum_payload_too_large")
	ErrCodePayloadInvalid    = errors.MustNewCode("rum_payload_invalid")
	ErrCodeCollector         = errors.MustNewCode("rum_collector_unavailable")
)

type gateway struct {
	module        rumapplication.Module
	config        rumapplication.Config
	client        *http.Client
	keyLimiter    *rateLimiter
	clientLimiter *rateLimiter
	settings      factory.ScopedProviderSettings
}

// rejection is a refused request the setup screen reports, with the value
// it was refused for when not the origin.
type rejection struct {
	err      error
	reason   rumtypes.RejectionReason
	observed string
}

func NewGateway(module rumapplication.Module, config rumapplication.Config, providerSettings factory.ProviderSettings) rumapplication.Gateway {
	return &gateway{
		module:        module,
		config:        config,
		client:        &http.Client{Timeout: config.ForwardTimeout},
		keyLimiter:    newRateLimiter(config.RateLimit.Key),
		clientLimiter: newRateLimiter(config.RateLimit.Client),
		settings:      factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/rumapplication/implrumapplication"),
	}
}

func (gateway *gateway) Traces(rw http.ResponseWriter, req *http.Request) {
	gateway.serve(rw, req, tracesSignal)
}

func (gateway *gateway) Logs(rw http.ResponseWriter, req *http.Request) {
	gateway.serve(rw, req, logsSignal)
}

func (gateway *gateway) serve(rw http.ResponseWriter, req *http.Request, signal otlpSignal) {
	rw.Header().Add("Vary", "Origin")
	if !gateway.config.Enabled {
		render.Error(rw, errors.NewNotFoundf(ErrCodeGatewayDisabled, "rum ingestion is disabled"))
		return
	}

	if req.Method == http.MethodOptions {
		gateway.preflight(rw, req)
		return
	}

	origin := req.Header.Get("Origin")
	key := keyFromRequest(req)
	application, keyID, err := gateway.module.Authenticate(req.Context(), key)
	if err != nil {
		gateway.observeKeyRejection(req, application, key, origin, err)
		render.Error(rw, err)
		return
	}

	if origin != "" {
		if !application.AllowsOrigin(origin) {
			gateway.module.ObserveRejection(application.ID, rumtypes.RejectionReasonOriginNotAllowed, origin)
			render.Error(rw, errors.NewForbiddenf(ErrCodeOriginNotAllowed, "origin %q is not allowed for this application", origin))
			return
		}
		rw.Header().Set("Access-Control-Allow-Origin", origin)
	}

	response, encoding, refused := gateway.accept(req, application, keyID, signal)
	if refused != nil {
		if refused.reason != (rumtypes.RejectionReason{}) {
			observed := origin
			if refused.reason == rumtypes.RejectionReasonPackageNotAllowed {
				observed = refused.observed
			}
			gateway.module.ObserveRejection(application.ID, refused.reason, observed)
		}
		writeError(rw, refused.err)
		return
	}

	rw.Header().Set("Content-Type", encoding.contentType())
	rw.WriteHeader(http.StatusOK)
	_, _ = rw.Write(response)
}

// observeKeyRejection ties an unknown key to the applications that allow the
// request's origin, since the key itself names none.
func (gateway *gateway) observeKeyRejection(req *http.Request, application *rumtypes.Application, key string, origin string, err error) {
	if application != nil {
		gateway.module.ObserveRejection(application.ID, rumtypes.RejectionReasonBadKey, origin)
		return
	}
	if key == "" || origin == "" || !errors.Asc(err, rumtypes.ErrCodeKeyInvalid) {
		return
	}
	for _, applicationID := range gateway.module.ApplicationsAllowingOrigin(req.Context(), origin) {
		gateway.module.ObserveRejection(applicationID, rumtypes.RejectionReasonUnknownKey, origin)
	}
}

// accept rate-limits, decodes, processes and forwards an authenticated request.
func (gateway *gateway) accept(req *http.Request, application *rumtypes.Application, keyID valuer.UUID, signal otlpSignal) ([]byte, otlpEncoding, *rejection) {
	now := time.Now()
	clientIdentity := keyID.StringValue() + "|" + gateway.clientIP(req)
	if !gateway.keyLimiter.Allow(keyID.StringValue(), now) || !gateway.clientLimiter.Allow(clientIdentity, now) {
		err := errors.Newf(errors.TypeTooManyRequests, ErrCodeRateLimited, "rate limit exceeded").WithRetryAfter(time.Second)
		return nil, encodingProtobuf, &rejection{err: err, reason: rumtypes.RejectionReasonRateLimited}
	}

	encoding, err := encodingOf(req.Header.Get("Content-Type"))
	if err != nil {
		return nil, encoding, &rejection{err: err, reason: rumtypes.RejectionReasonInvalidPayload}
	}

	body, err := readBody(req, gateway.config.MaxBodySize)
	if err != nil {
		reason := rumtypes.RejectionReasonInvalidPayload
		if errors.Asc(err, ErrCodePayloadTooLarge) {
			reason = rumtypes.RejectionReasonTooLarge
		}
		return nil, encoding, &rejection{err: err, reason: reason}
	}

	payload, batch, refused := signal.process(application, body, encoding)
	if refused != nil {
		return nil, encoding, refused
	}

	if err := gateway.forward(req.Context(), signal.path, payload); err != nil {
		return nil, encoding, &rejection{err: err}
	}

	gateway.module.ObserveIngest(application, keyID, batch)

	response, err := signal.response(encoding)
	if err != nil {
		return nil, encoding, &rejection{err: err}
	}
	return response, encoding, nil
}

// preflight carries no key unless the beacon query parameter is used, so an
// origin is accepted when any application allows it; the POST is checked
// against the key's application.
func (gateway *gateway) preflight(rw http.ResponseWriter, req *http.Request) {
	origin := req.Header.Get("Origin")
	allowed := false
	if origin != "" && req.Header.Get("Access-Control-Request-Method") == http.MethodPost {
		if key := req.URL.Query().Get(KeyQueryParam); key != "" {
			application, _, err := gateway.module.Authenticate(req.Context(), key)
			allowed = err == nil && application.AllowsOrigin(origin)
		} else {
			allowed = len(gateway.module.ApplicationsAllowingOrigin(req.Context(), origin)) > 0
		}
	}

	if !allowed {
		render.Error(rw, errors.NewForbiddenf(ErrCodeOriginNotAllowed, "origin %q is not allowed", origin))
		return
	}

	header := rw.Header()
	header.Set("Access-Control-Allow-Origin", origin)
	header.Set("Access-Control-Allow-Methods", http.MethodPost)
	header.Set("Access-Control-Allow-Headers", allowedHeaders)
	header.Set("Access-Control-Max-Age", strconv.Itoa(int(preflightMaxAge.Seconds())))
	rw.WriteHeader(http.StatusNoContent)
}

func (gateway *gateway) clientIP(req *http.Request) string {
	if gateway.config.RateLimit.TrustForwardedFor {
		if forwarded := req.Header.Get("X-Forwarded-For"); forwarded != "" {
			first, _, _ := strings.Cut(forwarded, ",")
			return strings.TrimSpace(first)
		}
	}

	host, _, err := net.SplitHostPort(req.RemoteAddr)
	if err != nil {
		return req.RemoteAddr
	}
	return host
}

func keyFromRequest(req *http.Request) string {
	if key := req.Header.Get(KeyHeader); key != "" {
		return key
	}
	return req.URL.Query().Get(KeyQueryParam)
}
