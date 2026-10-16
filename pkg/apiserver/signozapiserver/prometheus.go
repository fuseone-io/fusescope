package signozapiserver

import (
	"net/http"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/http/handler"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/prometheus"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"github.com/gorilla/mux"
	openapi "github.com/swaggest/openapi-go"
)

// prometheusOpenAPIHandler skips the default handler wrapper: that wraps
// every response in the house envelope, and these endpoints follow
// Prometheus' wire contract, described by the prometheus package's *Schema
// types.
type prometheusOpenAPIHandler struct {
	handlerFunc http.HandlerFunc
	id          string
	summary     string
	params      any
}

func (h *prometheusOpenAPIHandler) ServeHTTP(rw http.ResponseWriter, req *http.Request) {
	h.handlerFunc.ServeHTTP(rw, req)
}

func (h *prometheusOpenAPIHandler) ServeOpenAPI(opCtx openapi.OperationContext) {
	// One route serves GET and POST; operation IDs must stay unique.
	id := h.id
	if strings.EqualFold(opCtx.Method(), http.MethodPost) {
		id += "Post"
	}
	opCtx.SetID(id)
	opCtx.SetTags("prometheus")
	opCtx.SetSummary(h.summary)
	opCtx.SetDescription("Prometheus-compatible endpoint: the request and response contract is the upstream Prometheus HTTP API (https://prometheus.io/docs/prometheus/latest/querying/api/). Parameters are accepted as URL query parameters or a form-encoded body, on GET and POST alike.")

	for _, scheme := range newScopedSecuritySchemes([]string{coretypes.ResourceTelemetryResourceMetrics.Scope(coretypes.VerbRead)}) {
		opCtx.AddSecurity(scheme.Name, scheme.Scopes...)
	}

	opCtx.AddReqStructure(h.params)

	opCtx.AddRespStructure(
		prometheus.SuccessResponseSchema{},
		openapi.WithContentType("application/json"),
		openapi.WithHTTPStatus(http.StatusOK),
	)
	for _, statusCode := range []int{http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusServiceUnavailable, http.StatusInternalServerError} {
		opCtx.AddRespStructure(
			prometheus.ErrorResponseSchema{},
			openapi.WithContentType("application/json"),
			openapi.WithHTTPStatus(statusCode),
		)
	}
	// The auth middleware answers before the handler and uses the house
	// envelope, not Prometheus'.
	for _, statusCode := range []int{http.StatusUnauthorized, http.StatusForbidden} {
		opCtx.AddRespStructure(
			render.ErrorResponse{Status: render.StatusError.String(), Error: &errors.JSON{}},
			openapi.WithContentType("application/json"),
			openapi.WithHTTPStatus(statusCode),
		)
	}
}

func (h *prometheusOpenAPIHandler) ResourceDefs() []handler.ResourceDef {
	return []handler.ResourceDef{handler.TelemetryResourceDef{
		Verb:      coretypes.VerbRead,
		Category:  coretypes.ActionCategoryDataAccess,
		Selector:  querybuilder.TelemetrySelector,
		Resources: querybuilder.PromQLResources,
	}}
}

func (provider *provider) addPrometheusRoutes(router *mux.Router) error {
	if err := router.Handle("/prometheus/api/v1/query", &prometheusOpenAPIHandler{
		handlerFunc: provider.authzMiddleware.CheckResources(provider.prometheusHandler.Query, authtypes.SigNozAdminRoleName, authtypes.SigNozEditorRoleName, authtypes.SigNozViewerRoleName),
		id:          "PrometheusQuery",
		summary:     "Prometheus instant query",
		params:      new(prometheus.QueryParamsSchema),
	}).Methods(http.MethodGet, http.MethodPost).GetError(); err != nil {
		return err
	}

	if err := router.Handle("/prometheus/api/v1/query_range", &prometheusOpenAPIHandler{
		handlerFunc: provider.authzMiddleware.CheckResources(provider.prometheusHandler.QueryRange, authtypes.SigNozAdminRoleName, authtypes.SigNozEditorRoleName, authtypes.SigNozViewerRoleName),
		id:          "PrometheusQueryRange",
		summary:     "Prometheus range query",
		params:      new(prometheus.QueryRangeParamsSchema),
	}).Methods(http.MethodGet, http.MethodPost).GetError(); err != nil {
		return err
	}

	return nil
}
