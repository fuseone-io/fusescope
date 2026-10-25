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
	views, errorGroups, sessions, sourceMaps, mappings := application+"/views", application+"/errors", application+"/sessions", application+"/sourcemaps", application+"/mappings"
	query := " Defaults to the last 24 hours; ranges are at most 31 days. release and environment filter on service.version and deployment.environment.name."
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
		{path: views, method: http.MethodGet, handle: provider.rumApplicationHandler.ListViews, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "ListRUMViews", Summary: "List RUM views by route", Description: "Returns per route template the views by loading type, the median time on view, the p75 and rating split of lcp, inp and cls, the error count and the request template with the highest p75." + query,
			RequestQuery: new(rumtypes.ListViewsParams),
			Response:     new(rumtypes.GettableViews), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: views + "/{route}", method: http.MethodGet, handle: provider.rumApplicationHandler.GetView, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "GetRUMView", Summary: "Get RUM view", Description: "Returns one route template, percent-encoded in the path (/product/:id is %2Fproduct%2F%3Aid): vitals p75 per time bucket, releases, the slowest request templates with an example trace, browser and OS breakdowns with LCP p75 and the latest sessions on the route. A route without views in the range is not found." + query,
			RequestQuery: new(rumtypes.GetViewParams),
			Response:     new(rumtypes.GettableView), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: errorGroups, method: http.MethodGet, handle: provider.rumApplicationHandler.ListErrorGroups, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "ListRUMErrorGroups", Summary: "List RUM error groups", Description: "Groups error events by fingerprint: exception type, message with numbers, ids and URLs replaced, and the top frame's file and function. First seen and new in release look back 30 days, or the retention if shorter, and ignore the release filter." + query,
			RequestQuery: new(rumtypes.ListErrorGroupsParams),
			Response:     new(rumtypes.GettableErrorGroups), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: errorGroups + "/{fingerprint}", method: http.MethodGet, handle: provider.rumApplicationHandler.GetErrorGroup, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "GetRUMErrorGroup", Summary: "Get RUM error group", Description: "Returns an error group with its latest events and raw stack traces, the selected event's breadcrumbs and linked failed request, and the latest affected sessions. Event frames carry their original position when the event's release has uploaded source maps; missingSourceMap is set when it has none." + query,
			RequestQuery: new(rumtypes.GetErrorGroupParams),
			Response:     new(rumtypes.GettableErrorGroup), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: sessions, method: http.MethodGet, handle: provider.rumApplicationHandler.ListSessions, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "ListRUMSessions", Summary: "List RUM sessions", Description: "Returns sessions newest first, with views, actions, errors, client, release and the previous session." + query,
			RequestQuery: new(rumtypes.ListSessionsParams),
			Response:     new(rumtypes.GettableSessions), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: sessions + "/{sessionId}", method: http.MethodGet, handle: provider.rumApplicationHandler.GetSession, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "GetRUMSession", Summary: "Get RUM session", Description: "Returns a session's timeline: its views in order, each with the requests, clicks, actions, errors and vitals that happened on it. Requests carry their trace id and whether backend spans share the trace. Defaults to the last 24 hours; ranges are at most 31 days. release is ignored, since a session can span releases; environment filters on deployment.environment.name.",
			RequestQuery: new(rumtypes.GetSessionParams),
			Response:     new(rumtypes.GettableSession), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: sourceMaps, method: http.MethodPost, handle: provider.rumApplicationHandler.UploadSourceMaps, verb: coretypes.VerbUpdate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "UploadRUMSourceMaps", Summary: "Upload RUM source maps", Description: "Stores source maps for a release, from multipart/form-data: each part named by the URL path its map is served from (e.g. /assets/index-abc.js.map) is a map; a part named file uses its filename as that path instead. The map matches the bundle at its path without .map, or a bundle served under a prefix. An optional debug_ids field maps URL paths to debug IDs. release comes from the query, or from a release field before the first map. A map replaces the release's map with the same path. A map that is not version 3 JSON, empty or larger than the file limit (50 MB by default) is returned in rejected and the others are stored. More than 1,000 maps in the release (400) or more than the application's quota, 2 GB by default (413), stores nothing. Use an API key with the Editor role in SigNoz-Api-Key; the public RUM key is not accepted.",
			Request: new(rumtypes.PostableSourceMaps), RequestContentType: "multipart/form-data", RequestQuery: new(rumtypes.PostableSourceMapsParams),
			Response: new(rumtypes.GettableUploadedSourceMaps), ResponseContentType: "application/json", SuccessStatusCode: http.StatusCreated,
			ErrorStatusCodes: []int{http.StatusBadRequest, http.StatusNotFound, http.StatusRequestEntityTooLarge},
		}},
		{path: mappings, method: http.MethodPost, handle: provider.rumApplicationHandler.UploadR8Mapping, verb: coretypes.VerbUpdate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "UploadRUMR8Mapping", Summary: "Upload RUM R8 mapping", Description: "Stores the R8 or ProGuard mapping.txt of an Android application's release, replacing the release's mapping if it has one. JVM stack traces of events whose service.version equals the release are retraced with it when read. The body is the mapping itself (any content type but multipart, optionally with Content-Encoding: gzip), or multipart/form-data with the mapping in a part named file and the release in a release field. release comes from the query, or from that field. A body that is not a mapping, empty or larger than the file limit (50 MB by default, after decompression) is refused with 400; more than the application's quota, 2 GB by default, with 413. Uploads share the source map store, limits and retention, and are listed and deleted with the sourcemaps endpoints. Use an API key with the Editor role in SigNoz-Api-Key; the public RUM key is not accepted.",
			Request: new(rumtypes.PostableR8Mapping), RequestContentType: "multipart/form-data", RequestQuery: new(rumtypes.PostableR8MappingParams),
			Response: new(rumtypes.GettableUploadedSourceMaps), ResponseContentType: "application/json", SuccessStatusCode: http.StatusCreated,
			ErrorStatusCodes: []int{http.StatusBadRequest, http.StatusNotFound, http.StatusRequestEntityTooLarge},
		}},
		{path: sourceMaps, method: http.MethodGet, handle: provider.rumApplicationHandler.ListSourceMaps, verb: coretypes.VerbRead, roles: readers, openAPIDef: handler.OpenAPIDef{
			ID: "ListRUMSourceMaps", Summary: "List RUM source maps", Description: "Returns the application's releases with source maps or R8 mappings, newest upload first, with their size, uploader, last use and expiry, plus the storage used, the limits and the retention settings. With release, returns that release and its files.",
			RequestQuery: new(rumtypes.ListSourceMapsParams),
			Response:     new(rumtypes.GettableSourceMaps), ResponseContentType: "application/json", SuccessStatusCode: http.StatusOK, ErrorStatusCodes: notFound,
		}},
		{path: sourceMaps, method: http.MethodDelete, handle: provider.rumApplicationHandler.DeleteSourceMaps, verb: coretypes.VerbUpdate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "DeleteRUMSourceMaps", Summary: "Delete RUM source maps of a release", Description: "Deletes every source map of the release. Its events are kept and show minified frames again.",
			RequestQuery: new(rumtypes.DeleteSourceMapsParams), SuccessStatusCode: http.StatusNoContent, ErrorStatusCodes: notFound,
		}},
		{path: sourceMaps + "/{fileId}", method: http.MethodDelete, handle: provider.rumApplicationHandler.DeleteSourceMap, verb: coretypes.VerbUpdate, roles: managers, openAPIDef: handler.OpenAPIDef{
			ID: "DeleteRUMSourceMap", Summary: "Delete RUM source map", Description: "Deletes one source map file.",
			SuccessStatusCode: http.StatusNoContent, ErrorStatusCodes: notFound,
		}},
	}
}
