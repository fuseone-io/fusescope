package signozapiserver

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication/browsersdk"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication/implrumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/coretypes"
)

func TestRUMRoutesAccess(t *testing.T) {
	managers := []string{authtypes.SigNozAdminRoleName, authtypes.SigNozEditorRoleName}
	readers := []string{authtypes.SigNozAdminRoleName, authtypes.SigNozEditorRoleName, authtypes.SigNozViewerRoleName}

	testCases := []struct {
		name  string
		verb  coretypes.Verb
		roles []string
	}{
		{name: "ListRUMApplications", verb: coretypes.VerbList, roles: readers},
		{name: "GetRUMApplication", verb: coretypes.VerbRead, roles: readers},
		{name: "GetRUMApplicationStatus", verb: coretypes.VerbRead, roles: readers},
		{name: "CreateRUMApplication", verb: coretypes.VerbCreate, roles: managers},
		{name: "UpdateRUMApplication", verb: coretypes.VerbUpdate, roles: managers},
		{name: "DeleteRUMApplication", verb: coretypes.VerbDelete, roles: managers},
		{name: "ListRUMApplicationKeys", verb: coretypes.VerbRead, roles: managers},
		{name: "CreateRUMApplicationKey", verb: coretypes.VerbUpdate, roles: managers},
		{name: "RotateRUMApplicationKey", verb: coretypes.VerbUpdate, roles: managers},
		{name: "RevokeRUMApplicationKey", verb: coretypes.VerbUpdate, roles: managers},
		{name: "ListRUMViews", verb: coretypes.VerbRead, roles: readers},
		{name: "GetRUMView", verb: coretypes.VerbRead, roles: readers},
		{name: "ListRUMErrorGroups", verb: coretypes.VerbRead, roles: readers},
		{name: "GetRUMErrorGroup", verb: coretypes.VerbRead, roles: readers},
		{name: "ListRUMSessions", verb: coretypes.VerbRead, roles: readers},
		{name: "GetRUMSession", verb: coretypes.VerbRead, roles: readers},
		{name: "UploadRUMSourceMaps", verb: coretypes.VerbUpdate, roles: managers},
		{name: "UploadRUMR8Mapping", verb: coretypes.VerbUpdate, roles: managers},
		{name: "ListRUMSourceMaps", verb: coretypes.VerbRead, roles: readers},
		{name: "DeleteRUMSourceMaps", verb: coretypes.VerbUpdate, roles: managers},
		{name: "DeleteRUMSourceMap", verb: coretypes.VerbUpdate, roles: managers},
	}

	routes := map[string]rumRoute{}
	for _, route := range (&provider{rumApplicationHandler: implrumapplication.NewHandler(nil)}).rumRoutes() {
		routes[route.openAPIDef.ID] = route
	}
	require.Len(t, routes, len(testCases))

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			route, ok := routes[testCase.name]
			require.True(t, ok)
			assert.Equal(t, testCase.verb, route.verb)
			assert.Equal(t, testCase.roles, route.roles)
		})
	}
}

func TestRUMBrowserSDKRoutesArePublic(t *testing.T) {
	router := mux.NewRouter()
	require.NoError(t, addRUMBrowserSDKRoutes(router))

	testCases := []struct {
		name   string
		method string
		path   string
		status int
	}{
		{name: "Script_Get", method: http.MethodGet, path: browsersdk.ScriptPath(browsersdk.Version()), status: http.StatusOK},
		{name: "Script_Head", method: http.MethodHead, path: browsersdk.ScriptPath(browsersdk.Version()), status: http.StatusOK},
		{name: "SourceMap_Get", method: http.MethodGet, path: browsersdk.ScriptPath(browsersdk.Version()) + ".map", status: http.StatusOK},
		{name: "Script_UnknownVersion", method: http.MethodGet, path: browsersdk.ScriptPath("0.0.0"), status: http.StatusNotFound},
		{name: "Script_Post", method: http.MethodPost, path: browsersdk.ScriptPath(browsersdk.Version()), status: http.StatusMethodNotAllowed},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(testCase.method, testCase.path, nil))
			assert.Equal(t, testCase.status, recorder.Code)
		})
	}
}
