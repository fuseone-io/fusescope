package signozapiserver

import (
	"net/http"

	"github.com/fuseone-io/fusescope/pkg/http/handler"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/onboardingtypes"
	"github.com/gorilla/mux"
)

func (provider *provider) addOnboardingRoutes(router *mux.Router) error {
	if err := router.Handle("/api/v1/onboarding/status", handler.New(provider.authzMiddleware.ViewAccess(provider.onboardingHandler.GetStatus), handler.OpenAPIDef{
		ID:                  "GetOnboardingStatus",
		Tags:                []string{"onboarding"},
		Summary:             "Get onboarding status",
		Description:         "Reports, per signal, whether telemetry arrived in a window of at most 24 hours: count, first and last seen. Filter on service.name to wait for one service. Poll it while a user sets up a source.",
		RequestQuery:        new(onboardingtypes.QueryableStatus),
		Response:            new(onboardingtypes.Status),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusOK,
		ErrorStatusCodes:    []int{http.StatusBadRequest},
		SecuritySchemes:     newSecuritySchemes(types.RoleViewer),
	})).Methods(http.MethodGet).GetError(); err != nil {
		return err
	}

	if err := router.Handle("/api/v1/onboarding/ingestion", handler.New(provider.authzMiddleware.ViewAccess(provider.onboardingHandler.GetIngestion), handler.OpenAPIDef{
		ID:                  "GetOnboardingIngestion",
		Tags:                []string{"onboarding"},
		Summary:             "Get ingestion settings",
		Description:         "Returns the OTLP endpoints exporters send to. An admin's URL wins over global.ingestion_url, which wins over endpoints derived from the external URL on ports 4317 and 4318.",
		Response:            new(onboardingtypes.Ingestion),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusOK,
		SecuritySchemes:     newSecuritySchemes(types.RoleViewer),
	})).Methods(http.MethodGet).GetError(); err != nil {
		return err
	}

	if err := router.Handle("/api/v1/onboarding/ingestion", handler.New(provider.authzMiddleware.AdminAccess(provider.onboardingHandler.UpdateIngestion), handler.OpenAPIDef{
		ID:                  "UpdateOnboardingIngestion",
		Tags:                []string{"onboarding"},
		Summary:             "Update ingestion settings",
		Description:         "Sets the organization's OTLP/HTTP ingestion URL, which overrides global.ingestion_url. An empty URL removes the override.",
		Request:             new(onboardingtypes.UpdatableIngestion),
		RequestContentType:  "application/json",
		Response:            new(onboardingtypes.Ingestion),
		ResponseContentType: "application/json",
		SuccessStatusCode:   http.StatusOK,
		ErrorStatusCodes:    []int{http.StatusBadRequest},
		SecuritySchemes:     newSecuritySchemes(types.RoleAdmin),
	})).Methods(http.MethodPut).GetError(); err != nil {
		return err
	}

	return nil
}
