package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetVersionCommunityBuild(t *testing.T) {
	testCases := []struct {
		name           string
		setupCompleted bool
	}{
		{name: "SetupCompleted_NotEnterprise", setupCompleted: true},
		{name: "SetupPending_NotEnterprise", setupCompleted: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			handler := &APIHandler{SetupCompleted: testCase.setupCompleted}
			recorder := httptest.NewRecorder()
			handler.getVersion(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/version", nil))

			response := model.GetVersionResponse{}
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			assert.Equal(t, "N", response.EE)
			assert.Equal(t, testCase.setupCompleted, response.SetupCompleted)
		})
	}
}
