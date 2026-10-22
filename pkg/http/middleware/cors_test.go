package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCorsExcludedPrefixes(t *testing.T) {
	testCases := []struct {
		name        string
		path        string
		reachedNext bool
		allowOrigin string
	}{
		{name: "APIPreflight_AnsweredByCors", path: "/api/v1/rum/applications", reachedNext: false, allowOrigin: "*"},
		{name: "ExcludedPreflight_PassedThrough", path: "/rum/v1/traces", reachedNext: true, allowOrigin: ""},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			reached := false
			next := http.HandlerFunc(func(rw http.ResponseWriter, _ *http.Request) {
				reached = true
				rw.WriteHeader(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodOptions, testCase.path, nil)
			req.Header.Set("Origin", "https://shop.example.com")
			req.Header.Set("Access-Control-Request-Method", http.MethodPost)
			recorder := httptest.NewRecorder()

			NewCors("/rum/").Wrap(next).ServeHTTP(recorder, req)

			assert.Equal(t, testCase.reachedNext, reached)
			assert.Equal(t, testCase.allowOrigin, recorder.Header().Get("Access-Control-Allow-Origin"))
		})
	}
}
