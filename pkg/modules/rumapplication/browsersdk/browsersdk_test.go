package browsersdk

import (
	"crypto/sha512"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEmbeddedScriptMatchesManifestIntegrity(t *testing.T) {
	script, err := embedded.ReadFile(snapshotDir + "/" + ScriptFile)
	require.NoError(t, err)

	sum := sha512.Sum384(script)
	assert.Equal(t, "sha384-"+base64.StdEncoding.EncodeToString(sum[:]), Integrity())
	assert.NotEmpty(t, Version())
}

func TestScriptPath(t *testing.T) {
	assert.Equal(t, "/rum/v1/sdk/browser/1.2.3/fusescope.min.js", ScriptPath("1.2.3"))
}

func TestServe(t *testing.T) {
	router := mux.NewRouter()
	router.HandleFunc(ScriptRoute, Script).Methods(http.MethodGet, http.MethodHead)
	router.HandleFunc(SourceMapRoute, SourceMap).Methods(http.MethodGet, http.MethodHead)

	script, err := embedded.ReadFile(snapshotDir + "/" + ScriptFile)
	require.NoError(t, err)
	sourceMap, err := embedded.ReadFile(snapshotDir + "/" + SourceMapFile)
	require.NoError(t, err)

	testCases := []struct {
		name        string
		method      string
		path        string
		status      int
		contentType string
		body        []byte
	}{
		{name: "Script_CurrentVersion", method: http.MethodGet, path: ScriptPath(Version()), status: http.StatusOK, contentType: "application/javascript", body: script},
		{name: "SourceMap_CurrentVersion", method: http.MethodGet, path: ScriptPath(Version()) + ".map", status: http.StatusOK, contentType: "application/json", body: sourceMap},
		{name: "Script_Head", method: http.MethodHead, path: ScriptPath(Version()), status: http.StatusOK, contentType: "application/javascript"},
		{name: "Script_UnknownVersion", method: http.MethodGet, path: ScriptPath("0.0.1"), status: http.StatusNotFound},
		{name: "SourceMap_UnknownVersion", method: http.MethodGet, path: ScriptPath("9.9.9-rc.1") + ".map", status: http.StatusNotFound},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(testCase.method, testCase.path, nil))

			require.Equal(t, testCase.status, recorder.Code)
			if testCase.status != http.StatusOK {
				assert.NotContains(t, recorder.Header().Get("Cache-Control"), "immutable")
				return
			}
			assert.Equal(t, testCase.contentType, recorder.Header().Get("Content-Type"))
			assert.Equal(t, "public, max-age=31536000, immutable", recorder.Header().Get("Cache-Control"))
			assert.Equal(t, "*", recorder.Header().Get("Access-Control-Allow-Origin"))
			assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
			if testCase.body == nil {
				assert.Empty(t, recorder.Body.Bytes())
				return
			}
			assert.Equal(t, testCase.body, recorder.Body.Bytes())
		})
	}
}
