package signozapiserver

import (
	"net/http"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/http/handler"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/gorilla/mux"
)

// rumPathPrefix serves the public ingestion gateway, which answers CORS itself.
const rumPathPrefix = "/rum/"

type rumRoute struct {
	path       string
	method     string
	handle     http.HandlerFunc
	verb       coretypes.Verb
	roles      []string
	openAPIDef handler.OpenAPIDef
}

func (provider *provider) addRUMRoutes(router *mux.Router) error {
	for _, route := range provider.rumRoutes() {
		route.openAPIDef.Tags = []string{"rum"}
		route.openAPIDef.SecuritySchemes = newScopedSecuritySchemes([]string{coretypes.ResourceMetaResourceRUMApplication.Scope(route.verb)})

		resourceDef := handler.BasicResourceDef{
			Resource: coretypes.ResourceMetaResourceRUMApplication,
			Verb:     route.verb,
			Category: coretypes.ActionCategoryConfigurationChange,
			ID:       coretypes.PathParam("id"),
			Selector: coretypes.IDSelector,
		}
		if strings.Contains(route.path, "/keys") && route.method != http.MethodGet {
			resourceDef.Category = coretypes.ActionCategoryAccessControl
		}
		switch route.verb {
		case coretypes.VerbList:
			resourceDef.ID, resourceDef.Selector = coretypes.ResourceIDExtractor{}, coretypes.WildcardSelector
		case coretypes.VerbCreate:
			resourceDef.ID, resourceDef.Selector = coretypes.ResponseJSONPath("data.id"), coretypes.WildcardSelector
		}

		if err := router.Handle(route.path, handler.New(
			provider.authzMiddleware.CheckResources(route.handle, route.roles...),
			route.openAPIDef,
			handler.WithResourceDefs(resourceDef),
		)).Methods(route.method).GetError(); err != nil {
			return err
		}
	}

	for path, handle := range map[string]http.HandlerFunc{
		"/rum/v1/traces": provider.rumGateway.Traces,
		"/rum/v1/logs":   provider.rumGateway.Logs,
	} {
		if err := router.HandleFunc(path, handle).Methods(http.MethodPost, http.MethodOptions).GetError(); err != nil {
			return err
		}
	}

	return nil
}

func (provider *provider) rumRoutes() []rumRoute {
	applications, application, keys := "/api/v1/rum/applications", "/api/v1/rum/applications/{id}", "/api/v1/rum/applications/{id}/keys"
	notFound := []int{http.StatusBadRequest, http.StatusNotFound}
	managers := []string{authtypes.SigNozAdminRoleName, authtypes.SigNozEditorRoleName}
	readers := []string{authtypes.SigNozAdminRoleName, authtypes.SigNozEditorRoleName, authtypes.SigNozViewerRoleName}

	return []rumRoute{
		{path: applications, method: http.MethodGet, handle: provider.rumApplicationHandler.List, verb: coretypes.VerbList, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "ListRUMApplications", Summary: "List RUM applications", Description: "Returns the organization's RUM applications.",
			Response: new([]*rumtypes.Application), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK,
		}},
		{path: applications, method: http.MethodPost, handle: provider.rumApplicationHandler.Create, verb: coretypes.VerbCreate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "CreateRUMApplication", Summary: "Create RUM application", Description: "Creates an application and its first public key. The key is returned only in this response.",
			Request: new(rumtypes.PostableApplication), RequestContentType: "application/json",
			Response: new(rumtypes.GettableCreatedApplication), ResponseContentType: "application/json", SuccessStatusCode: http.StatusCreated,
			ErrorStatusCodes: []int{http.StatusBadRequest, http.StatusConflict},
		}},
		{path: application, method: http.MethodGet, handle: provider.rumApplicationHandler.Get, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "GetRUMApplication", Summary: "Get RUM application", Description: "Returns a RUM application.",
			Response: new(rumtypes.Application), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: application, method: http.MethodPut, handle: provider.rumApplicationHandler.Update, verb: coretypes.VerbUpdate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "UpdateRUMApplication", Summary: "Update RUM application", Description: "Replaces a RUM application's settings. The platform cannot change.",
			Request: new(rumtypes.UpdatableApplication), RequestContentType: "application/json",
			Response: new(rumtypes.Application), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK,
			ErrorStatusCodes: []int{http.StatusBadRequest, http.StatusNotFound, http.StatusConflict},
		}},
		{path: application, method: http.MethodDelete, handle: provider.rumApplicationHandler.Delete, verb: coretypes.VerbDelete, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "DeleteRUMApplication", Summary: "Delete RUM application", Description: "Deletes a RUM application and its keys. Ingested telemetry is kept.",
			SuccessStatusCode: http.StatusNoContent, ErrorStatusCodes: notFound,
		}},
		{path: application + "/status", method: http.MethodGet, handle: provider.rumApplicationHandler.Status, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "GetRUMApplicationStatus", Summary: "Get RUM application setup status", Description: "Returns what the gateway saw for the application over the last five minutes, the SDK versions this server supports and refused requests by reason. Counts are kept in memory by the server instance that answers.",
			Response: new(rumtypes.GettableApplicationStatus), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: keys, method: http.MethodGet, handle: provider.rumApplicationHandler.ListKeys, verb: coretypes.VerbRead, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "ListRUMApplicationKeys", Summary: "List RUM application keys", Description: "Returns the application's usable keys: the active one and, during a rotation, the expiring one.",
			Response: new([]*rumtypes.GettableApplicationKey), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: keys, method: http.MethodPost, handle: provider.rumApplicationHandler.CreateKey, verb: coretypes.VerbUpdate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "CreateRUMApplicationKey", Summary: "Create RUM application key", Description: "Creates a key for an application that has none left, e.g. after a revoke. Use rotate otherwise. The key is returned only in this response.",
			Response: new(rumtypes.GettableCreatedApplicationKey), ResponseContentType: "application/json", SuccessStatusCode: http.StatusCreated,
			ErrorStatusCodes: []int{http.StatusBadRequest, http.StatusNotFound, http.StatusConflict},
		}},
		{path: keys + "/{keyId}/rotate", method: http.MethodPost, handle: provider.rumApplicationHandler.RotateKey, verb: coretypes.VerbUpdate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "RotateRUMApplicationKey", Summary: "Rotate RUM application key", Description: "Issues a new key and keeps the current one working for the overlap. One rotation runs at a time. The new key is returned only in this response.",
			Request: new(rumtypes.PostableRotateApplicationKey), RequestContentType: "application/json",
			Response: new(rumtypes.GettableCreatedApplicationKey), ResponseContentType: "application/json", SuccessStatusCode: http.StatusCreated,
			ErrorStatusCodes: []int{http.StatusBadRequest, http.StatusNotFound, http.StatusConflict},
		}},
		{path: keys + "/{keyId}", method: http.MethodDelete, handle: provider.rumApplicationHandler.RevokeKey, verb: coretypes.VerbUpdate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "RevokeRUMApplicationKey", Summary: "Revoke RUM application key", Description: "Revokes a key at once, e.g. to end a rotation's overlap early.",
			SuccessStatusCode: http.StatusNoContent, ErrorStatusCodes: notFound,
		}},
	}
}
